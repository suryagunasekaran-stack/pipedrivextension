/**
 * @fileoverview Xero integration controller managing connection status and quote creation.
 * Handles Xero authentication validation, contact management, and quote generation
 * linked to Pipedrive deals and products.
 */

import * as tokenService from '../services/secureTokenService.js';
import * as pipedriveApiService from '../services/pipedriveApiService.js';
import * as xeroApiService from '../services/xeroApiService.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Checks the Xero connection status for a specific Pipedrive company.
 * Validates token existence and expiration status to determine if reconnection is needed.
 * 
 * @param {Object} req - Express request object with query parameter pipedriveCompanyId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with connection status and reconnection requirements
 */
export const getXeroStatus = async (req, res) => {
    const { pipedriveCompanyId } = req.query;

    if (!pipedriveCompanyId) {
        return res.status(400).json({ error: 'Pipedrive Company ID is required.' });
    }

    try {
        const xeroToken = await tokenService.getAuthToken(pipedriveCompanyId, 'xero');
        const currentTime = Date.now();

        if (xeroToken && xeroToken.accessToken && xeroToken.tenantId) {
            const isConnected = true;
            const needsReconnect = currentTime >= (xeroToken.tokenExpiresAt || 0);
            res.json({ 
                isConnected: isConnected, 
                needsReconnect: needsReconnect,
                message: isConnected ? 'Xero is connected.' : 'Xero is not connected.' 
            });
        } else {
            res.json({ 
                isConnected: false, 
                message: 'Xero is not connected.',
                authUrl: `http://localhost:3000/auth/connect-xero?pipedriveCompanyId=${pipedriveCompanyId}`
            });
        }
    } catch (error) {
        req.log.error('Error checking Xero connection status', {
            pipedriveCompanyId,
            error: error.message
        });
        res.status(500).json({ 
            error: 'Failed to check Xero connection status',
            details: error.message
        });
    }
};

/**
 * Creates a Xero quote from Pipedrive deal data including products, contact information,
 * and custom fields. Handles contact creation/lookup and quote generation with line items.
 * 
 * @param {Object} req - Express request object with body containing pipedriveCompanyId and pipedriveDealId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with created quote details or error response
 * @throws {Error} Returns 400 for missing params, 401 for auth issues, 500 for API errors
 */
