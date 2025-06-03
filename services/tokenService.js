import 'dotenv/config';
import fs from 'fs/promises'; // Changed to import fs from 'fs/promises'
import path from 'path'; // Changed to import path from 'path'
import axios from 'axios'; // Changed to import axios from 'axios'
import crypto from 'crypto'; // Changed to import crypto from 'crypto'

const __dirname = path.dirname(new URL(import.meta.url).pathname); // Define __dirname for ES modules

const pipedriveClientId = process.env.CLIENT_ID;
const pipedriveClientSecret = process.env.CLIENT_SECRET;
const xeroClientId = process.env.XERO_CLIENT_ID;
const xeroClientSecret = process.env.XERO_CLIENT_SECRET;

const TOKEN_FILE_PATH = path.join(__dirname, '..', 'tokens.json');
const XERO_TOKEN_FILE_PATH = path.join(__dirname, '..', 'xero_tokens.json');

export let allCompanyTokens = {}; // { companyId: { accessToken, refreshToken, tokenExpiresAt, apiDomain } }
export let allXeroTokens = {}; // { pipedriveCompanyId: { accessToken, refreshToken, tokenExpiresAt, tenantId, scopes } }
export let csrfTokenStore = ''; // For Pipedrive OAuth
let xeroCsrfTokenStoreInternal = {}; // { csrfToken: pipedriveCompanyId } For Xero OAuth

export async function saveAllTokensToFile() {
    try {
        const data = JSON.stringify(allCompanyTokens, null, 2);
        await fs.writeFile(TOKEN_FILE_PATH, data);
    } catch (error) {
        console.error('Error saving Pipedrive company tokens to file:', error);
    }
}

export async function loadAllTokensFromFile() {
    try {
        const data = await fs.readFile(TOKEN_FILE_PATH);
        allCompanyTokens = JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Pipedrive token file not found. Proceeding with empty tokens store.
        } else {
            console.error('Error loading Pipedrive company tokens from file:', error);
        }
        allCompanyTokens = {}; // Initialize if file not found or error
    }
}

export async function saveAllXeroTokensToFile() {
    try {
        const data = JSON.stringify(allXeroTokens, null, 2);
        await fs.writeFile(XERO_TOKEN_FILE_PATH, data);
    } catch (error) {
        console.error('Error saving Xero tokens to file:', error);
    }
}

export async function loadAllXeroTokensFromFile() {
    try {
        const data = await fs.readFile(XERO_TOKEN_FILE_PATH);
        allXeroTokens = JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Xero token file not found. Proceeding with empty Xero tokens store.
        } else {
            console.error('Error loading Xero tokens from file:', error);
        }
        allXeroTokens = {}; // Initialize if file not found or error
    }
}

export async function refreshPipedriveToken(companyId) {
    const companyTokens = allCompanyTokens[companyId];
    if (!companyTokens || !companyTokens.refreshToken) {
        throw new Error(`Pipedrive refresh token not available for company ${companyId}.`);
    }

    try {
        const tokenUrl = 'https://oauth.pipedrive.com/oauth/token';
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', companyTokens.refreshToken);

        const response = await axios.post(tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${pipedriveClientId}:${pipedriveClientSecret}`).toString('base64')}`
            }
        });

        const { access_token, refresh_token, expires_in } = response.data;

        allCompanyTokens[companyId].accessToken = access_token;
        if (refresh_token) {
            allCompanyTokens[companyId].refreshToken = refresh_token;
        }
        allCompanyTokens[companyId].tokenExpiresAt = Date.now() + (expires_in * 1000) - (5 * 60 * 1000);
        
        await saveAllTokensToFile();
        return allCompanyTokens[companyId];
    } catch (error) {
        console.error(`Error refreshing Pipedrive token for company ${companyId}:`, error.response ? error.response.data : error.message);
        if (error.response && (error.response.status === 400 || error.response.status === 401)) {
            delete allCompanyTokens[companyId].refreshToken;
            allCompanyTokens[companyId].accessToken = null;
            await saveAllTokensToFile();
        }
        throw new Error(`Failed to refresh Pipedrive token for company ${companyId}.`);
    }
}

export async function refreshXeroToken(pipedriveCompanyId) {
    const xeroTokenInfo = allXeroTokens[pipedriveCompanyId];
    if (!xeroTokenInfo || !xeroTokenInfo.refreshToken) {
        throw new Error('Xero refresh token not available.');
    }

    try {
        const tokenUrl = 'https://identity.xero.com/connect/token';
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', xeroTokenInfo.refreshToken);

        const basicAuth = Buffer.from(`${xeroClientId}:${xeroClientSecret}`).toString('base64');

        const response = await axios.post(tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${basicAuth}`
            }
        });

        const { access_token, refresh_token, expires_in } = response.data;
        
        allXeroTokens[pipedriveCompanyId].accessToken = access_token;
        allXeroTokens[pipedriveCompanyId].refreshToken = refresh_token;
        allXeroTokens[pipedriveCompanyId].tokenExpiresAt = Date.now() + (expires_in * 1000) - (5 * 60 * 1000);
        
        await saveAllXeroTokensToFile();
        return allXeroTokens[pipedriveCompanyId];
    } catch (error) {
        console.error(`Error refreshing Xero token for Pipedrive Company ID ${pipedriveCompanyId}:`, error.response ? error.response.data : error.message);
        if (error.response && (error.response.status === 400 || error.response.status === 401)) {
            delete allXeroTokens[pipedriveCompanyId];
            await saveAllXeroTokensToFile();
        }
        throw new Error('Failed to refresh Xero token.');
    }
}

// Getter and Setter for xeroCsrfTokenStore to manage it internally if direct export is problematic
export const getXeroCsrfTokenStore = () => xeroCsrfTokenStoreInternal;
export const setXeroCsrfTokenStore = (store) => { xeroCsrfTokenStoreInternal = store; };
export const getCsrfTokenStore = () => csrfTokenStore;
export const setCsrfTokenStore = (token) => { csrfTokenStore = token; };

export async function getPipedriveAccessToken(companyId) {
    let companyTokens = allCompanyTokens[companyId];

    if (!companyTokens || !companyTokens.accessToken) {
        try {
            companyTokens = await refreshPipedriveToken(companyId);
        } catch (error) {
            console.error(`Failed to obtain Pipedrive token for company ${companyId} after attempting refresh:`, error.message);
            return null; // Or throw error, depending on desired handling
        }
    }

    // Check if the token is expired or close to expiring (e.g., within 5 minutes)
    const now = Date.now();
    if (companyTokens.tokenExpiresAt && now >= companyTokens.tokenExpiresAt) {
        try {
            companyTokens = await refreshPipedriveToken(companyId);
        } catch (error) {
            console.error(`Failed to refresh Pipedrive token for company ${companyId}:`, error.message);
            return null; // Or throw error
        }
    }
    return companyTokens ? companyTokens.accessToken : null;
}
