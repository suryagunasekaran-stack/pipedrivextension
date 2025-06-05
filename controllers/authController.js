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
import logger from '../lib/logger.js';

const pipedriveClientId = process.env.CLIENT_ID;
const pipedriveClientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const xeroClientId = process.env.XERO_CLIENT_ID;
const xeroRedirectUri = process.env.XERO_REDIRECT_URI;

// Frontend URLs for redirects
const frontendBaseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:3001';
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
    logger.info({
        operation: 'Initiate Pipedrive Auth',
        userAgent: req.get('User-Agent'),
        remoteAddress: req.ip
    }, '🚀 Initiating Pipedrive OAuth flow');

    const csrfToken = crypto.randomBytes(18).toString('hex');
    tokenService.setCsrfTokenStore(csrfToken);

    const scopes = [
        'deals:full',
        'users:read'
    ].join(' ');

    const authorizationUrl = `https://oauth.pipedrive.com/oauth/authorize?client_id=${pipedriveClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${csrfToken}&scope=${encodeURIComponent(scopes)}`;
    
    logger.info({
        operation: 'Pipedrive Auth URL Generated',
        csrfToken,
        scopes: scopes.split(' '),
        redirectUri
    }, '🔗 Pipedrive OAuth URL generated');
    
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

    logger.info({
        operation: 'Handle Pipedrive Callback',
        hasCode: !!code,
        hasState: !!state,
        stateMatches: state === storedCsrfToken
    }, '🔄 Handling Pipedrive OAuth callback');

    if (state !== storedCsrfToken) {
        logger.warn({
            operation: 'CSRF Mismatch',
            receivedState: state,
            expectedState: storedCsrfToken
        }, '⚠️ CSRF token mismatch in Pipedrive callback');
        return res.redirect(`${pipedriveErrorPageUrl}?error=${encodeURIComponent('CSRF token mismatch')}`);
    }

    if (!code) {
        logger.error({
            operation: 'Missing Auth Code'
        }, '❌ No authorization code received in Pipedrive callback');
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

        // Store token using the new database-backed approach
        await tokenService.storeAuthToken(companyIdForTokenStorage, 'pipedrive', {
            accessToken: access_token,
            refreshToken: refresh_token,
            apiDomain: api_domain,
            tokenExpiresAt: Date.now() + (expires_in * 1000) - (5 * 60 * 1000) // 5-minute buffer before expiry
        });

        logger.info({
            operation: 'Pipedrive Auth Success',
            companyId: companyIdForTokenStorage,
            apiDomain: api_domain
        }, '✅ Pipedrive authentication successful');

        // Redirect to success page after successful authentication
        res.redirect(`${pipedriveSuccessPageUrl}?companyId=${encodeURIComponent(companyIdForTokenStorage)}`);

    } catch (error) {
        logger.error({
            operation: 'Pipedrive Auth Error',
            error: error.response ? error.response.data : error.message
        }, `❌ Error during Pipedrive OAuth callback: ${error.message}`);
        
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
        logger.warn({
            operation: 'Xero Auth Missing Company ID'
        }, '⚠️ Pipedrive Company ID is required to connect to Xero');
        return res.status(400).send('Pipedrive Company ID is required to connect to Xero.');
    }

    logger.info({
        operation: 'Initiate Xero Auth',
        pipedriveCompanyId
    }, '🚀 Initiating Xero OAuth flow');

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
    
    logger.info({
        operation: 'Xero Auth URL Generated',
        csrfToken,
        scopes: scopes.split(' ')
    }, '🔗 Xero OAuth URL generated');
    
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

    logger.info({
        operation: 'Handle Xero Callback',
        hasCode: !!code,
        hasState: !!state,
        pipedriveCompanyId: pipedriveCompanyId
    }, '🔄 Handling Xero OAuth callback');

    if (!pipedriveCompanyId) {
        logger.error({
            operation: 'Xero CSRF Mismatch',
            state
        }, '❌ CSRF token mismatch or Pipedrive Company ID not found');
        return res.redirect(`${xeroErrorPageUrl}?error=${encodeURIComponent('CSRF token mismatch or session expired')}`);
    }
    delete xeroCsrfStore[state];
    tokenService.setXeroCsrfTokenStore(xeroCsrfStore);

    if (!code) {
        logger.error({
            operation: 'Xero Missing Auth Code'
        }, '❌ No authorization code received in Xero callback');
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

        // Store Xero tokens using the secure token service
        await tokenService.storeAuthToken(pipedriveCompanyId, 'xero', {
            accessToken: access_token,
            refreshToken: refresh_token,
            tokenExpiresAt: Date.now() + (expires_in * 1000) - (5 * 60 * 1000), // 5-minute buffer before expiry
            tenantId: tenantId
        });

        logger.info({
            operation: 'Xero Auth Success',
            pipedriveCompanyId: pipedriveCompanyId,
            tenantId: tenantId
        }, '✅ Xero authentication successful');

        // Redirect to success page with company and tenant info
        const successUrl = `${xeroSuccessPageUrl}?companyId=${encodeURIComponent(pipedriveCompanyId)}&tenantId=${encodeURIComponent(tenantId)}`;
        res.redirect(successUrl);

    } catch (error) {
        logger.error({
            operation: 'Xero Auth Error',
            pipedriveCompanyId: pipedriveCompanyId,
            error: error.response ? error.response.data : error.message
        }, `❌ Error during Xero OAuth callback: ${error.message}`);
        
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
    logger.info({
        operation: 'Generate Pipedrive Auth URL',
        userAgent: req.get('User-Agent')
    }, '🔗 Generating Pipedrive OAuth URL for frontend');

    const csrfToken = crypto.randomBytes(18).toString('hex');
    tokenService.setCsrfTokenStore(csrfToken);

    const scopes = [
        'deals:full',
        'users:read'
    ].join(' ');

    const authorizationUrl = `https://oauth.pipedrive.com/oauth/authorize?client_id=${pipedriveClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${csrfToken}&scope=${encodeURIComponent(scopes)}`;
    
    logger.info({
        operation: 'Pipedrive Auth URL Generated',
        csrfToken,
        scopes: scopes.split(' ')
    }, '✅ Pipedrive OAuth URL generated for API response');
    
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
 * @returns {Promise<void>} Returns JSON with authentication status
 */
export const checkAuthStatus = async (req, res) => {
    // Support companyId from query or request body for POST and GET
    const companyId = req.query.companyId || req.body.companyId;

    if (!companyId) {
        logger.warn({
            operation: 'Check Auth Status - Missing Company ID'
        }, '⚠️ Company ID is required for auth status check');
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

    try {
        // Get tokens from database
        const pipedriveToken = await tokenService.getAuthToken(companyId, 'pipedrive');
        const xeroToken = await tokenService.getAuthToken(companyId, 'xero');

        const currentTime = Date.now();

        const authStatus = {
            companyId: companyId,
            pipedrive: {
                authenticated: !!(pipedriveToken && pipedriveToken.accessToken),
                tokenExpired: pipedriveToken ? currentTime >= pipedriveToken.tokenExpiresAt : true,
                apiDomain: pipedriveToken?.apiDomain || null
            },
            xero: {
                authenticated: !!(xeroToken && xeroToken.accessToken),
                tokenExpired: xeroToken ? currentTime >= xeroToken.tokenExpiresAt : true,
                tenantId: xeroToken?.tenantId || null
            }
        };

        // Check if tokens need refresh
        authStatus.pipedrive.needsRefresh = authStatus.pipedrive.authenticated && authStatus.pipedrive.tokenExpired;
        authStatus.xero.needsRefresh = authStatus.xero.authenticated && authStatus.xero.tokenExpired;

        logger.info({
            operation: 'Auth Status Check',
            companyId,
            pipedriveAuth: authStatus.pipedrive.authenticated,
            xeroAuth: authStatus.xero.authenticated,
            pipedriveExpired: authStatus.pipedrive.tokenExpired,
            xeroExpired: authStatus.xero.tokenExpired
        }, '✅ Auth status checked successfully');

        res.json({
            success: true,
            data: authStatus
        });
    } catch (error) {
        logger.error({
            operation: 'Auth Status Check Error',
            companyId,
            error: error.message
        }, `❌ Error checking auth status: ${error.message}`);

        res.status(500).json({
            success: false,
            error: 'Failed to check authentication status'
        });
    }
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
        logger.warn({
            operation: 'Logout - Missing Company ID'
        }, '⚠️ Company ID is required for logout');
        return res.status(400).json({
            success: false,
            error: 'Company ID is required'
        });
    }

    try {
        // Deactivate tokens in database
        await tokenService.deactivateAuthToken(companyId, 'pipedrive');
        await tokenService.deactivateAuthToken(companyId, 'xero');

        logger.info({
            operation: 'User Logout',
            companyId
        }, '✅ User logged out successfully');

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        logger.error({
            operation: 'Logout Error',
            companyId,
            error: error.message
        }, `❌ Error during logout: ${error.message}`);

        res.status(500).json({
            success: false,
            error: 'Failed to logout'
        });
    }
};
