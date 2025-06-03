/**
 * @fileoverview Authentication controller handling OAuth flows for Pipedrive and Xero integrations.
 * Manages CSRF tokens, authorization redirects, and token exchange for both platforms.
 * Exports functions for initiating auth flows and handling OAuth callbacks.
 */

import 'dotenv/config';
import crypto from 'crypto';
import axios from 'axios';
import * as tokenService from '../services/secureTokenService.js';
import * as pipedriveApiService from '../services/pipedriveApiService.js';

const pipedriveClientId = process.env.CLIENT_ID;
const pipedriveClientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const xeroClientId = process.env.XERO_CLIENT_ID;
const xeroRedirectUri = process.env.XERO_REDIRECT_URI;

// Frontend URLs for redirects
const frontendBaseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
const pipedriveAuthPageUrl = `${frontendBaseUrl}/auth/pipedrive`;
const pipedriveSuccessPageUrl = `${frontendBaseUrl}/auth/pipedrive/success`;
const pipedriveErrorPageUrl = `${frontendBaseUrl}/auth/pipedrive/error`;
const xeroSuccessPageUrl = `${frontendBaseUrl}/auth/xero/success`;
const xeroErrorPageUrl = `${frontendBaseUrl}/auth/xero/error`;

/**
 * Initiates the Pipedrive OAuth authorization flow by generating a CSRF token
 * and redirecting the user to the frontend auth page with the authorization URL.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {void} Redirects to frontend auth page with authorization URL
 */
export const initiatePipedriveAuth = (req, res) => {
    req.log.info('Initiating Pipedrive OAuth flow', {
        userAgent: req.get('User-Agent'),
        remoteAddress: req.ip
    });

    const csrfToken = crypto.randomBytes(18).toString('hex');
    tokenService.setCsrfTokenStore(csrfToken);

    const scopes = [
        'deals:full',
        'users:read'
    ].join(' ');

    const authorizationUrl = `https://oauth.pipedrive.com/oauth/authorize?client_id=${pipedriveClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${csrfToken}&scope=${encodeURIComponent(scopes)}`;
    
    req.log.info('Pipedrive OAuth URL generated', {
        csrfToken,
        scopes: scopes.split(' '),
        redirectUri
    });
    
    // Redirect to frontend auth page with the authorization URL
    const frontendAuthUrl = `${pipedriveAuthPageUrl}?authUrl=${encodeURIComponent(authorizationUrl)}`;
    res.redirect(frontendAuthUrl);
};

/**
 * Handles the OAuth callback from Pipedrive after user authorization.
 * Validates CSRF token, exchanges authorization code for access tokens,
 * and stores tokens for the authenticated company.
 * 
 * @param {Object} req - Express request object with query parameters (code, state)
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Redirects to frontend success or error page
 * @throws {Error} Redirects to error page for CSRF mismatch, missing code, or API errors
 */
export const handlePipedriveCallback = async (req, res) => {
    const { code, state } = req.query;
    const storedCsrfToken = tokenService.getCsrfTokenStore();

    req.log.info('Handling Pipedrive OAuth callback', {
        hasCode: !!code,
        hasState: !!state,
        stateMatches: state === storedCsrfToken
    });

    if (state !== storedCsrfToken) {
        req.log.warn('CSRF token mismatch in Pipedrive callback', {
            receivedState: state,
            expectedState: storedCsrfToken
        });
        return res.redirect(`${pipedriveErrorPageUrl}?error=${encodeURIComponent('CSRF token mismatch')}`);
    }

    if (!code) {
        req.log.error('No authorization code received in Pipedrive callback');
        return res.redirect(`${pipedriveErrorPageUrl}?error=${encodeURIComponent('Authorization code is missing')}`);
    }

    try {
        const tokenUrl = 'https://oauth.pipedrive.com/oauth/token';
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirectUri);

        const response = await axios.post(tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${pipedriveClientId}:${pipedriveClientSecret}`).toString('base64')}`
            }
        });

        const { access_token, refresh_token, expires_in, api_domain } = response.data;

        const userData = await pipedriveApiService.getPipedriveUserMe(api_domain, access_token);
        const companyIdForTokenStorage = userData.company_id.toString();

        tokenService.allCompanyTokens[companyIdForTokenStorage] = {
            accessToken: access_token,
            refreshToken: refresh_token,
            apiDomain: api_domain,
            tokenExpiresAt: Date.now() + (expires_in * 1000) - (5 * 60 * 1000) // 5-minute buffer before expiry
        };

        await tokenService.saveAllTokensToFile();

        req.log.info('Pipedrive authentication successful', {
            companyId: companyIdForTokenStorage,
            apiDomain: api_domain
        });

        // Redirect to Pipedrive after successful authentication
        res.redirect('https://www.pipedrive.com');

    } catch (error) {
        req.log.error('Error during Pipedrive OAuth callback', {
            error: error.response ? error.response.data : error.message
        });
        
        const errorMessage = error.response?.data?.error_description || error.message || 'Authentication failed';
        res.redirect(`${pipedriveErrorPageUrl}?error=${encodeURIComponent(errorMessage)}`);
    }
};

