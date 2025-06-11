/**
 * @fileoverview Xero API Controller for Xero integration endpoints.
 * Handles Xero authentication status, quote creation, and project management.
 * Manages Xero OAuth tokens and API interactions with comprehensive error handling.
 */

import 'dotenv/config';
import * as xeroApiService from '../services/xeroApiService.js';
import * as tokenService from '../services/secureTokenService.js';
import * as pipedriveApiService from '../services/pipedriveApiService.js';
import logger from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { logSuccess, logWarning, logInfo, logProcessing } from '../middleware/routeLogger.js';
import { validateQuoteCreation, mapProductsToLineItems } from '../utils/quoteBusinessRules.js';
import { formatLineItem, calculateLineItemTotal } from '../utils/quoteLineItemUtils.js';
import { validateSelectedLineItems } from '../utils/partialInvoiceBusinessRules.js';

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

    logProcessing(req, 'Validating input parameters', { 
        pipedriveCompanyId: !!pipedriveCompanyId 
    });

    if (!pipedriveCompanyId) {
        logWarning(req, 'Missing Pipedrive Company ID');
        return res.status(400).json({ error: 'Pipedrive Company ID is required.' });
    }

    try {
        logProcessing(req, 'Retrieving Xero token from storage', { pipedriveCompanyId });
        
        const xeroToken = await tokenService.getAuthToken(pipedriveCompanyId, 'xero');
        const currentTime = Date.now();

        logProcessing(req, 'Token retrieval completed', {
            hasToken: !!xeroToken,
            hasAccessToken: !!(xeroToken && xeroToken.accessToken),
            hasTenantId: !!(xeroToken && xeroToken.tenantId),
            currentTime
        });

        if (xeroToken && xeroToken.accessToken && xeroToken.tenantId) {
            const isConnected = true;
            const needsReconnect = currentTime >= (xeroToken.tokenExpiresAt || 0);
            
            logProcessing(req, 'Connection status determined', {
                isConnected,
                needsReconnect,
                tokenExpiresAt: xeroToken.tokenExpiresAt,
                timeUntilExpiry: Math.max(0, (xeroToken.tokenExpiresAt || 0) - currentTime)
            });

            const responseData = { 
                isConnected: isConnected, 
                needsReconnect: needsReconnect,
                message: isConnected ? 'Xero is connected.' : 'Xero is not connected.' 
            };

            logSuccess(req, 'Xero status check completed', responseData);
            res.json(responseData);
        } else {
            const responseData = { 
                isConnected: false, 
                message: 'Xero is not connected.',
                authUrl: `http://localhost:3000/auth/connect-xero?pipedriveCompanyId=${pipedriveCompanyId}`
            };

            logSuccess(req, 'Xero not connected - auth URL provided', responseData);
            res.json(responseData);
        }
    } catch (error) {
        // Error will be handled by error middleware
        throw new Error(`Failed to check Xero connection status: ${error.message}`);
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

    logProcessing(req, 'Validating input parameters', { 
        pipedriveCompanyId: !!pipedriveCompanyId, 
        pipedriveDealId: !!pipedriveDealId 
    });

    if (!pipedriveCompanyId || !pipedriveDealId) {
        logWarning(req, 'Missing required parameters');
        return res.status(400).json({ error: 'Pipedrive Company ID and Deal ID are required.' });
    }

    try {
        // Use auth info provided by middleware
        const pdApiDomain = req.pipedriveAuth.apiDomain;
        const pdAccessToken = req.pipedriveAuth.accessToken;

        logProcessing(req, 'Pipedrive authentication retrieved', {
            hasApiDomain: !!pdApiDomain,
            hasAccessToken: !!pdAccessToken
        });

        // Xero auth is guaranteed by middleware
        const xeroAccessToken = req.xeroAuth.accessToken;
        const xeroTenantId = req.xeroAuth.tenantId;

        logProcessing(req, 'Xero authentication verified', {
            hasAccessToken: !!xeroAccessToken,
            hasTenantId: !!xeroTenantId
        });

        // Fetch deal details
        logProcessing(req, 'Fetching Pipedrive deal details', { pipedriveDealId });
        const dealDetails = await pipedriveApiService.getDealDetails(pdApiDomain, pdAccessToken, pipedriveDealId);
        
        if (!dealDetails) {
            logWarning(req, 'Deal not found', { pipedriveDealId });
            return res.status(404).json({ error: `Pipedrive Deal ${pipedriveDealId} not found.` });
        }

        logProcessing(req, 'Deal details retrieved', {
            dealTitle: dealDetails.title,
            dealValue: dealDetails.value,
            hasOrgId: !!(dealDetails.org_id && dealDetails.org_id.value),
            hasPersonId: !!(dealDetails.person_id && dealDetails.person_id.value)
        });

        if (!dealDetails.org_id || !dealDetails.org_id.value) {
            logWarning(req, 'Deal missing organization association');
            return res.status(400).json({ error: 'Pipedrive Deal is not associated with an Organization, which is required for the Xero contact.' });
        }

        // Fetch organization details
        logProcessing(req, 'Fetching organization details', { orgId: dealDetails.org_id.value });
        const organizationDetails = await pipedriveApiService.getOrganizationDetails(pdApiDomain, pdAccessToken, dealDetails.org_id.value);
        
        if (!organizationDetails) {
            logWarning(req, 'Organization not found', { orgId: dealDetails.org_id.value });
            return res.status(404).json({ error: `Pipedrive Organization ${dealDetails.org_id.value} not found.` });
        }

        logProcessing(req, 'Organization details retrieved', {
            orgName: organizationDetails.name,
            hasAddress: !!organizationDetails.address
        });

        // Fetch person details if available
        let personDetails = null;
        let contactEmail = null;
        if (dealDetails.person_id && dealDetails.person_id.value) {
            logProcessing(req, 'Fetching person details', { personId: dealDetails.person_id.value });
            
            personDetails = await pipedriveApiService.getPersonDetails(pdApiDomain, pdAccessToken, dealDetails.person_id.value);
            if (personDetails && personDetails.email && personDetails.email.length > 0) {
                const primaryEmailEntry = personDetails.email.find(e => e.primary);
                contactEmail = primaryEmailEntry ? primaryEmailEntry.value : personDetails.email[0].value;
                
                logProcessing(req, 'Person details and email retrieved', {
                    personName: personDetails.name,
                    hasEmail: !!contactEmail,
                    emailIsPrimary: !!primaryEmailEntry
                });
            }
        }
        
        const contactName = organizationDetails.name;

        if (!contactName) {
            logWarning(req, 'Organization missing name');
            return res.status(400).json({ error: 'Pipedrive organization has no name, which is required for Xero contact.' });
        }

        // Find or create Xero contact
        logProcessing(req, 'Looking for existing Xero contact', { contactName });
        let xeroContactID;
        let existingXeroContact = await xeroApiService.findXeroContactByName(xeroAccessToken, xeroTenantId, contactName);

        if (existingXeroContact) {
            xeroContactID = existingXeroContact.ContactID;
            logProcessing(req, 'Found existing Xero contact', { 
                contactId: xeroContactID,
                contactName: existingXeroContact.Name 
            });
        } else {
            logProcessing(req, 'Creating new Xero contact', { contactName, contactEmail });
            const newContactPayload = {
                Name: contactName,
                ...(contactEmail && { EmailAddress: contactEmail }) 
            };
            const createdContact = await xeroApiService.createXeroContact(xeroAccessToken, xeroTenantId, newContactPayload);
            xeroContactID = createdContact.ContactID;
            logProcessing(req, 'New Xero contact created', { 
                contactId: xeroContactID,
                contactName: createdContact.Name 
            });
        }

        // Validate quote creation eligibility
        try {
            // Create a temporary deal object with products for validation
            const dealWithProducts = {
                ...dealDetails,
                products: await pipedriveApiService.getDealProducts(pdApiDomain, pdAccessToken, pipedriveDealId)
            };
            
            validateQuoteCreation(dealWithProducts);
        } catch (validationError) {
            logWarning(req, 'Quote creation validation failed', {
                error: validationError.message,
                dealId: pipedriveDealId
            });
            return res.status(400).json({ error: validationError.message });
        }

        // Fetch deal products
        logProcessing(req, 'Fetching deal products', { pipedriveDealId });
        const dealProducts = await pipedriveApiService.getDealProducts(pdApiDomain, pdAccessToken, pipedriveDealId);
        
        logProcessing(req, 'Deal products retrieved', {
            productsCount: dealProducts.length,
            totalProductValue: dealProducts.reduce((sum, p) => sum + ((p.item_price || 0) * (p.quantity || 1)), 0)
        });

        // Build line items using test-driven utility
        let lineItems;
        try {
            lineItems = mapProductsToLineItems(dealProducts);
        } catch (mappingError) {
            logWarning(req, 'Product to line item mapping failed', {
                error: mappingError.message,
                productsCount: dealProducts.length
            });
            
            // Fallback: If no products but deal has value, create single line item
            if (dealProducts.length === 0 && dealDetails.value && dealDetails.value > 0) {
                lineItems = [{
                    Description: dealDetails.title || "Deal Value",
                    Quantity: 1,
                    UnitAmount: dealDetails.value,
                    AccountCode: process.env.XERO_DEFAULT_ACCOUNT_CODE || "200",
                    TaxType: process.env.XERO_DEFAULT_TAX_TYPE || "NONE"
                }];
            } else {
                return res.status(400).json({ error: 'Cannot create a Xero quote with no valid line items.' });
            }
        }

        logProcessing(req, 'Line items prepared', {
            lineItemsCount: lineItems.length,
            totalAmount: lineItems.reduce((sum, item) => sum + (item.UnitAmount * item.Quantity), 0)
        });
        
        // Create quote
        const currentDate = new Date().toISOString().split('T')[0];
        const quotePayload = {
            Contact: { ContactID: xeroContactID },
            Date: currentDate,
            LineItems: lineItems,
            Status: "SENT"
        };
        
        const idempotencyKey = uuidv4();
        const pipedriveDealReference = `Pipedrive Deal ID: ${pipedriveDealId}`;

        logProcessing(req, 'Creating Xero quote', {
            contactId: xeroContactID,
            lineItemsCount: lineItems.length,
            status: quotePayload.Status,
            hasIdempotencyKey: !!idempotencyKey
        });

        const createdQuote = await xeroApiService.createQuote(xeroAccessToken, xeroTenantId, quotePayload, idempotencyKey, pipedriveDealReference);
        
        if (createdQuote && createdQuote.QuoteNumber) {
            logProcessing(req, 'Xero quote created successfully', {
                quoteNumber: createdQuote.QuoteNumber,
                quoteId: createdQuote.QuoteID,
                status: createdQuote.Status
            });

            try {
                logProcessing(req, 'Updating Pipedrive deal with quote number and quote ID', { 
                    quoteNumber: createdQuote.QuoteNumber,
                    quoteId: createdQuote.QuoteID
                });
                
                // Update deal with quote number
                await pipedriveApiService.updateDealWithQuoteNumber(pdApiDomain, pdAccessToken, pipedriveDealId, createdQuote.QuoteNumber);
                
                // Update deal with Xero quote ID if configured
                const quoteIdCustomFieldKey = process.env.PIPEDRIVE_QUOTE_ID;
                if (quoteIdCustomFieldKey && createdQuote.QuoteID) {
                    await pipedriveApiService.updateDealCustomField(pdApiDomain, pdAccessToken, pipedriveDealId, quoteIdCustomFieldKey, createdQuote.QuoteID);
                    logProcessing(req, 'Deal updated with quote ID', { quoteId: createdQuote.QuoteID });
                } else if (!quoteIdCustomFieldKey) {
                    logWarning(req, 'PIPEDRIVE_QUOTE_ID not configured - skipping quote ID update');
                }
                
                const responseData = { 
                    message: 'Xero quote created and Pipedrive deal updated successfully!', 
                    quoteNumber: createdQuote.QuoteNumber, 
                    quoteId: createdQuote.QuoteID,
                    xeroContactID: xeroContactID,
                    status: createdQuote.Status
                };

                logSuccess(req, 'Quote creation and deal update completed', responseData);
                res.status(201).json(responseData);
                
            } catch (updateError) {
                logWarning(req, 'Failed to update Pipedrive deal with quote number or quote ID', {
                    error: updateError.message,
                    quoteNumber: createdQuote.QuoteNumber,
                    quoteId: createdQuote.QuoteID
                });
                
                const responseData = {
                    message: 'Xero quote created successfully, but failed to update Pipedrive deal.', 
                    quoteNumber: createdQuote.QuoteNumber, 
                    quoteId: createdQuote.QuoteID,
                    xeroContactID: xeroContactID,
                    status: createdQuote.Status,
                    pipedriveUpdateError: {
                        message: updateError.message,
                        details: updateError.response ? updateError.response.data : updateError.message
                    }
                };

                logSuccess(req, 'Quote created with Pipedrive update warning', responseData);
                return res.status(201).json(responseData);
            }
        } else {
            logWarning(req, 'Quote creation failed - no quote data returned', { createdQuote });
            res.status(500).json({ error: 'Failed to create Xero quote or quote data is missing in response.' });
        }

    } catch (error) {
        // Error will be handled by error middleware
        throw new Error(`Failed to create Xero quote: ${error.message}`);
    }
};