export const createXeroQuote = async (req, res) => {
    const { pipedriveCompanyId, pipedriveDealId } = req.body;

    if (!pipedriveCompanyId || !pipedriveDealId) {
        return res.status(400).json({ error: 'Pipedrive Company ID and Deal ID are required.' });
    }

    try {
        // Use auth info provided by middleware
        const pdApiDomain = req.pipedriveAuth.apiDomain;
        const pdAccessToken = req.pipedriveAuth.accessToken;

        // Check if Xero auth is available (middleware provides this info)
        if (!req.xeroAuth || !req.xeroAuth.accessToken) {
            return res.status(401).json({ 
                success: false,
                error: `Xero not authenticated for Pipedrive company ${pipedriveCompanyId}. Please connect to Xero first.`,
                authRequired: true,
                authType: 'xero',
                companyId: pipedriveCompanyId,
                authUrl: `http://localhost:3000/auth/connect-xero?pipedriveCompanyId=${pipedriveCompanyId}`
            });
        }

        const xeroAccessToken = req.xeroAuth.accessToken;
        const xeroTenantId = req.xeroAuth.tenantId;

        const dealDetails = await pipedriveApiService.getDealDetails(pdApiDomain, pdAccessToken, pipedriveDealId);
        if (!dealDetails) return res.status(404).json({ error: `Pipedrive Deal ${pipedriveDealId} not found.` });

        if (!dealDetails.org_id || !dealDetails.org_id.value) {
            return res.status(400).json({ error: 'Pipedrive Deal is not associated with an Organization, which is required for the Xero contact.' });
        }
        const organizationDetails = await pipedriveApiService.getOrganizationDetails(pdApiDomain, pdAccessToken, dealDetails.org_id.value);
        if (!organizationDetails) return res.status(404).json({ error: `Pipedrive Organization ${dealDetails.org_id.value} not found.` });

        let personDetails = null;
        let contactEmail = null;
        if (dealDetails.person_id && dealDetails.person_id.value) {
            personDetails = await pipedriveApiService.getPersonDetails(pdApiDomain, pdAccessToken, dealDetails.person_id.value);
            if (personDetails && personDetails.email && personDetails.email.length > 0) {
                const primaryEmailEntry = personDetails.email.find(e => e.primary);
                contactEmail = primaryEmailEntry ? primaryEmailEntry.value : personDetails.email[0].value;
            }
        }
        
        const contactName = organizationDetails.name;

        if (!contactName) {
             return res.status(400).json({ error: 'Pipedrive organization has no name, which is required for Xero contact.' });
        }

        // Xero auth info is already available from middleware

        let xeroContactID;
        let existingXeroContact = await xeroApiService.findXeroContactByName(xeroAccessToken, xeroTenantId, contactName);

        if (existingXeroContact) {
            xeroContactID = existingXeroContact.ContactID;
        } else {
            const newContactPayload = {
                Name: contactName,
                ...(contactEmail && { EmailAddress: contactEmail }) 
            };
            const createdContact = await xeroApiService.createXeroContact(xeroAccessToken, xeroTenantId, newContactPayload);
            xeroContactID = createdContact.ContactID; 
        }

        const dealProducts = await pipedriveApiService.getDealProducts(pdApiDomain, pdAccessToken, pipedriveDealId);
        let lineItems = dealProducts.map(p => ({
            Description: p.name || 'N/A',
            Quantity: p.quantity || 1,
            UnitAmount: p.item_price || 0,
            AccountCode: process.env.XERO_DEFAULT_ACCOUNT_CODE || "200", 
            TaxType: process.env.XERO_DEFAULT_TAX_TYPE || "NONE"     
        }));

        if (lineItems.length === 0 && dealDetails.value && dealDetails.value > 0) {
             lineItems.push({
                Description: dealDetails.title || "Deal Value",
                Quantity: 1,
                UnitAmount: dealDetails.value,
                AccountCode: process.env.XERO_DEFAULT_ACCOUNT_CODE || "200",
                TaxType: process.env.XERO_DEFAULT_TAX_TYPE || "NONE"
             });
        } else if (lineItems.length === 0) {
            return res.status(400).json({ error: 'Cannot create a Xero quote with no line items and no deal value.'});
        }
        
        const currentDate = new Date().toISOString().split('T')[0];
        const quotePayload = {
            Contact: { ContactID: xeroContactID },
            Date: currentDate,
            LineItems: lineItems,
            Status: "DRAFT"
        };
        
        const idempotencyKey = uuidv4();
        const pipedriveDealReference = `Pipedrive Deal ID: ${pipedriveDealId}`;

        const createdQuote = await xeroApiService.createQuote(xeroAccessToken, xeroTenantId, quotePayload, idempotencyKey, pipedriveDealReference);
        
        if (createdQuote && createdQuote.QuoteNumber) {
            try {
                await pipedriveApiService.updateDealWithQuoteNumber(pdApiDomain, pdAccessToken, pipedriveDealId, createdQuote.QuoteNumber);
                res.status(201).json({ 
                    message: 'Xero quote created and Pipedrive deal updated successfully!', 
                    quoteNumber: createdQuote.QuoteNumber, 
                    quoteId: createdQuote.QuoteID,
                    xeroContactID: xeroContactID,
                    status: createdQuote.Status
                });
            } catch (updateError) {
                console.error('Failed to update Pipedrive deal with Xero quote number:', updateError.message);
                const pipedriveErrorDetails = updateError.response ? updateError.response.data : (updateError.message || 'Unknown error during Pipedrive update.');
                return res.status(201).json({
                    message: 'Xero quote created successfully, but failed to update Pipedrive deal.', 
                    quoteNumber: createdQuote.QuoteNumber, 
                    quoteId: createdQuote.QuoteID,
                    xeroContactID: xeroContactID,
                    status: createdQuote.Status,
                    pipedriveUpdateError: {
                        message: updateError.message,
                        details: pipedriveErrorDetails
                    }
                });
            }
        } else {
            console.error("Failed to create Xero quote or get QuoteNumber from response:", createdQuote);
            res.status(500).json({ error: 'Failed to create Xero quote or quote data is missing in response.' });
        }

    } catch (error) {
        console.error('Error in /api/xero/create-quote:', error.response ? JSON.stringify(error.response.data, null, 2) : (error.details ? JSON.stringify(error.details) : error.message));
        if (error.status && error.details) { // For custom error object from createQuote
             return res.status(error.status).json({ error: error.message, details: error.details });
        }
        if (error.response && error.response.data && error.response.data.Elements) {
            return res.status(400).json({ error: 'Xero API validation error.', details: error.response.data.Elements });
        }
        if (error.response && error.response.data && error.response.data.Message) {
            return res.status(error.response.status || 500).json({ error: error.response.data.Message, details: error.response.data.Detail || error.message });
        }
        res.status(500).json({ error: 'Failed to create Xero quote.', details: error.message });
    }
};

/**
 * Accepts a Xero quote by updating its status to ACCEPTED.
 * Requires valid Xero authentication tokens for the specified Pipedrive company.
 * 
 * @param {Object} req - Express request object with body containing pipedriveCompanyId and params containing quoteId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with acceptance confirmation or error response
 * @throws {Error} Returns 400 for missing params, 401 for auth issues, 500 for API errors
 */
