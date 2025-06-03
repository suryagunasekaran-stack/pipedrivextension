import 'dotenv/config';
import crypto from 'crypto';
import axios from 'axios';
import * as tokenService from '../services/tokenService.js'; // Added .js and changed import style
import * as pipedriveApiService from '../services/pipedriveApiService.js'; // Added .js and changed import style

const pipedriveClientId = process.env.CLIENT_ID;
const pipedriveClientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const xeroClientId = process.env.XERO_CLIENT_ID;
const xeroRedirectUri = process.env.XERO_REDIRECT_URI;

export const initiatePipedriveAuth = (req, res) => {
    req.log.info('Initiating Pipedrive OAuth flow', {
        userAgent: req.get('User-Agent'),
        remoteAddress: req.ip
    });

    const csrfToken = crypto.randomBytes(18).toString('hex');
    tokenService.setCsrfTokenStore(csrfToken); // Store CSRF token

    // Define the required scopes
    const scopes = [
        'deals:full', // Allows reading, adding, updating, and deleting deals
        'users:read'  // Allows reading users data (needed for /users/me)
        // Add other scopes your app might need in the future, e.g., 'organizations:full', 'persons:full'
    ].join(' ');

    const authorizationUrl = `https://oauth.pipedrive.com/oauth/authorize?client_id=${pipedriveClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${csrfToken}&scope=${encodeURIComponent(scopes)}`;
    
    req.log.info('Pipedrive OAuth URL generated', {
        csrfToken,
        scopes: scopes.split(' '),
        redirectUri
    });
    
    res.send(`<h1>Pipedrive OAuth Example</h1><a href="${authorizationUrl}">Connect to Pipedrive</a>`);
};

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
        return res.status(403).send('CSRF token mismatch');
    }

    if (!code) {
        req.log.error('No authorization code received in Pipedrive callback');
        return res.status(400).send('Authorization code is missing');
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
            tokenExpiresAt: Date.now() + (expires_in * 1000) - (5 * 60 * 1000)
        };

        await tokenService.saveAllTokensToFile();

        res.send(`<h1>Authentication Successful for Company ID: ${companyIdForTokenStorage}!</h1><p>Tokens stored. You can now use the app action.</p>`);

    } catch (error) {
        console.error('Error during Pipedrive OAuth callback:', error.response ? error.response.data : error.message);
        res.status(500).send('Error during Pipedrive authentication process.');
    }
};

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

export const handleXeroCallback = async (req, res) => {
    const { code, state } = req.query;
    let xeroCsrfStore = tokenService.getXeroCsrfTokenStore();
    const pipedriveCompanyId = xeroCsrfStore[state];

    if (!pipedriveCompanyId) {
        console.error('CSRF token mismatch or Pipedrive Company ID not found for state:', state);
        return res.status(403).send('CSRF token mismatch or session expired.');
    }
    delete xeroCsrfStore[state];
    tokenService.setXeroCsrfTokenStore(xeroCsrfStore);

    if (!code) {
        return res.status(400).send('Authorization code is missing from Xero callback.');
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
        
        const connections = await (await import('../services/xeroApiService.js')).getXeroConnections(access_token); // Dynamic import for xeroApiService
        const tenantId = connections[0].tenantId;

        tokenService.allXeroTokens[pipedriveCompanyId] = {
            accessToken: access_token,
            refreshToken: refresh_token,
            tokenExpiresAt: Date.now() + (expires_in * 1000) - (5 * 60 * 1000),
            tenantId: tenantId,
            scopes: scope
        };

        await tokenService.saveAllXeroTokensToFile();

        res.send(`<h1>Xero Authentication Successful for Pipedrive Company ID: ${pipedriveCompanyId}!</h1><p>Xero Tenant ID: ${tenantId}. You can close this window.</p>`);

    } catch (error) {
        console.error('Error during Xero OAuth callback:', error.response ? error.response.data : error.message);
        if (error.response && error.response.data && error.response.data.error_description) {
            return res.status(500).send(`Error during Xero authentication: ${error.response.data.error_description}`);
        }
        res.status(500).send('Error during Xero authentication process.');
    }
};