/**
 * Initiates the Xero OAuth authorization flow for a specific Pipedrive company.
 * Associates the Xero auth with a Pipedrive company via CSRF token mapping.
 * 
 * @param {Object} req - Express request object with query parameter pipedriveCompanyId
 * @param {Object} res - Express response object
 * @returns {void} Redirects to Xero authorization URL or returns 400 for missing company ID
 */
export const initiateXeroAuth = (req, res) => {
    const { pipedriveCompanyId } = req.query;

    if (!pipedriveCompanyId) {
        return res.status(400).send('Pipedrive Company ID is required to connect to Xero.');
    }

    const csrfToken = crypto.randomBytes(18).toString('hex');
    let xeroCsrfStore = tokenService.getXeroCsrfTokenStore();
    xeroCsrfStore[csrfToken] = pipedriveCompanyId;
    tokenService.setXeroCsrfTokenStore(xeroCsrfStore);

    const scopes = [
        'openid',
        'profile',
        'email',
        'accounting.contacts',
        'accounting.transactions',
        'projects',
        'offline_access'
    ].join(' ');

    const authorizationUrl = `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${xeroClientId}&redirect_uri=${encodeURIComponent(xeroRedirectUri)}&scope=${encodeURIComponent(scopes)}&state=${csrfToken}`;
    res.redirect(authorizationUrl);
};

/**
 * Handles the OAuth callback from Xero after user authorization.
 * Validates CSRF token, exchanges authorization code for access tokens,
 * retrieves tenant information, and stores tokens linked to Pipedrive company.
 * 
 * @param {Object} req - Express request object with query parameters (code, state)
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Redirects to frontend success or error page
 * @throws {Error} Redirects to error page for CSRF mismatch, missing code, or API errors
 */
