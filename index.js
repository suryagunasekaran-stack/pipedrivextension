require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors'); // Add this

const app = express();

// Enable CORS - configure appropriately for production
app.use(cors({
    origin: 'http://localhost:3001' // Allow requests from your Next.js app's origin
}));

const port = process.env.PORT || 3000;

const pipedriveClientId = process.env.CLIENT_ID;
const pipedriveClientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// Xero OAuth Configuration
const xeroClientId = process.env.XERO_CLIENT_ID;
const xeroClientSecret = process.env.XERO_CLIENT_SECRET;
const xeroRedirectUri = process.env.XERO_REDIRECT_URI; // Make sure this is in your .env

let allCompanyTokens = {}; // New: Stores tokens for multiple companies { companyId: { accessToken, refreshToken, tokenExpiresAt, apiDomain } }
const TOKEN_FILE_PATH = path.join(__dirname, 'tokens.json');

// Xero Token Storage
let allXeroTokens = {}; // { pipedriveCompanyId: { accessToken, refreshToken, tokenExpiresAt, tenantId, scopes } }
const XERO_TOKEN_FILE_PATH = path.join(__dirname, 'xero_tokens.json');
let xeroCsrfTokenStore = {}; // Temporary store for CSRF token: { csrfToken: pipedriveCompanyId }

// Function to save all company tokens to a file
async function saveAllTokensToFile() {
    try {
        const data = JSON.stringify(allCompanyTokens, null, 2); // Save the entire allCompanyTokens object
        await fs.writeFile(TOKEN_FILE_PATH, data);
        console.log('All company tokens saved to file.');
    } catch (error) {
        console.error('Error saving all company tokens to file:', error);
    }
}

// Function to load all company tokens from a file
async function loadAllTokensFromFile() {
    try {
        const data = await fs.readFile(TOKEN_FILE_PATH);
        allCompanyTokens = JSON.parse(data); // Load the entire allCompanyTokens object
        console.log('All company tokens loaded from file.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Token file not found. Proceeding with empty tokens store.');
            allCompanyTokens = {}; // Initialize if file not found
        } else {
            console.error('Error loading all company tokens from file:', error);
            allCompanyTokens = {}; // Initialize on other errors to prevent crash
        }
    }
}

// Function to save all Xero tokens to a file
async function saveAllXeroTokensToFile() {
    try {
        const data = JSON.stringify(allXeroTokens, null, 2);
        await fs.writeFile(XERO_TOKEN_FILE_PATH, data);
        console.log('All Xero tokens saved to file.');
    } catch (error) {
        console.error('Error saving Xero tokens to file:', error);
    }
}

// Function to load all Xero tokens from a file
async function loadAllXeroTokensFromFile() {
    try {
        const data = await fs.readFile(XERO_TOKEN_FILE_PATH);
        allXeroTokens = JSON.parse(data);
        console.log('All Xero tokens loaded from file.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Xero token file not found. Proceeding with empty Xero tokens store.');
            allXeroTokens = {};
        } else {
            console.error('Error loading Xero tokens from file:', error);
            allXeroTokens = {};
        }
    }
}

// --- End Token Storage ---

// In-memory store for the CSRF token (in a real app, use a session store)
let csrfTokenStore = '';

app.get('/', (req, res) => {
    // Generate a random string for CSRF protection
    const csrfToken = crypto.randomBytes(18).toString('hex');
    csrfTokenStore = csrfToken;

    const authorizationUrl = `https://oauth.pipedrive.com/oauth/authorize?client_id=${pipedriveClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${csrfToken}`;
    res.send(`<h1>Pipedrive OAuth Example</h1><a href="${authorizationUrl}">Connect to Pipedrive</a>`);
});

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    // Verify CSRF token
    if (state !== csrfTokenStore) {
        return res.status(403).send('CSRF token mismatch');
    }

    if (!code) {
        return res.status(400).send('Authorization code is missing');
    }

    let companyIdForTokenStorage; // To store the companyId

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

        // Fetch companyId using the new access_token and api_domain
        const userMeUrl = `${api_domain}/v1/users/me`;
        const userResponse = await axios.get(userMeUrl, {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        if (!userResponse.data || !userResponse.data.data || !userResponse.data.data.company_id) {
            console.error('Could not retrieve company_id from /v1/users/me');
            return res.status(500).send('Could not identify Pipedrive company. Authentication failed.');
        }
        companyIdForTokenStorage = userResponse.data.data.company_id.toString();
        console.log(`Identified Company ID: ${companyIdForTokenStorage} for token storage.`);

        // Store tokens in the allCompanyTokens object, keyed by companyId
        allCompanyTokens[companyIdForTokenStorage] = {
            accessToken: access_token,
            refreshToken: refresh_token,
            apiDomain: api_domain,
            tokenExpiresAt: Date.now() + (expires_in * 1000) - (5 * 60 * 1000)
        };

        await saveAllTokensToFile(); // Save all tokens

        console.log(`Tokens stored for company ${companyIdForTokenStorage}:`, {
            accessToken: access_token, // Log only a part for brevity/security if needed
            apiDomain: api_domain
        });

        res.send(`<h1>Authentication Successful for Company ID: ${companyIdForTokenStorage}!</h1><p>Tokens stored. You can now use the app action.</p>`);

    } catch (error) {
        console.error('Error during OAuth callback or fetching user/me:', error.response ? error.response.data : error.message);
        res.status(500).send('Error during authentication process.');
    }
});

