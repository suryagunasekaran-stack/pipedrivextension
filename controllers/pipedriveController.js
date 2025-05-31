import 'dotenv/config';
import * as tokenService from '../services/tokenService.js';
import * as pipedriveApiService from '../services/pipedriveApiService.js';

const pipedriveClientId = process.env.CLIENT_ID;
const pipedriveClientSecret = process.env.CLIENT_SECRET;

export const handlePipedriveAction = async (req, res) => {
    const dealId = req.query.selectedIds;
    const companyId = req.query.companyId;

    if (!companyId) {
        return res.status(400).send('Company ID is missing in the request from Pipedrive.');
    }

    let companyTokens = tokenService.allCompanyTokens[companyId];

    if (!companyTokens || !companyTokens.accessToken) {
        return res.status(401).send(`Not authenticated for company ${companyId}. Please ensure this Pipedrive company has authorized the app.`);
    }

    if (Date.now() >= companyTokens.tokenExpiresAt) {
        try {
            console.log(`Pipedrive token expired for ${companyId}, attempting refresh.`);
            companyTokens = await tokenService.refreshPipedriveToken(companyId);
        } catch (refreshError) {
            console.error(`Failed to refresh Pipedrive token for company ${companyId}:`, refreshError.message);
            return res.status(401).send(`Failed to refresh Pipedrive token for company ${companyId}. Please re-authenticate.`);
        }
    }

    if (!dealId && req.query.resource === 'deal') {
        return res.status(400).send('Deal ID (from selectedIds) is missing for a deal resource.');
    } else if (!dealId && req.query.resource) {
        return res.status(400).send('Required ID (selectedIds) is missing for the resource.');
    }

    if (!companyTokens.apiDomain) {
        return res.status(500).send('API domain configuration missing for your company. Please re-authenticate.');
    }

    const nextJsFrontendUrl = 'http://localhost:3001/pipedrive-data-view';
    if (dealId && companyId) {
        return res.redirect(`${nextJsFrontendUrl}?dealId=${dealId}&companyId=${companyId}`);
    } else if (companyId) {
        console.log(`Redirecting for company ${companyId}, but dealId is missing. Ensure this is handled by the frontend or action type.`);
        return res.redirect(`${nextJsFrontendUrl}?companyId=${companyId}`);
    } else {
        return res.status(400).send('Cannot redirect: Missing critical parameters (dealId or companyId).');
    }
};

export const getPipedriveData = async (req, res) => {
    const { dealId, companyId } = req.query;

    if (!dealId || !companyId) {
        return res.status(400).json({ error: 'Deal ID and Company ID are required.' });
    }

    let companyTokens = tokenService.allCompanyTokens[companyId];
    if (!companyTokens || !companyTokens.accessToken) {
        return res.status(401).json({ error: `Pipedrive not authenticated for company ${companyId}.` });
    }

    if (Date.now() >= companyTokens.tokenExpiresAt) {
        try {
            console.log(`Pipedrive token expired for ${companyId} in /api/pipedrive-data, attempting refresh.`);
            companyTokens = await tokenService.refreshPipedriveToken(companyId);
        } catch (refreshError) {
            console.error(`Failed to refresh Pipedrive token for ${companyId} in /api/pipedrive-data:`, refreshError.message);
            return res.status(401).json({ error: `Failed to refresh Pipedrive token for company ${companyId}. Please re-authenticate.` });
        }
    }

    const { accessToken, apiDomain } = companyTokens;

    try {
        const dealDetails = await pipedriveApiService.getDealDetails(apiDomain, accessToken, dealId);
        let personDetails = null;
        if (dealDetails.person_id && dealDetails.person_id.value) {
            personDetails = await pipedriveApiService.getPersonDetails(apiDomain, accessToken, dealDetails.person_id.value);
        }
        let orgDetails = null;
        if (dealDetails.org_id && dealDetails.org_id.value) {
            orgDetails = await pipedriveApiService.getOrganizationDetails(apiDomain, accessToken, dealDetails.org_id.value);
        }
        const dealProducts = await pipedriveApiService.getDealProducts(apiDomain, accessToken, dealId);

        res.json({
            deal: dealDetails,
            person: personDetails,
            organization: orgDetails,
            products: dealProducts
        });
    } catch (error) {
        console.error('Error fetching Pipedrive data:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch Pipedrive data.', details: error.message });
    }
};