export const handleXeroCallback = async (req, res) => {
    const { code, state } = req.query;
    let xeroCsrfStore = tokenService.getXeroCsrfTokenStore();
    const pipedriveCompanyId = xeroCsrfStore[state];

    req.log.info('Handling Xero OAuth callback', {
        hasCode: !!code,
        hasState: !!state,
        pipedriveCompanyId: pipedriveCompanyId
    });

    if (!pipedriveCompanyId) {
        req.log.error('CSRF token mismatch or Pipedrive Company ID not found for state:', state);
        return res.redirect(`${xeroErrorPageUrl}?error=${encodeURIComponent('CSRF token mismatch or session expired')}`);
    }
    delete xeroCsrfStore[state];
    tokenService.setXeroCsrfTokenStore(xeroCsrfStore);

    if (!code) {
        req.log.error('No authorization code received in Xero callback');
        return res.redirect(`${xeroErrorPageUrl}?error=${encodeURIComponent('Authorization code is missing from Xero callback')}`);
    }

    try {
        const tokenUrl = 'https://identity.xero.com/connect/token';
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', xeroRedirectUri);

        const basicAuth = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64');

        const tokenResponse = await axios.post(tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${basicAuth}`
            }
        });

        const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;
        
        const connections = await (await import('../services/xeroApiService.js')).getXeroConnections(access_token);
        const tenantId = connections[0].tenantId;

        tokenService.allXeroTokens[pipedriveCompanyId] = {
            accessToken: access_token,
            refreshToken: refresh_token,
            tokenExpiresAt: Date.now() + (expires_in * 1000) - (5 * 60 * 1000), // 5-minute buffer before expiry
            tenantId: tenantId,
            scopes: scope
        };

        await tokenService.saveAllXeroTokensToFile();

        req.log.info('Xero authentication successful', {
            pipedriveCompanyId: pipedriveCompanyId,
            tenantId: tenantId
        });

        // Redirect to success page with company and tenant info
        const successUrl = `${xeroSuccessPageUrl}?companyId=${encodeURIComponent(pipedriveCompanyId)}&tenantId=${encodeURIComponent(tenantId)}`;
        res.redirect(successUrl);

    } catch (error) {
        req.log.error('Error during Xero OAuth callback', {
            pipedriveCompanyId: pipedriveCompanyId,
            error: error.response ? error.response.data : error.message
        });
        
        const errorMessage = error.response?.data?.error_description || error.message || 'Xero authentication failed';
        res.redirect(`${xeroErrorPageUrl}?error=${encodeURIComponent(errorMessage)}&companyId=${encodeURIComponent(pipedriveCompanyId || '')}`);
    }
};

/**
 * Gets the Pipedrive authorization URL without redirecting.
 * Useful for frontend to get the auth URL via API call.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {void} Returns JSON with authorization URL
 */
export const getPipedriveAuthUrl = (req, res) => {
    req.log.info('Generating Pipedrive OAuth URL for frontend', {
        userAgent: req.get('User-Agent')
    });

    const csrfToken = crypto.randomBytes(18).toString('hex');
    tokenService.setCsrfTokenStore(csrfToken);

    const scopes = [
        'deals:full',
        'users:read'
    ].join(' ');

    const authorizationUrl = `https://oauth.pipedrive.com/oauth/authorize?client_id=${pipedriveClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${csrfToken}&scope=${encodeURIComponent(scopes)}`;
    
    req.log.info('Pipedrive OAuth URL generated for API response', {
        csrfToken,
        scopes: scopes.split(' ')
    });
    
    res.json({
        success: true,
        authUrl: authorizationUrl,
        csrfToken: csrfToken,
        scopes: scopes.split(' ')
    });
};

/**
 * Checks the authentication status for a specific company.
 * Returns information about Pipedrive and Xero authentication status.
 * 
 * @param {Object} req - Express request object with query parameter companyId
 * @param {Object} res - Express response object
 * @returns {void} Returns JSON with authentication status
 */
export const checkAuthStatus = (req, res) => {
    // Support companyId from query or request body for POST and GET
    const companyId = req.query.companyId || req.body.companyId;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            error: 'Company ID is required',
            message: 'Please provide companyId as a query parameter (?companyId=123) or in the request body',
            example: {
                queryParameter: '/auth/check-auth?companyId=123',
                requestBody: '{ "companyId": "123" }'
            }
        });
    }

    const pipedriveTokens = tokenService.allCompanyTokens[companyId];
    const xeroTokens = tokenService.allXeroTokens[companyId];

    const currentTime = Date.now();

    const authStatus = {
        companyId: companyId,
        pipedrive: {
            authenticated: !!(pipedriveTokens && pipedriveTokens.accessToken),
            tokenExpired: pipedriveTokens ? currentTime >= pipedriveTokens.tokenExpiresAt : true,
            apiDomain: pipedriveTokens?.apiDomain || null
        },
        xero: {
            authenticated: !!(xeroTokens && xeroTokens.accessToken),
            tokenExpired: xeroTokens ? currentTime >= xeroTokens.tokenExpiresAt : true,
            tenantId: xeroTokens?.tenantId || null
        }
    };

    // Check if tokens need refresh
    authStatus.pipedrive.needsRefresh = authStatus.pipedrive.authenticated && authStatus.pipedrive.tokenExpired;
    authStatus.xero.needsRefresh = authStatus.xero.authenticated && authStatus.xero.tokenExpired;

    req.log.info('Auth status checked', {
        companyId,
        pipedriveAuth: authStatus.pipedrive.authenticated,
        xeroAuth: authStatus.xero.authenticated,
        pipedriveExpired: authStatus.pipedrive.tokenExpired,
        xeroExpired: authStatus.xero.tokenExpired
    });

    res.json({
        success: true,
        data: authStatus
    });
};

/**
 * Initiates logout by clearing tokens for a specific company.
 * 
 * @param {Object} req - Express request object with body parameter companyId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON success response
 */
export const logout = async (req, res) => {
    const { companyId } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            error: 'Company ID is required'
        });
    }

    try {
        // Clear tokens
        if (tokenService.allCompanyTokens[companyId]) {
            delete tokenService.allCompanyTokens[companyId];
        }
        if (tokenService.allXeroTokens[companyId]) {
            delete tokenService.allXeroTokens[companyId];
        }

        // Save updated token files
        await tokenService.saveAllTokensToFile();
        await tokenService.saveAllXeroTokensToFile();

        req.log.info('User logged out successfully', {
            companyId
        });

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        req.log.error('Error during logout', {
            companyId,
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: 'Failed to logout'
        });
    }
};