// Xero OAuth Routes
app.get('/connect-xero', (req, res) => {
    const { pipedriveCompanyId } = req.query; // Pass Pipedrive companyId to link Xero connection

    if (!pipedriveCompanyId) {
        return res.status(400).send('Pipedrive Company ID is required to connect to Xero.');
    }

    const csrfToken = crypto.randomBytes(18).toString('hex');
    // Store the pipedriveCompanyId against the CSRF token to retrieve it in the callback
    // This is a simple in-memory store; for production, consider a more robust session store
    xeroCsrfTokenStore[csrfToken] = pipedriveCompanyId; 

    const scopes = [
        'openid',
        'profile',
        'email',
        'accounting.contacts',
        'accounting.transactions', // For quotes, invoices
        'offline_access' // To get a refresh token
    ].join(' ');

    const authorizationUrl = `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${xeroClientId}&redirect_uri=${encodeURIComponent(xeroRedirectUri)}&scope=${encodeURIComponent(scopes)}&state=${csrfToken}`;
    
    res.redirect(authorizationUrl);
});

app.get('/xero-callback', async (req, res) => {
    const { code, state } = req.query;

    const pipedriveCompanyId = xeroCsrfTokenStore[state];

    if (!pipedriveCompanyId) {
        console.error('CSRF token mismatch or Pipedrive Company ID not found for state:', state);
        return res.status(403).send('CSRF token mismatch or session expired.');
    }
    delete xeroCsrfTokenStore[state]; // Clean up used CSRF token

    if (!code) {
        return res.status(400).send('Authorization code is missing from Xero callback.');
    }

    try {
        const tokenUrl = 'https://identity.xero.com/connect/token';
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', xeroRedirectUri);

        const basicAuth = Buffer.from(`${xeroClientId}:${xeroClientSecret}`).toString('base64');

        const tokenResponse = await axios.post(tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${basicAuth}`
            }
        });

        const { access_token, refresh_token, expires_in, id_token, scope } = tokenResponse.data;

        // Get Xero Tenant ID(s)
        const connectionsUrl = 'https://api.xero.com/connections';
        const connectionsResponse = await axios.get(connectionsUrl, {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!connectionsResponse.data || connectionsResponse.data.length === 0) {
            return res.status(500).send('No Xero tenants found for this user. Please ensure you have an active Xero organization.');
        }

        // Assuming the user connects one Xero org. Take the first one.
        // In a multi-tenant scenario, you might let the user choose.
        const tenantId = connectionsResponse.data[0].tenantId; 

        allXeroTokens[pipedriveCompanyId] = {
            accessToken: access_token,
            refreshToken: refresh_token,
            tokenExpiresAt: Date.now() + (expires_in * 1000) - (5 * 60 * 1000), // 5 min buffer
            tenantId: tenantId,
            scopes: scope
        };

        await saveAllXeroTokensToFile();

        console.log(`Xero tokens stored for Pipedrive Company ID ${pipedriveCompanyId}, Xero Tenant ID: ${tenantId}`);
        // Redirect to a frontend page indicating success
        res.send(`<h1>Xero Authentication Successful for Pipedrive Company ID: ${pipedriveCompanyId}!</h1><p>Xero Tenant ID: ${tenantId}. You can close this window.</p>`);

    } catch (error) {
        console.error('Error during Xero OAuth callback:', error.response ? error.response.data : error.message);
        if (error.response && error.response.data && error.response.data.error_description) {
            return res.status(500).send(`Error during Xero authentication: ${error.response.data.error_description}`);
        }
        res.status(500).send('Error during Xero authentication process.');
    }
});

// New endpoint for Pipedrive App Extension
app.get('/pipedrive-action', async (req, res) => {
    const dealId = req.query.selectedIds; // Pipedrive sends deal ID as selectedIds
    const companyId = req.query.companyId; // Pipedrive sends companyId

    if (!companyId) {
        return res.status(400).send('Company ID is missing in the request from Pipedrive.');
    }

    const companyTokens = allCompanyTokens[companyId];

    if (!companyTokens || !companyTokens.accessToken) {
        return res.status(401).send(`Not authenticated for company ${companyId}. Please ensure this Pipedrive company has authorized the app.`);
    }

    let { accessToken, refreshToken, tokenExpiresAt, apiDomain } = companyTokens; // apiDomain is needed for validation

    if (Date.now() >= tokenExpiresAt) {
        try {
            const tokenUrl = 'https://oauth.pipedrive.com/oauth/token';
            const params = new URLSearchParams();
            params.append('grant_type', 'refresh_token');
            params.append('refresh_token', refreshToken);

            const refreshResponse = await axios.post(tokenUrl, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${pipedriveClientId}:${pipedriveClientSecret}`).toString('base64')}`
                }
            });

            allCompanyTokens[companyId].accessToken = refreshResponse.data.access_token;
            if (refreshResponse.data.refresh_token) {
                allCompanyTokens[companyId].refreshToken = refreshResponse.data.refresh_token;
            }
            allCompanyTokens[companyId].tokenExpiresAt = Date.now() + (refreshResponse.data.expires_in * 1000) - (5 * 60 * 1000);
            
            await saveAllTokensToFile();
            // accessToken = allCompanyTokens[companyId].accessToken; // No longer needed here
            apiDomain = allCompanyTokens[companyId].apiDomain; // Ensure apiDomain is up-to-date if it could change

        } catch (refreshError) {
            allCompanyTokens[companyId].accessToken = null; // Invalidate token on failed refresh
            await saveAllTokensToFile();
            console.error(`Failed to refresh token for company ${companyId}:`, refreshError.response ? refreshError.response.data : refreshError.message);
            return res.status(401).send(`Failed to refresh token for company ${companyId}. Please have the Pipedrive admin re-authenticate the app for this company.`);
        }
    }

    // Validate that dealId is present if the resource is a deal
    if (!dealId && req.query.resource === 'deal') {
        return res.status(400).send('Deal ID (from selectedIds) is missing for a deal resource.');
    } else if (!dealId && req.query.resource) { // General check if selectedIds is expected but missing
        return res.status(400).send('Required ID (selectedIds) is missing for the resource.');
    }
    
    // Validate apiDomain after potential refresh
    if (!apiDomain) {
        return res.status(500).send('API domain configuration missing for your company. Please re-authenticate.');
    }
        
    // Data fetching logic is removed from here.
    // The sole responsibility is to validate/refresh tokens and redirect.

    const nextJsFrontendUrl = 'http://localhost:3001/pipedrive-data-view';
    if (dealId && companyId) {
        return res.redirect(`${nextJsFrontendUrl}?dealId=${dealId}&companyId=${companyId}`);
    } else if (companyId) { // If only companyId is present (e.g., for a different action type not yet implemented)
        // Potentially redirect to a different page or handle differently
        // For now, if dealId is crucial for pipedrive-data-view, this might need adjustment
        // or the frontend needs to handle missing dealId gracefully.
        // Assuming for now that dealId is expected by the target page.
        // If dealId is not present but was expected (e.g. resource was 'deal'), an error would have been sent earlier.
        // If dealId is simply not part of this specific action, but companyId is,
        // we might redirect to a more general page or pass only companyId.
        // For the current flow focused on deals, we ensure dealId is present for the redirect.
        console.log(`Redirecting for company ${companyId}, but dealId is missing. Ensure this is handled by the frontend or action type.`);
        return res.redirect(`${nextJsFrontendUrl}?companyId=${companyId}`); // Or handle as an error if dealId is always required
    } else {
        // This case should ideally be caught by earlier checks (missing companyId or missing dealId for deal resource)
        return res.status(400).send('Cannot redirect: Missing critical parameters (dealId or companyId).');
    }
});

app.get('/api/pipedrive-data', async (req, res) => {
    const { dealId, companyId } = req.query;

    if (!dealId || !companyId) {
        return res.status(400).json({ error: 'Deal ID and Company ID are required.' });
    }

    const companyTokens = allCompanyTokens[companyId];
    if (!companyTokens || !companyTokens.accessToken) {
        return res.status(401).json({ error: `Not authenticated for company ${companyId}. Please ensure this Pipedrive company has authorized the app.` });
    }

    let { accessToken, refreshToken, tokenExpiresAt, apiDomain } = companyTokens;

    // Token refresh logic
    if (Date.now() >= tokenExpiresAt) {
        try {
            const tokenUrl = 'https://oauth.pipedrive.com/oauth/token';
            const params = new URLSearchParams();
            params.append('grant_type', 'refresh_token');
            params.append('refresh_token', refreshToken);

            const refreshResponse = await axios.post(tokenUrl, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${pipedriveClientId}:${pipedriveClientSecret}`).toString('base64')}`
                }
            });

            allCompanyTokens[companyId].accessToken = refreshResponse.data.access_token;
            if (refreshResponse.data.refresh_token) {
                allCompanyTokens[companyId].refreshToken = refreshResponse.data.refresh_token;
            }
            allCompanyTokens[companyId].tokenExpiresAt = Date.now() + (refreshResponse.data.expires_in * 1000) - (5 * 60 * 1000);
            
            await saveAllTokensToFile();
            accessToken = allCompanyTokens[companyId].accessToken; // Update local accessToken for this request
            // apiDomain is not expected to change on refresh, but ensure it's correctly scoped if it could
            apiDomain = allCompanyTokens[companyId].apiDomain;
            
        } catch (refreshError) {
            allCompanyTokens[companyId].accessToken = null;
            await saveAllTokensToFile();
            return res.status(401).json({ error: `Failed to refresh token for company ${companyId}. Please re-authenticate.` });
        }
    }
    
    if (!apiDomain) {
        return res.status(500).json({ error: 'API domain configuration missing for your company. Please re-authenticate.' });
    }

    try {
        let dealDetails = null;
        let personDetails = null;
        let organizationDetails = null;
        let dealProducts = null;

        // 1. Fetch Deal Details
        const dealDetailsUrl = `${apiDomain}/v1/deals/${dealId}`;
        const dealResponse = await axios.get(dealDetailsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        dealDetails = dealResponse.data.data;

        if (!dealDetails) {
            return res.status(404).json({ error: `Deal with ID ${dealId} not found for company ${companyId}.` });
        }

        // 2. Fetch Person (Contact) Details if person_id exists
        if (dealDetails.person_id && dealDetails.person_id.value) {
            const personId = dealDetails.person_id.value;
            const personDetailsUrl = `${apiDomain}/v1/persons/${personId}`;
            const personResponse = await axios.get(personDetailsUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            personDetails = personResponse.data.data;
        }

        // 3. Fetch Organization Details if org_id exists
        if (dealDetails.org_id && dealDetails.org_id.value) {
            const orgId = dealDetails.org_id.value;
            const orgDetailsUrl = `${apiDomain}/v1/organizations/${orgId}`;
            const orgResponse = await axios.get(orgDetailsUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            organizationDetails = orgResponse.data.data;
        }

        // 4. Fetch Deal Products
        const dealProductsUrl = `${apiDomain}/v1/deals/${dealId}/products`;
        const productsResponse = await axios.get(dealProductsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        dealProducts = productsResponse.data.data;
        
        // Send all fetched data as JSON
        res.status(200).json({
            dealDetails,
            personDetails,
            organizationDetails,
            dealProducts
        });

    } catch (apiError) {
        const status = apiError.response ? apiError.response.status : 500;
        const errorMessage = apiError.response && apiError.response.data && apiError.response.data.error 
                        ? apiError.response.data.error 
                        : `Error fetching Pipedrive data for company ${companyId}.`;
        
        if (status === 404) {
            return res.status(404).json({ error: `A required resource (deal, person, organization, or products) was not found for Deal ID ${dealId}, Company ${companyId}.` });
        } else if (status === 401 || status === 403) {
            return res.status(status).json({ error: 'Pipedrive API authentication/authorization error. Please check token and permissions.'});
        }
        res.status(status).json({ error: errorMessage });
    }
});

// Load tokens at startup and then start the server
Promise.all([loadAllTokensFromFile(), loadAllXeroTokensFromFile()]).then(() => {
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
}).catch(error => {
    console.error("Failed to load token files at startup:", error);
    // Decide if you want to start the server anyway or exit
    // For now, let's log and attempt to start.
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}, but there was an error loading token files.`);
    });
});
