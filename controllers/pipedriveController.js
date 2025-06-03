/**
 * @fileoverview Pipedrive integration controller handling deal actions and data retrieval.
 * Manages authentication state, token refresh, and redirects to frontend applications
 * based on user actions within Pipedrive (createProject, createQuote).
 */

import 'dotenv/config';
import * as tokenService from '../services/tokenService.js';
import * as pipedriveApiService from '../services/pipedriveApiService.js';

const pipedriveClientId = process.env.CLIENT_ID;
const pipedriveClientSecret = process.env.CLIENT_SECRET;

/**
 * Handles Pipedrive app actions by validating authentication and redirecting to the appropriate frontend.
 * Determines the UI action (createProject or createQuote) and constructs the redirect URL with parameters.
 * 
 * @param {Object} req - Express request object with query parameters (selectedIds, companyId, uiAction, resource)
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Redirects to frontend application or returns error response
 * @throws {Error} Returns 400 for missing parameters, 401 for auth issues, 500 for config errors
 */
export const handlePipedriveAction = async (req, res) => {
    const dealId = req.query.selectedIds;
    const companyId = req.query.companyId;
    const uiAction = req.query.uiAction;

    if (!companyId) {
        return res.status(400).send('Company ID is missing in the request from Pipedrive.');
    }

    let companyTokens = tokenService.allCompanyTokens[companyId];

    if (!companyTokens || !companyTokens.accessToken) {
        return res.status(401).send(`Not authenticated for company ${companyId}. Please ensure this Pipedrive company has authorized the app.`);
    }

    if (Date.now() >= companyTokens.tokenExpiresAt) {
        try {
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

    let frontendRedirectUrl;
    const baseFrontendUrl = 'http://localhost:3001';

    if (uiAction === 'createProject') {
        frontendRedirectUrl = `${baseFrontendUrl}/create-project-page`;
    } else {
        frontendRedirectUrl = `${baseFrontendUrl}/pipedrive-data-view`;
    }

    if (dealId && companyId) {
        return res.redirect(`${frontendRedirectUrl}?dealId=${dealId}&companyId=${companyId}&uiAction=${uiAction || 'createQuote'}`);
    } else if (companyId) {
        return res.redirect(`${frontendRedirectUrl}?companyId=${companyId}&uiAction=${uiAction || 'createQuote'}`);
    } else {
        return res.status(400).send('Cannot redirect: Missing critical parameters (dealId or companyId).');
    }
};

/**
 * Creates a project by fetching deal details and custom fields from Pipedrive.
 * Extracts department, vessel name, location, and sales representative information
 * for project initialization.
 * 
 * @param {Object} req - Express request object with body containing dealId and companyId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with deal details and custom fields or error response
 * @throws {Error} Returns 400 for missing params, 401 for auth issues, 404 for deal not found, 500 for API errors
 */
export const createProject = async (req, res) => {
    const { dealId, companyId } = req.body;

    if (!dealId || !companyId) {
        return res.status(400).json({ error: 'Deal ID and Company ID are required in the request body.' });
    }

    let companyTokens = tokenService.allCompanyTokens[companyId];
    if (!companyTokens || !companyTokens.accessToken) {
        return res.status(401).json({ error: `Pipedrive not authenticated for company ${companyId}.` });
    }

    if (Date.now() >= companyTokens.tokenExpiresAt) {
        try {
            companyTokens = await tokenService.refreshPipedriveToken(companyId);
        } catch (refreshError) {
            console.error(`Failed to refresh Pipedrive token for ${companyId} in createProject:`, refreshError.message);
            return res.status(401).json({ error: `Failed to refresh Pipedrive token for company ${companyId}. Please re-authenticate.` });
        }
    }

    const { accessToken, apiDomain } = companyTokens;
    const xeroQuoteCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
    const vesselNameKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME;
    const salesInChargeKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_SALES_IN_CHARGE;
    const locationKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_LOCATION;
    const departmentKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT;

    if (!xeroQuoteCustomFieldKey) {
        console.error('PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY is not set in .env.');
    }

    try {
        const dealDetails = await pipedriveApiService.getDealDetails(apiDomain, accessToken, dealId);

        if (!dealDetails) {
            return res.status(404).json({ error: `Deal with ID ${dealId} not found.` });
        }

        const xeroQuoteNumber = xeroQuoteCustomFieldKey ? (dealDetails[xeroQuoteCustomFieldKey] || null) : null;

        const frontendDealObject = { ...dealDetails };

        if (departmentKey) {
            frontendDealObject.department = dealDetails[departmentKey] || null;
        }
        if (vesselNameKey) {
            frontendDealObject.vessel_name = dealDetails[vesselNameKey] || null;
        }
        if (locationKey) {
            frontendDealObject.location = dealDetails[locationKey] || null;
        }
        if (salesInChargeKey) {
            frontendDealObject.sales_in_charge = dealDetails[salesInChargeKey] || null;
        }

        res.json({
            message: 'Project creation initiated (simulated). Fetched deal details and custom fields.',
            deal: frontendDealObject,
            xeroQuoteNumber: xeroQuoteNumber
        });

    } catch (error) {
        console.error('Error in createProject controller:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to process project creation.', details: error.message });
    }
};

/**
 * Retrieves comprehensive Pipedrive data for a specific deal including deal details,
 * associated person, organization, and products.
 * 
 * @param {Object} req - Express request object with query parameters (dealId, companyId)
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with deal, person, organization, and products data
 * @throws {Error} Returns 400 for missing params, 401 for auth issues, 500 for API errors
 */
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
