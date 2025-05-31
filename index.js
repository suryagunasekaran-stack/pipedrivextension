require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const pipedriveClientId = process.env.CLIENT_ID;
const pipedriveClientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// --- Token Storage ---
// let accessToken = null; // Will be removed
// let refreshToken = null; // Will be removed
// let tokenExpiresAt = null; // Will be removed
// let apiDomain = null; // Will be removed
let allCompanyTokens = {}; // New: Stores tokens for multiple companies { companyId: { accessToken, refreshToken, tokenExpiresAt, apiDomain } }
const TOKEN_FILE_PATH = path.join(__dirname, 'tokens.json');

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

    let { accessToken, refreshToken, tokenExpiresAt, apiDomain } = companyTokens;

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
            accessToken = allCompanyTokens[companyId].accessToken;

        } catch (refreshError) {
            allCompanyTokens[companyId].accessToken = null;
            await saveAllTokensToFile();
            return res.status(401).send(`Failed to refresh token for company ${companyId}. Please have the Pipedrive admin re-authenticate the app for this company.`);
        }
    }

    if (!dealId && req.query.resource === 'deal') {
        return res.status(400).send('Deal ID (from selectedIds) is missing for a deal resource.');
    } else if (!dealId && req.query.resource) {
        return res.status(400).send('Required ID (selectedIds) is missing for the resource.');
    }

    try {
        if (!apiDomain) {
            return res.status(500).send('API domain configuration missing for your company. Please re-authenticate.');
        }
        
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
            return res.status(404).send(`Deal with ID ${dealId} not found for company ${companyId}.`);
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

        res.status(200).send(`Successfully fetched deal, contact, organization, and product data for Deal ID: ${dealId} (Company: ${companyId}).`);

    } catch (apiError) {
        const status = apiError.response ? apiError.response.status : 500;
        const message = apiError.response && apiError.response.data && apiError.response.data.error 
                        ? apiError.response.data.error 
                        : `Error processing Pipedrive data for company ${companyId}.`;
        
        if (status === 404) {
            return res.status(404).send(`A required resource (deal, person, organization, or products) was not found for Deal ID ${dealId}, Company ${companyId}.`);
        } else if (status === 401 || status === 403) {
            return res.status(status).send('Pipedrive API authentication/authorization error. Please check token and permissions.');
        }
        res.status(status).send(message);
    }
});

// Load tokens at startup and then start the server
loadAllTokensFromFile().then(() => { // Changed to loadAllTokensFromFile
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
});