/**
 * Accepts a Xero quote by retrieving the quote ID from Pipedrive custom field.
 * Uses the simplified quote acceptance approach with direct ID lookup.
 * 
 * @param {Object} req - Express request object with body containing dealId and pipedriveCompanyId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with acceptance confirmation or error response
 * @throws {Error} Returns 400 for missing params, 404 for quote not found, 500 for API errors
 */
export const acceptXeroQuote = async (req, res) => {
    const { dealId, pipedriveCompanyId } = req.body;

    logProcessing(req, 'Validating input parameters for quote acceptance', { 
        dealId: !!dealId, 
        pipedriveCompanyId: !!pipedriveCompanyId 
    });

    if (!dealId || !pipedriveCompanyId) {
        logWarning(req, 'Missing required parameters for quote acceptance');
        return res.status(400).json({ 
            error: 'Deal ID and Pipedrive Company ID are required.',
            example: {
                dealId: "12345",
                pipedriveCompanyId: "67890"
            }
        });
    }

    try {
        // Use auth info provided by middleware
        const pdApiDomain = req.pipedriveAuth.apiDomain;
        const pdAccessToken = req.pipedriveAuth.accessToken;

        logProcessing(req, 'Pipedrive authentication retrieved', {
            hasApiDomain: !!pdApiDomain,
            hasAccessToken: !!pdAccessToken
        });

        // Xero auth is guaranteed by middleware
        const xeroAccessToken = req.xeroAuth.accessToken;
        const xeroTenantId = req.xeroAuth.tenantId;

        logProcessing(req, 'Xero authentication verified', {
            hasAccessToken: !!xeroAccessToken,
            hasTenantId: !!xeroTenantId
        });

        // Fetch deal details to get the Xero quote ID from custom field
        logProcessing(req, 'Fetching Pipedrive deal details', { dealId });
        const dealDetails = await pipedriveApiService.getDealDetails(pdApiDomain, pdAccessToken, dealId);
        
        if (!dealDetails) {
            logWarning(req, 'Deal not found', { dealId });
            return res.status(404).json({ 
                error: `Deal with ID ${dealId} not found.` 
            });
        }

        // Get the Xero quote ID from the Pipedrive custom field
        const quoteIdCustomFieldKey = process.env.PIPEDRIVE_QUOTE_ID;
        
        if (!quoteIdCustomFieldKey) {
            logWarning(req, 'PIPEDRIVE_QUOTE_ID environment variable not configured');
            return res.status(500).json({ 
                error: 'Quote ID custom field not configured. Please contact system administrator.',
                details: 'PIPEDRIVE_QUOTE_ID environment variable is required'
            });
        }

        const xeroQuoteId = dealDetails[quoteIdCustomFieldKey];

        logProcessing(req, 'Deal details and quote ID retrieved', {
            dealTitle: dealDetails.title,
            hasQuoteId: !!xeroQuoteId,
            quoteId: xeroQuoteId,
            customFieldKey: quoteIdCustomFieldKey
        });

        if (!xeroQuoteId) {
            logWarning(req, 'Deal has no associated Xero quote ID', { 
                dealId, 
                customFieldKey: quoteIdCustomFieldKey 
            });
            return res.status(400).json({ 
                error: 'Deal does not have an associated Xero quote ID. Please create a quote first.',
                details: `Custom field '${quoteIdCustomFieldKey}' is empty or not set`
            });
        }

        // Accept the quote using the new simplified approach
        logProcessing(req, 'Attempting to accept Xero quote', { 
            quoteId: xeroQuoteId,
            dealId 
        });

        const acceptanceResult = await xeroApiService.acceptXeroQuote(xeroAccessToken, xeroTenantId, xeroQuoteId);

        if (acceptanceResult) {
            const responseData = {
                success: true,
                message: `Quote ${xeroQuoteId} successfully accepted in Xero.`,
                data: {
                    quoteId: xeroQuoteId,
                    quoteNumber: acceptanceResult.QuoteNumber,
                    status: acceptanceResult.Status,
                    dealId: dealId,
                    contactName: acceptanceResult.Contact?.Name,
                    total: acceptanceResult.Total
                }
            };

            logSuccess(req, 'Quote acceptance completed successfully', {
                quoteId: xeroQuoteId,
                quoteNumber: acceptanceResult.QuoteNumber,
                status: acceptanceResult.Status,
                dealId
            });

            res.status(200).json(responseData);
        } else {
            logWarning(req, 'Quote acceptance failed - no result returned', {
                quoteId: xeroQuoteId,
                dealId
            });
            return res.status(500).json({ 
                error: `Failed to accept quote ${xeroQuoteId} in Xero.`, 
                details: 'No result returned from Xero API'
            });
        }

    } catch (error) {
        logWarning(req, 'Error accepting Xero quote', {
            dealId,
            pipedriveCompanyId,
            error: error.message,
            stack: error.stack
        });

        // Return appropriate error response based on error type
        if (error.message.includes('not found in Xero')) {
            return res.status(404).json({ 
                error: 'Quote not found in Xero',
                details: error.message
            });
        } else if (error.message.includes('Cannot accept quote') || error.message.includes('must be in SENT status')) {
            return res.status(409).json({ 
                error: 'Quote status conflict',
                details: error.message
            });
        } else if (error.message.includes('Access denied') || error.message.includes('permissions')) {
            return res.status(403).json({ 
                error: 'Access denied',
                details: error.message
            });
        } else if (error.message.includes('validation')) {
            return res.status(400).json({ 
                error: 'Validation error',
                details: error.message
            });
        } else if (error.response?.status === 404) {
            return res.status(404).json({ 
                error: 'Quote not found',
                details: error.message
            });
        } else if (error.response?.status === 400) {
            return res.status(400).json({ 
                error: 'Bad request',
                details: error.message,
                xeroError: error.response?.data
            });
        } else if (error.response?.status === 403) {
            return res.status(403).json({ 
                error: 'Access denied',
                details: error.message
            });
        } else {
            return res.status(500).json({ 
                error: 'Internal server error while accepting Xero quote',
                details: error.message
            });
        }
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
    const { pipedriveCompanyId, contactId, name, vesselName, estimateAmount, deadline, quoteId, dealId } = req.body;

    if (!pipedriveCompanyId) {
        return res.status(400).json({ error: 'Pipedrive Company ID is required.' });
    }
    if (!contactId) {
        return res.status(400).json({ error: 'Xero Contact ID is required.' });
    }
    if (!name) {
        return res.status(400).json({ error: 'Project name is required.' });
    }
    if (!vesselName) {
        return res.status(400).json({ error: 'Vessel name is required.' });
    }

    try {
        // Xero auth is guaranteed by middleware
        const xeroAccessToken = req.xeroAuth.accessToken;
        const xeroTenantId = req.xeroAuth.tenantId;

        // Format project name with vessel name
        const formattedProjectName = `IPC - ${vesselName}`;

        // Check if project with same name already exists
        try {
            const existingProjects = await xeroApiService.getXeroProjects(xeroAccessToken, xeroTenantId);
            const duplicateProject = existingProjects.find(p => p.Name === formattedProjectName);
            if (duplicateProject) {
                return res.status(409).json({ 
                    error: 'A project with this vessel name already exists.',
                    existingProject: duplicateProject
                });
            }
        } catch (error) {
            logger.warn('Error checking for duplicate projects', { 
                error: error.message,
                vesselName 
            });
            // Continue with project creation even if duplicate check fails
        }

        const projectData = {
            contactId: contactId,
            name: formattedProjectName,
            estimateAmount: estimateAmount,
            deadline: deadline,
        };

        logger.info('Creating Xero project', { 
            projectName: formattedProjectName,
            contactId,
            estimateAmount 
        });
        
        const newProject = await xeroApiService.createXeroProject(xeroAccessToken, xeroTenantId, projectData, quoteId, dealId, pipedriveCompanyId);
        
        logger.info('Xero project created successfully', { 
            projectId: newProject.ProjectID || newProject.projectId,
            projectName: formattedProjectName 
        });

        // Create default tasks if project was created successfully
        if (newProject && (newProject.ProjectID || newProject.projectId)) {
            const projectId = newProject.ProjectID || newProject.projectId;
            const defaultTasks = [
                "Manhour",
                "Overtime",
                "Transport",
                "Supply Labour"
            ];

            const createdTasks = [];
            for (const taskName of defaultTasks) {
                try {
                    logger.debug(`Creating task "${taskName}" for project ${projectId}`);
                    const task = await xeroApiService.createXeroTask(
                        xeroAccessToken,
                        xeroTenantId,
                        projectId,
                        taskName
                    );
                    if (task) {
                        logger.debug(`Task "${taskName}" created successfully`, {
                            taskId: task.TaskID || task.taskId || task.id
                        });
                        createdTasks.push(task);
                    }
                } catch (taskError) {
                    logger.error(`Failed to create task "${taskName}" for project ${projectId}. Reason: ${taskError.message || 'Unknown error'}`, {
                        taskName,
                        projectId,
                        error: taskError,
                        errorStack: taskError.stack
                    });
                }
            }
            newProject.tasks = createdTasks;
        } else {
            logger.error('Project creation response missing ProjectID', { 
                newProject: newProject ? Object.keys(newProject) : 'null' 
            });
            return res.status(500).json({ 
                error: 'Failed to create project in Xero - invalid project response',
                details: newProject || 'No project data received'
            });
        }

        // Update Pipedrive deal with project information if dealId is provided
        if (newProject && dealId && pipedriveCompanyId) {
            try {
                // Use Pipedrive auth from middleware if available, otherwise fall back to token service
                let pdApiDomain, pdAccessToken;
                
                if (req.pipedriveAuth && req.pipedriveAuth.accessToken) {
                    pdApiDomain = req.pipedriveAuth.apiDomain;
                    pdAccessToken = req.pipedriveAuth.accessToken;
                } else {
                    const pdTokenData = await tokenService.getAuthToken(pipedriveCompanyId, 'pipedrive');
                    if (pdTokenData && pdTokenData.accessToken) {
                        if (Date.now() >= pdTokenData.tokenExpiresAt) {
                            const refreshedToken = await tokenService.refreshPipedriveToken(pipedriveCompanyId);
                            pdApiDomain = refreshedToken.apiDomain;
                            pdAccessToken = refreshedToken.accessToken;
                        } else {
                            pdApiDomain = pdTokenData.apiDomain;
                            pdAccessToken = pdTokenData.accessToken;
                        }
                    }
                }
                
                if (pdApiDomain && pdAccessToken) {
                    const projectIdentifier = newProject.projectId || newProject.id || newProject.projectNumber || `Project: ${formattedProjectName}`;
                    logger.debug('Updating Pipedrive deal with project identifier', { 
                        projectIdentifier,
                        dealId 
                    });
                    
                    await pipedriveApiService.updateDealWithProjectNumber(pdApiDomain, pdAccessToken, dealId, projectIdentifier);
                }
            } catch (updateError) {
                logger.error('Failed to update Pipedrive deal with project info', {
                    dealId,
                    error: updateError.message
                });
            }
        }

        if (newProject) {
            res.status(201).json({ 
                message: 'Project successfully created in Xero with default tasks.', 
                project: newProject 
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to create project in Xero',
                details: 'No project data received'
            });
        }

    } catch (error) {
        logger.error('Error creating Xero project', { error: error.message });
        if (error.response) {
            logger.error('Xero API error response', { response: error.response.data });
            return res.status(error.response.status || 500).json({ 
                error: 'Failed to create Xero project',
                details: error.response.data || error.message
            });
        }
        res.status(500).json({ 
            error: 'Internal server error while creating Xero project',
            details: error.message || 'Unknown error occurred'
        });
    }
};

/**
 * Updates a quotation on Xero using Pipedrive deal data
 * 
 * @param {Object} req - Express request object with body containing pipedriveCompanyId and dealId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with update results
 */
export const updateQuotationOnXero = async (req, res) => {
    const { pipedriveCompanyId, dealId } = req.body;

    if (!pipedriveCompanyId || !dealId) {
        logWarning(req, 'Missing required parameters for quotation update', {
            hasPipedriveCompanyId: !!pipedriveCompanyId,
            hasDealId: !!dealId
        });
        return res.status(400).json({ 
            error: 'Pipedrive Company ID and Deal ID are required.',
            example: {
                pipedriveCompanyId: "12345",
                dealId: "67890"
            }
        });
    }

    try {
        logInfo(req, 'Starting quotation update on Xero', { pipedriveCompanyId, dealId });

        // Get Pipedrive token
        const pipedriveToken = await tokenService.getAuthToken(pipedriveCompanyId, 'pipedrive');
        if (!pipedriveToken || !pipedriveToken.accessToken || !pipedriveToken.apiDomain) {
            logWarning(req, 'Pipedrive not authenticated for company', { pipedriveCompanyId });
            return res.status(401).json({ 
                error: 'Pipedrive not authenticated for this company',
                pipedriveCompanyId 
            });
        }

        // Get Xero token
        const xeroToken = await tokenService.getAuthToken(pipedriveCompanyId, 'xero');
        if (!xeroToken || !xeroToken.accessToken || !xeroToken.tenantId) {
            logWarning(req, 'Xero not authenticated for company', { pipedriveCompanyId });
            return res.status(401).json({ 
                error: 'Xero not authenticated for this company',
                pipedriveCompanyId 
            });
        }

        logInfo(req, 'Authentication verified for both platforms', { 
            pipedriveApiDomain: pipedriveToken.apiDomain,
            xeroTenantId: xeroToken.tenantId
        });

        // Import the business logic function
        const { updateQuotationOnXero: updateQuotationBusinessLogic } = await import('../utils/updateQuotationBusinessLogic.js');

        // Call the business logic function
        const result = await updateQuotationBusinessLogic(
            pipedriveToken.apiDomain,
            pipedriveToken.accessToken,
            xeroToken.accessToken,
            xeroToken.tenantId,
            dealId
        );

        logSuccess(req, 'Quotation update completed successfully', {
            dealId,
            quoteId: result.quoteId,
            quoteNumber: result.quoteNumber,
            updatedLineItems: result.updatedLineItems,
            totalAmount: result.totalAmount
        });

        res.json({
            success: true,
            message: result.message,
            data: {
                dealId: dealId,
                quoteId: result.quoteId,
                quoteNumber: result.quoteNumber,
                updatedLineItems: result.updatedLineItems,
                totalAmount: result.totalAmount,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        logWarning(req, 'Error updating quotation on Xero', {
            dealId,
            pipedriveCompanyId,
            error: error.message,
            stack: error.stack
        });

        // Return appropriate error response based on error type
        if (error.message.includes('not authenticated')) {
            return res.status(401).json({ 
                error: 'Authentication failed',
                details: error.message
            });
        } else if (error.message.includes('not found')) {
            return res.status(404).json({ 
                error: 'Resource not found',
                details: error.message
            });
        } else if (error.message.includes('validation') || error.message.includes('required')) {
            return res.status(400).json({ 
                error: 'Validation error',
                details: error.message
            });
        } else if (error.message.includes('DRAFT status')) {
            return res.status(409).json({ 
                error: 'Quotation status conflict',
                details: error.message
            });
        } else {
            return res.status(500).json({ 
                error: 'Internal server error',
                details: error.message
            });
        }
    }
};

/**
 * Creates an invoice from a quote using the deal ID to find the quote number
 * 
 * @param {Object} req - Express request object with body containing dealId and pipedriveCompanyId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with created invoice details or error response
 * @throws {Error} Returns 400 for missing params, 404 for deal/quote not found, 500 for API errors
 */
export const createInvoiceFromQuote = async (req, res) => {
    const { dealId, pipedriveCompanyId } = req.body;

    logProcessing(req, 'Validating input parameters for invoice creation', { 
        dealId: !!dealId, 
        pipedriveCompanyId: !!pipedriveCompanyId 
    });

    if (!dealId || !pipedriveCompanyId) {
        logWarning(req, 'Missing required parameters for invoice creation');
        return res.status(400).json({ 
            error: 'Deal ID and Pipedrive Company ID are required.' 
        });
    }

    try {
        // Use auth info provided by middleware
        const pdApiDomain = req.pipedriveAuth.apiDomain;
        const pdAccessToken = req.pipedriveAuth.accessToken;

        logProcessing(req, 'Pipedrive authentication retrieved', {
            hasApiDomain: !!pdApiDomain,
            hasAccessToken: !!pdAccessToken
        });

        // Xero auth is guaranteed by middleware
        const xeroAccessToken = req.xeroAuth.accessToken;
        const xeroTenantId = req.xeroAuth.tenantId;

        logProcessing(req, 'Xero authentication verified', {
            hasAccessToken: !!xeroAccessToken,
            hasTenantId: !!xeroTenantId
        });

        // Fetch deal details to get quote number
        logProcessing(req, 'Fetching Pipedrive deal details', { dealId });
        const dealDetails = await pipedriveApiService.getDealDetails(pdApiDomain, pdAccessToken, dealId);
        
        if (!dealDetails) {
            logWarning(req, 'Deal not found', { dealId });
            return res.status(404).json({ 
                error: `Deal with ID ${dealId} not found.` 
            });
        }

        const quoteCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
        const invoiceCustomFieldKey = process.env.PIPEDRIVE_INVOICE_CUSTOM_FIELD_KEY;
        
        const quoteNumber = quoteCustomFieldKey ? dealDetails[quoteCustomFieldKey] : null;
        const existingInvoiceNumber = invoiceCustomFieldKey ? dealDetails[invoiceCustomFieldKey] : null;

        logProcessing(req, 'Deal details retrieved', {
            dealTitle: dealDetails.title,
            quoteNumber: quoteNumber,
            existingInvoiceNumber: existingInvoiceNumber,
            hasQuoteCustomField: !!quoteCustomFieldKey,
            hasInvoiceCustomField: !!invoiceCustomFieldKey
        });

        // Check if deal has a quote number
        if (!quoteNumber) {
            logWarning(req, 'Deal has no quote number', { dealId });
            return res.status(400).json({ 
                error: 'Deal does not have an associated quote number. Please create a quote first.' 
            });
        }

        // Check if deal already has an invoice
        if (existingInvoiceNumber) {
            logWarning(req, 'Deal already has an invoice', { dealId, existingInvoiceNumber });
            return res.status(400).json({ 
                error: `Deal already has an associated invoice: ${existingInvoiceNumber}` 
            });
        }

        // Find the quote in Xero
        logProcessing(req, 'Looking for quote in Xero', { quoteNumber });
        const xeroQuote = await xeroApiService.findXeroQuoteByNumber(xeroAccessToken, xeroTenantId, quoteNumber);
        
        if (!xeroQuote) {
            logWarning(req, 'Quote not found in Xero', { quoteNumber });
            return res.status(404).json({ 
                error: `Quote ${quoteNumber} not found in Xero.` 
            });
        }

        logProcessing(req, 'Quote found in Xero', {
            quoteId: xeroQuote.QuoteID,
            quoteNumber: xeroQuote.QuoteNumber,
            quoteStatus: xeroQuote.Status
        });

        // Check if quote is accepted (required before creating invoice)
        if (xeroQuote.Status !== 'ACCEPTED') {
            logWarning(req, 'Quote not accepted', { quoteNumber, status: xeroQuote.Status });
            return res.status(400).json({ 
                error: `Quote ${quoteNumber} must be accepted before creating an invoice. Current status: ${xeroQuote.Status}` 
            });
        }

        // Create invoice from quote
        logProcessing(req, 'Creating invoice from quote', { quoteId: xeroQuote.QuoteID });
        const createdInvoice = await xeroApiService.createInvoiceFromQuote(xeroAccessToken, xeroTenantId, xeroQuote.QuoteID);

        logProcessing(req, 'Invoice created successfully', {
            invoiceId: createdInvoice.InvoiceID,
            invoiceNumber: createdInvoice.InvoiceNumber,
            invoiceStatus: createdInvoice.Status
        });

        // Update Pipedrive deal with invoice number if custom field is configured
        let updateWarning = null;
        if (invoiceCustomFieldKey) {
            try {
                logProcessing(req, 'Updating Pipedrive deal with invoice number', { 
                    dealId, 
                    invoiceNumber: createdInvoice.InvoiceNumber 
                });
                
                await pipedriveApiService.updateDealCustomField(
                    pdApiDomain, 
                    pdAccessToken, 
                    dealId, 
                    invoiceCustomFieldKey, 
                    createdInvoice.InvoiceNumber
                );

                logSuccess(req, 'Pipedrive deal updated with invoice number', {
                    dealId,
                    invoiceNumber: createdInvoice.InvoiceNumber
                });
            } catch (updateError) {
                logWarning(req, 'Failed to update Pipedrive deal', {
                    dealId,
                    error: updateError.message
                });
                updateWarning = updateError.message;
            }
        } else {
            logWarning(req, 'PIPEDRIVE_INVOICE_CUSTOM_FIELD_KEY not configured - skipping deal update');
            updateWarning = 'Invoice custom field key not configured in environment';
        }

        // Prepare response
        const response = {
            success: true,
            invoice: createdInvoice,
            quoteNumber: quoteNumber,
            invoiceNumber: createdInvoice.InvoiceNumber,
            message: `Invoice created successfully from quote ${quoteNumber}`
        };

        if (updateWarning) {
            response.warning = `Invoice created but failed to update Pipedrive deal: ${updateWarning}`;
        }

        logSuccess(req, 'Invoice creation completed', {
            dealId,
            quoteNumber,
            invoiceNumber: createdInvoice.InvoiceNumber,
            hasWarning: !!updateWarning
        });

        res.json(response);

    } catch (error) {
        logWarning(req, 'Error creating invoice from quote', {
            dealId,
            error: error.message,
            stack: error.stack
        });

        return res.status(500).json({ 
            error: `Failed to create invoice from quote: ${error.message}` 
        });
    }
};

/**
 * Creates a partial invoice from a quote using selected line items
 * 
 * @param {Object} req - Express request object with body containing dealId, pipedriveCompanyId, and selectedLineItems
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with created invoice details or error response
 * @throws {Error} Returns 400 for missing params, 404 for deal/quote not found, 500 for API errors
 */
export const createPartialInvoiceFromQuote = async (req, res) => {
    const { dealId, pipedriveCompanyId, selectedLineItems } = req.body;

    logProcessing(req, 'Validating input parameters for partial invoice creation', { 
        dealId: !!dealId, 
        pipedriveCompanyId: !!pipedriveCompanyId,
        selectedLineItems: !!selectedLineItems
    });

    if (!dealId || !pipedriveCompanyId || !selectedLineItems) {
        logWarning(req, 'Missing required parameters for partial invoice creation');
        return res.status(400).json({ 
            error: 'Deal ID, Pipedrive Company ID, and selected line items are required.' 
        });
    }

    // Additional validation for selectedLineItems
    if (!Array.isArray(selectedLineItems) || selectedLineItems.length === 0) {
        logWarning(req, 'Invalid selected line items for partial invoice creation');
        return res.status(400).json({ 
            error: 'At least one line item must be selected for partial invoicing.' 
        });
    }

    try {
        // Use auth info provided by middleware
        const pdApiDomain = req.pipedriveAuth.apiDomain;
        const pdAccessToken = req.pipedriveAuth.accessToken;

        logProcessing(req, 'Pipedrive authentication retrieved', {
            hasApiDomain: !!pdApiDomain,
            hasAccessToken: !!pdAccessToken
        });

        // Xero auth is guaranteed by middleware
        const xeroAccessToken = req.xeroAuth.accessToken;
        const xeroTenantId = req.xeroAuth.tenantId;

        logProcessing(req, 'Xero authentication verified', {
            hasAccessToken: !!xeroAccessToken,
            hasTenantId: !!xeroTenantId
        });

        // Fetch deal details to get quote number
        logProcessing(req, 'Fetching Pipedrive deal details', { dealId });
        const dealDetails = await pipedriveApiService.getDealDetails(pdApiDomain, pdAccessToken, dealId);
        
        if (!dealDetails) {
            logWarning(req, 'Deal not found', { dealId });
            return res.status(404).json({ 
                error: `Deal with ID ${dealId} not found.` 
            });
        }

        const quoteCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
        const invoiceCustomFieldKey = process.env.PIPEDRIVE_INVOICE_CUSTOM_FIELD_KEY;
        
        const quoteNumber = quoteCustomFieldKey ? dealDetails[quoteCustomFieldKey] : null;
        const existingInvoiceNumber = invoiceCustomFieldKey ? dealDetails[invoiceCustomFieldKey] : null;

        logProcessing(req, 'Deal details retrieved', {
            dealTitle: dealDetails.title,
            quoteNumber: quoteNumber,
            existingInvoiceNumber: existingInvoiceNumber,
            hasQuoteCustomField: !!quoteCustomFieldKey,
            hasInvoiceCustomField: !!invoiceCustomFieldKey
        });

        // Check if deal has a quote number
        if (!quoteNumber) {
            logWarning(req, 'Deal has no quote number', { dealId });
            return res.status(400).json({ 
                error: 'Deal does not have an associated quote number. Please create a quote first.' 
            });
        }

        // Check if deal already has an invoice
        if (existingInvoiceNumber) {
            logWarning(req, 'Deal already has an invoice', { dealId, existingInvoiceNumber });
            return res.status(400).json({ 
                error: `Deal already has an associated invoice: ${existingInvoiceNumber}` 
            });
        }

        // Find the quote in Xero
        logProcessing(req, 'Looking for quote in Xero', { quoteNumber });
        const xeroQuote = await xeroApiService.findXeroQuoteByNumber(xeroAccessToken, xeroTenantId, quoteNumber);
        
        if (!xeroQuote) {
            logWarning(req, 'Quote not found in Xero', { quoteNumber });
            return res.status(404).json({ 
                error: `Quote ${quoteNumber} not found in Xero.` 
            });
        }

        logProcessing(req, 'Quote found in Xero', {
            quoteId: xeroQuote.QuoteID,
            quoteNumber: xeroQuote.QuoteNumber,
            quoteStatus: xeroQuote.Status
        });

        // Check if quote is accepted (required before creating invoice)
        if (xeroQuote.Status !== 'ACCEPTED') {
            logWarning(req, 'Quote not accepted', { quoteNumber, status: xeroQuote.Status });
            return res.status(400).json({ 
                error: `Quote ${quoteNumber} must be accepted before creating an invoice. Current status: ${xeroQuote.Status}` 
            });
        }

        // Validate selected line items
        const validationResult = validateSelectedLineItems(selectedLineItems, xeroQuote.LineItems);
        if (!validationResult.isValid) {
            logWarning(req, 'Invalid selected line items', { error: validationResult.error });
            return res.status(400).json({ error: validationResult.error });
        }

        // Create partial invoice from quote
        logProcessing(req, 'Creating partial invoice from quote', { 
            quoteId: xeroQuote.QuoteID,
            selectedItemsCount: selectedLineItems.length 
        });

        // Create a new invoice payload with selected line items
        const invoicePayload = {
            Type: 'ACCREC',
            Contact: {
                ContactID: xeroQuote.Contact.ContactID
            },
            Date: new Date().toISOString().split('T')[0],
            DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            LineItems: selectedLineItems.map(selectedItem => {
                const originalItem = xeroQuote.LineItems.find(item => item.LineItemID === selectedItem.lineItemId);
                return {
                    Description: originalItem.Description,
                    Quantity: selectedItem.quantity,
                    UnitAmount: originalItem.UnitAmount,
                    AccountCode: originalItem.AccountCode || '200',
                    TaxType: originalItem.TaxType || 'NONE',
                    ...(originalItem.Tracking && { Tracking: originalItem.Tracking })
                };
            }),
            Status: 'DRAFT',
            Reference: `Partial Invoice from Quote: ${quoteNumber}`,
            ...(xeroQuote.CurrencyCode && { CurrencyCode: xeroQuote.CurrencyCode })
        };

        // Create the invoice
        const createdInvoice = await xeroApiService.createInvoice(xeroAccessToken, xeroTenantId, invoicePayload);

        logProcessing(req, 'Partial invoice created successfully', {
            invoiceId: createdInvoice.InvoiceID,
            invoiceNumber: createdInvoice.InvoiceNumber,
            invoiceStatus: createdInvoice.Status
        });

        // Update Pipedrive deal with invoice number if custom field is configured
        let updateWarning = null;
        if (invoiceCustomFieldKey) {
            try {
                logProcessing(req, 'Updating Pipedrive deal with invoice number', { 
                    dealId, 
                    invoiceNumber: createdInvoice.InvoiceNumber 
                });
                
                await pipedriveApiService.updateDealCustomField(
                    pdApiDomain, 
                    pdAccessToken, 
                    dealId, 
                    invoiceCustomFieldKey, 
                    createdInvoice.InvoiceNumber
                );

                logSuccess(req, 'Pipedrive deal updated with invoice number', {
                    dealId,
                    invoiceNumber: createdInvoice.InvoiceNumber
                });
            } catch (updateError) {
                logWarning(req, 'Failed to update Pipedrive deal', {
                    dealId,
                    error: updateError.message
                });
                updateWarning = updateError.message;
            }
        } else {
            logWarning(req, 'PIPEDRIVE_INVOICE_CUSTOM_FIELD_KEY not configured - skipping deal update');
            updateWarning = 'Invoice custom field key not configured in environment';
        }

        // Prepare response
        const response = {
            success: true,
            invoice: createdInvoice,
            quoteNumber: quoteNumber,
            invoiceNumber: createdInvoice.InvoiceNumber,
            message: `Partial invoice created successfully from quote ${quoteNumber}`,
            selectedLineItems: selectedLineItems.map(item => ({
                lineItemId: item.lineItemId,
                quantity: item.quantity
            }))
        };

        if (updateWarning) {
            response.warning = `Invoice created but failed to update Pipedrive deal: ${updateWarning}`;
        }

        logSuccess(req, 'Partial invoice creation completed', {
            dealId,
            quoteNumber,
            invoiceNumber: createdInvoice.InvoiceNumber,
            hasWarning: !!updateWarning
        });

        res.json(response);

    } catch (error) {
        logWarning(req, 'Error creating partial invoice from quote', {
            dealId,
            error: error.message,
            stack: error.stack
        });

        return res.status(500).json({ 
            error: `Failed to create partial invoice from quote: ${error.message}` 
        });
    }
};