export const acceptXeroQuote = async (req, res) => {
    const { pipedriveCompanyId } = req.body;
    const { quoteId } = req.params;

    if (!pipedriveCompanyId) {
        return res.status(400).json({ error: 'Pipedrive Company ID is required in the request body.' });
    }
    if (!quoteId) {
        return res.status(400).json({ error: 'Xero Quote ID is required in the URL parameters.' });
    }

    try {
        // Use auth info provided by middleware
        if (!req.xeroAuth || !req.xeroAuth.accessToken) {
            return res.status(401).json({ 
                success: false,
                error: `Xero not authenticated for Pipedrive company ${pipedriveCompanyId}. Please connect to Xero first.`,
                authRequired: true,
                authType: 'xero',
                companyId: pipedriveCompanyId,
                authUrl: `http://localhost:3000/auth/connect-xero?pipedriveCompanyId=${pipedriveCompanyId}`
            });
        }

        const xeroAccessToken = req.xeroAuth.accessToken;
        const xeroTenantId = req.xeroAuth.tenantId;

        const acceptanceResult = await xeroApiService.updateQuoteStatus(xeroAccessToken, xeroTenantId, quoteId, 'ACCEPTED');

        if (acceptanceResult) {
            res.status(200).json({ message: `Quote ${quoteId} successfully accepted in Xero.`, details: acceptanceResult });
        } else {
            res.status(500).json({ error: `Failed to accept quote ${quoteId} in Xero.`, details: acceptanceResult });
        }

    } catch (error) {
        console.error('Error accepting Xero quote:', error);
        if (error.response && error.response.data) {
            return res.status(error.response.status || 500).json({ 
                error: 'Failed to accept Xero quote.', 
                xeroError: error.response.data 
            });
        }
        res.status(500).json({ error: 'Internal server error while accepting Xero quote.', details: error.message });
    }
};

/**
 * Creates a Xero project with specified contact, name, and optional parameters.
 * Optionally updates the associated Pipedrive deal with project information.
 * 
 * @param {Object} req - Express request object with body containing pipedriveCompanyId, contactId, name, and optional estimateAmount, deadline, quoteId, dealId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with created project details or error response
 * @throws {Error} Returns 400 for missing params, 401 for auth issues, 500 for API errors
 */
export const createXeroProject = async (req, res) => {
    const { pipedriveCompanyId, contactId, name, estimateAmount, deadline, quoteId, dealId } = req.body;

    if (!pipedriveCompanyId) {
        return res.status(400).json({ error: 'Pipedrive Company ID is required.' });
    }
    if (!contactId) {
        return res.status(400).json({ error: 'Xero Contact ID is required.' });
    }
    if (!name) {
        return res.status(400).json({ error: 'Project name is required.' });
    }

    try {
        // Use auth info provided by middleware
        if (!req.xeroAuth || !req.xeroAuth.accessToken) {
            return res.status(401).json({ 
                success: false,
                error: `Xero not authenticated for Pipedrive company ${pipedriveCompanyId}. Please connect to Xero first.`,
                authRequired: true,
                authType: 'xero',
                companyId: pipedriveCompanyId,
                authUrl: `http://localhost:3000/auth/connect-xero?pipedriveCompanyId=${pipedriveCompanyId}`
            });
        }
        
        const xeroAccessToken = req.xeroAuth.accessToken;
        const xeroTenantId = req.xeroAuth.tenantId;

        const projectData = {
            contactId: contactId,
            name: name,
            estimateAmount: estimateAmount,
            deadline: deadline,
        };

        const newProject = await xeroApiService.createXeroProject(xeroAccessToken, xeroTenantId, projectData, quoteId, dealId, pipedriveCompanyId);

        // Update Pipedrive deal with project information if dealId is provided
        if (newProject && dealId && pipedriveCompanyId) {
            try {
                // Use Pipedrive auth from middleware if available, otherwise fall back to token service
                let pdApiDomain, pdAccessToken;
                
                if (req.pipedriveAuth && req.pipedriveAuth.accessToken) {
                    pdApiDomain = req.pipedriveAuth.apiDomain;
                    pdAccessToken = req.pipedriveAuth.accessToken;
                } else {
                    let pdCompanyTokens = tokenService.allCompanyTokens[pipedriveCompanyId];
                    if (pdCompanyTokens && pdCompanyTokens.accessToken) {
                        if (Date.now() >= pdCompanyTokens.tokenExpiresAt) {
                            pdCompanyTokens = await tokenService.refreshPipedriveToken(pipedriveCompanyId);
                        }
                        pdApiDomain = pdCompanyTokens.apiDomain;
                        pdAccessToken = pdCompanyTokens.accessToken;
                    }
                }
                
                if (pdApiDomain && pdAccessToken) {
                    const projectIdentifier = newProject.projectId || newProject.id || newProject.projectNumber || `Project: ${name}`;
                    
                    await pipedriveApiService.updateDealWithProjectNumber(pdApiDomain, pdAccessToken, dealId, projectIdentifier);
                }
            } catch (updateError) {
                console.error('Failed to update Pipedrive deal with project info:', updateError.message);
            }
        }

        if (newProject) {
            res.status(201).json({ message: 'Project successfully created in Xero.', project: newProject });
        } else {
            res.status(500).json({ error: 'Failed to create project in Xero.', details: newProject });
        }

    } catch (error) {
        console.error('Error creating Xero project:', error);
        if (error.response && error.response.data) {
            return res.status(error.response.status || 500).json({ 
                error: 'Failed to create Xero project.', 
                xeroError: error.response.data 
            });
        }
        res.status(500).json({ error: 'Internal server error while creating Xero project.', details: error.message });
    }
};
