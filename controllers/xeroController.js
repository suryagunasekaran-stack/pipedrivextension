/**
 * @fileoverview Xero API Controller for Xero integration endpoints.
 * Handles Xero authentication status, quote creation, and project management.
 * Manages Xero OAuth tokens and API interactions with comprehensive error handling.
 */

import 'dotenv/config';
import * as xeroApiService from '../services/xeroApiService.js';
import * as xeroBusinessService from '../services/xeroBusinessService.js';
import * as tokenService from '../services/secureTokenService.js';
import * as pipedriveApiService from '../services/pipedriveApiService.js';
import { batchOperations } from '../services/batchOperationsService.js';
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
                authUrl: `${process.env.API_BASE_URL || 'http://localhost:3000'}/auth/connect-xero?pipedriveCompanyId=${pipedriveCompanyId}`
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

        // Use batch operations to fetch all required data at once
        logProcessing(req, 'Fetching deal data with batch operations', { pipedriveDealId });
        
        let dealData;
        try {
            dealData = await batchOperations.prepareQuoteCreationData({
                pipedriveAuth: { apiDomain: pdApiDomain, accessToken: pdAccessToken },
                dealId: pipedriveDealId,
                cache: req.cache || new Map()
            });
        } catch (error) {
            if (error.message.includes('not found')) {
                logWarning(req, 'Deal not found', { pipedriveDealId });
                return res.status(404).json({ error: `Pipedrive Deal ${pipedriveDealId} not found.` });
            } else if (error.message.includes('organization')) {
                logWarning(req, 'Deal missing organization association');
                return res.status(400).json({ error: error.message });
            }
            throw error;
        }

        const { deal: dealDetails, organization: organizationDetails, person: personDetails, products, contactEmail } = dealData;

        logProcessing(req, 'Deal data retrieved', {
            dealTitle: dealDetails.title,
            dealValue: dealDetails.value,
            orgName: organizationDetails.name,
            hasPersonEmail: !!contactEmail,
            productsCount: products.length
        });

        // Use business service to find or create Xero contact
        logProcessing(req, 'Finding or creating Xero contact', { 
            dealId: pipedriveDealId,
            hasOrgId: !!(dealDetails.org_id && dealDetails.org_id.value)
        });

        let xeroContactID;
        try {
            xeroContactID = await xeroBusinessService.findOrCreateXeroContact(
                { xeroAccessToken, xeroTenantId },
                dealDetails,
                { apiDomain: pdApiDomain, accessToken: pdAccessToken }
            );
            
            logProcessing(req, 'Xero contact ready', { 
                contactId: xeroContactID 
            });
        } catch (contactError) {
            logWarning(req, 'Failed to find or create Xero contact', {
                error: contactError.message,
                dealId: pipedriveDealId
            });
            return res.status(400).json({ 
                error: contactError.message 
            });
        }

        // Validate quote creation eligibility
        try {
            // Use already fetched products for validation
            const dealWithProducts = {
                ...dealDetails,
                products: products
            };
            
            validateQuoteCreation(dealWithProducts);
        } catch (validationError) {
            logWarning(req, 'Quote creation validation failed', {
                error: validationError.message,
                dealId: pipedriveDealId
            });
            return res.status(400).json({ error: validationError.message });
        }

        // Use already fetched products (no need to fetch again)
        const dealProducts = products;
        logProcessing(req, 'Using batch-fetched deal products', {
            productsCount: dealProducts.length,
            totalProductValue: dealProducts.reduce((sum, p) => sum + ((p.item_price || 0) * (p.quantity || 1)), 0)
        });

        // Build line items using test-driven utility
        let lineItems;
        try {
            const mappingOptions = {
                defaultTaxType: process.env.XERO_DEFAULT_TAX_TYPE || 'NONE',
                defaultAccountCode: process.env.XERO_DEFAULT_ACCOUNT_CODE || '200'
            };
            lineItems = mapProductsToLineItems(dealProducts, mappingOptions);
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
        
        // Use business service to create quote
        const idempotencyKey = uuidv4();
        const pipedriveDealReference = `Pipedrive Deal ID: ${pipedriveDealId}`;

        logProcessing(req, 'Creating Xero quote using business service', {
            contactId: xeroContactID,
            lineItemsCount: lineItems.length,
            hasIdempotencyKey: !!idempotencyKey
        });

        const createdQuote = await xeroBusinessService.createQuoteFromDeal(
            { xeroAccessToken, xeroTenantId },
            {
                dealDetails,
                contactId: xeroContactID,
                lineItems,
                idempotencyKey,
                pipedriveDealReference
            }
        );
        
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
        // Enhanced error handling to prevent server crashes
        logWarning(req, 'Error creating Xero quote', {
            dealId: pipedriveDealId,
            error: error.message,
            stack: error.stack?.split('\n')[0] // Only first line of stack for conciseness
        });

        // Handle specific Xero API validation errors
        if (error.message.includes('Tax Rate') || error.message.includes('tax')) {
            logProcessing(req, 'Tax rate validation error detected, attempting retry with default tax settings');
            
            try {
                // Retry with safe default tax settings
                const safeLineItems = lineItems.map(item => ({
                    ...item,
                    TaxType: 'NONE', // Use 'NONE' as safest default
                    TaxRate: 0 // Explicitly set tax rate to 0
                }));

                logProcessing(req, 'Retrying quote creation with safe tax defaults', {
                    lineItemsCount: safeLineItems.length
                });

                const retriedQuote = await xeroBusinessService.createQuoteFromDeal(
                    { xeroAccessToken, xeroTenantId },
                    {
                        dealDetails,
                        contactId: xeroContactID,
                        lineItems: safeLineItems,
                        idempotencyKey: uuidv4(), // New idempotency key for retry
                        pipedriveDealReference
                    }
                );

                if (retriedQuote && retriedQuote.QuoteNumber) {
                    logProcessing(req, 'Quote created successfully on retry with default tax settings', {
                        quoteNumber: retriedQuote.QuoteNumber,
                        quoteId: retriedQuote.QuoteID
                    });

                    // Update Pipedrive with the successful quote
                    try {
                        await pipedriveApiService.updateDealWithQuoteNumber(pdApiDomain, pdAccessToken, pipedriveDealId, retriedQuote.QuoteNumber);
                        
                        const quoteIdCustomFieldKey = process.env.PIPEDRIVE_QUOTE_ID;
                        if (quoteIdCustomFieldKey && retriedQuote.QuoteID) {
                            await pipedriveApiService.updateDealCustomField(pdApiDomain, pdAccessToken, pipedriveDealId, quoteIdCustomFieldKey, retriedQuote.QuoteID);
                        }
                        
                        const responseData = {
                            message: 'Xero quote created successfully with default tax settings (0% tax rate)!',
                            quoteNumber: retriedQuote.QuoteNumber,
                            quoteId: retriedQuote.QuoteID,
                            xeroContactID: xeroContactID,
                            status: retriedQuote.Status,
                            warning: 'Tax rate validation failed initially, used 0% tax rate as default'
                        };

                        logSuccess(req, 'Quote creation successful on retry', responseData);
                        return res.status(201).json(responseData);
                        
                    } catch (updateError) {
                        const responseData = {
                            message: 'Xero quote created with default tax settings, but failed to update Pipedrive deal.',
                            quoteNumber: retriedQuote.QuoteNumber,
                            quoteId: retriedQuote.QuoteID,
                            xeroContactID: xeroContactID,
                            status: retriedQuote.Status,
                            warning: 'Tax rate validation failed initially, used 0% tax rate as default',
                            pipedriveUpdateError: updateError.message
                        };

                        logSuccess(req, 'Quote created on retry with Pipedrive update warning', responseData);
                        return res.status(201).json(responseData);
                    }
                }

            } catch (retryError) {
                logWarning(req, 'Quote creation failed on retry attempt', {
                    retryError: retryError.message
                });
                
                // Fall through to generic error handling
                return res.status(400).json({
                    error: 'Failed to create Xero quote due to tax rate validation issues',
                    details: `Initial error: ${error.message}. Retry with default tax settings also failed: ${retryError.message}`,
                    suggestion: 'Please check your Xero tax rate configuration or contact system administrator'
                });
            }
        }

        // Handle other specific error types
        if (error.message.includes('contact') || error.message.includes('Contact')) {
            return res.status(400).json({
                error: 'Contact validation failed',
                details: error.message,
                suggestion: 'Please ensure the deal has a valid organization and contact information'
            });
        }

        if (error.message.includes('line item') || error.message.includes('LineItem')) {
            return res.status(400).json({
                error: 'Line item validation failed',
                details: error.message,
                suggestion: 'Please check the deal products have valid prices and quantities'
            });
        }

        if (error.message.includes('authentication') || error.message.includes('401')) {
            return res.status(401).json({
                error: 'Xero authentication failed',
                details: 'Please check your Xero connection and try again',
                suggestion: 'Reconnect to Xero through the settings page'
            });
        }

        if (error.message.includes('permission') || error.message.includes('403')) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                details: 'Your Xero connection does not have permission to create quotes',
                suggestion: 'Please check your Xero app permissions'
            });
        }

        // Generic error handling - return error without crashing server
        return res.status(500).json({
            error: 'Failed to create Xero quote',
            details: error.message,
            suggestion: 'Please try again or contact support if the issue persists'
        });
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
        const xeroAccessToken = req.xeroAuth.accessToken;
        const xeroTenantId = req.xeroAuth.tenantId;

        logProcessing(req, 'Authentication verified', {
            hasPipedriveAuth: !!pdApiDomain && !!pdAccessToken,
            hasXeroAuth: !!xeroAccessToken && !!xeroTenantId
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

        // Use the business service to accept the quote
        logProcessing(req, 'Attempting to accept Xero quote using business service', { 
            quoteId: xeroQuoteId,
            dealId 
        });

        const acceptanceResult = await xeroBusinessService.acceptQuoteWithBusinessRules(
            { xeroAccessToken, xeroTenantId },
            xeroQuoteId,
            { dealId, companyId: pipedriveCompanyId }
        );

        if (acceptanceResult.accepted) {
            const responseData = {
                success: true,
                message: acceptanceResult.alreadyAccepted 
                    ? `Quote ${xeroQuoteId} was already accepted in Xero.`
                    : `Quote ${xeroQuoteId} successfully accepted in Xero.`,
                data: {
                    quoteId: acceptanceResult.quoteId,
                    quoteNumber: acceptanceResult.quoteNumber,
                    status: acceptanceResult.status,
                    dealId: dealId,
                    alreadyAccepted: acceptanceResult.alreadyAccepted || false
                }
            };

            logSuccess(req, 'Quote acceptance completed successfully', {
                quoteId: xeroQuoteId,
                quoteNumber: acceptanceResult.quoteNumber,
                status: acceptanceResult.status,
                dealId,
                alreadyAccepted: acceptanceResult.alreadyAccepted || false
            });

            res.status(200).json(responseData);
        } else {
            logWarning(req, 'Quote acceptance failed', {
                quoteId: xeroQuoteId,
                dealId,
                error: acceptanceResult.error
            });
            
            // Return appropriate error response based on error details
            const statusCode = acceptanceResult.statusCode || 500;
            return res.status(statusCode).json({ 
                error: acceptanceResult.error || 'Failed to accept quote',
                details: acceptanceResult.details,
                quoteId: xeroQuoteId
            });
        }

    } catch (error) {
        logWarning(req, 'Error accepting Xero quote', {
            dealId,
            pipedriveCompanyId,
            error: error.message,
            stack: error.stack
        });

        // Generic error handling
        return res.status(500).json({ 
            error: 'Internal server error while accepting Xero quote',
            details: error.message
        });
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
 * Updates a Xero quote with versioning based on deal data
 * 
 * @param {Object} req - Express request object with body containing dealId, companyId, and quoteId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with updated quote details or error response
 * @throws {Error} Returns 400 for missing params, 401 for auth issues, 404 for not found, 409 for status conflicts, 500 for API errors
 */
export const updateQuoteWithVersioning = async (req, res) => {
    const { dealId, companyId, quoteId } = req.body;

    logProcessing(req, 'Validating input parameters for quote update with versioning', { 
        dealId: !!dealId, 
        companyId: !!companyId,
        quoteId: !!quoteId
    });

    if (!dealId || !companyId || !quoteId) {
        logWarning(req, 'Missing required parameters');
        return res.status(400).json({ 
            success: false,
            error: 'Validation failed',
            details: 'Deal ID, Company ID, and Quote ID are required',
            code: 400
        });
    }

    try {
        // Use auth info provided by middleware
        const pdApiDomain = req.pipedriveAuth.apiDomain;
        const pdAccessToken = req.pipedriveAuth.accessToken;
        const xeroAccessToken = req.xeroAuth.accessToken;
        const xeroTenantId = req.xeroAuth.tenantId;

        logProcessing(req, 'Authentication verified for both platforms', {
            hasApiDomain: !!pdApiDomain,
            hasAccessToken: !!pdAccessToken,
            hasXeroAccessToken: !!xeroAccessToken,
            hasXeroTenantId: !!xeroTenantId
        });

        // Step 1: Get current quote to check status
        logProcessing(req, 'Fetching current quote from Xero', { quoteId });
        const currentQuote = await xeroApiService.getXeroQuoteById(xeroAccessToken, xeroTenantId, quoteId);
        
        if (!currentQuote) {
            logWarning(req, 'Quote not found in Xero', { quoteId });
            return res.status(404).json({ 
                success: false,
                error: 'Quote not found',
                details: `Quote with ID ${quoteId} not found in Xero`,
                code: 404
            });
        }

        // Step 2: Check if quote can be updated (must be DRAFT)
        if (currentQuote.Status !== 'DRAFT') {
            logWarning(req, 'Quote status conflict - not in DRAFT', { 
                quoteId, 
                currentStatus: currentQuote.Status,
                quoteNumber: currentQuote.QuoteNumber
            });
            return res.status(409).json({ 
                success: false,
                error: 'Quote status conflict',
                details: `Quote ${currentQuote.QuoteNumber} is in ${currentQuote.Status} status and cannot be updated. Only DRAFT quotes can be modified.`,
                code: 409
            });
        }

        // Step 3: Fetch updated deal products from Pipedrive
        logProcessing(req, 'Fetching updated deal products from Pipedrive', { dealId });
        const dealProducts = await pipedriveApiService.getDealProducts(pdApiDomain, pdAccessToken, dealId);
        
        logProcessing(req, 'Deal products retrieved', {
            productsCount: dealProducts.length,
            totalProductValue: dealProducts.reduce((sum, p) => sum + ((p.item_price || 0) * (p.quantity || 1)), 0)
        });

        // Step 4: Transform products to line items (reuse existing logic)
        const { mapProductsToLineItems } = await import('../utils/quoteBusinessRules.js');
        let lineItems;
        
        try {
            const mappingOptions = {
                defaultTaxType: process.env.XERO_DEFAULT_TAX_TYPE || 'NONE',
                defaultAccountCode: process.env.XERO_DEFAULT_ACCOUNT_CODE || '200'
            };
            lineItems = mapProductsToLineItems(dealProducts, mappingOptions);
        } catch (mappingError) {
            logWarning(req, 'Product to line item mapping failed', {
                error: mappingError.message,
                productsCount: dealProducts.length
            });
            return res.status(400).json({ 
                success: false,
                error: 'Validation failed',
                details: 'Cannot update quote with invalid line items: ' + mappingError.message,
                code: 400
            });
        }

        logProcessing(req, 'Line items prepared for update', {
            lineItemsCount: lineItems.length,
            totalAmount: lineItems.reduce((sum, item) => sum + (item.UnitAmount * item.Quantity), 0)
        });

        // Step 5: Update quote with versioning (this will use our new updateQuote function)
        logProcessing(req, 'Updating quote in Xero with versioning', { 
            quoteId,
            originalQuoteNumber: currentQuote.QuoteNumber,
            lineItemsCount: lineItems.length
        });

        const updatedQuote = await xeroApiService.updateQuote(
            xeroAccessToken, 
            xeroTenantId, 
            quoteId, 
            { LineItems: lineItems }
        );

        logSuccess(req, 'Quote updated successfully with versioning', {
            quoteId: updatedQuote.QuoteID,
            originalQuoteNumber: currentQuote.QuoteNumber,
            updatedQuoteNumber: updatedQuote.QuoteNumber,
            status: updatedQuote.Status,
            lineItemsCount: updatedQuote.LineItems?.length || 0,
            total: updatedQuote.Total
        });

        // Step 6: Update Pipedrive deal with new versioned quote number
        let pipedriveUpdateWarning = null;
        const quoteCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
        
        if (quoteCustomFieldKey && updatedQuote.QuoteNumber) {
            try {
                logProcessing(req, 'Updating Pipedrive deal with new versioned quote number', { 
                    dealId,
                    originalQuoteNumber: currentQuote.QuoteNumber,
                    newQuoteNumber: updatedQuote.QuoteNumber,
                    customFieldKey: quoteCustomFieldKey
                });
                
                await pipedriveApiService.updateDealCustomField(
                    pdApiDomain, 
                    pdAccessToken, 
                    dealId, 
                    quoteCustomFieldKey, 
                    updatedQuote.QuoteNumber
                );

                logSuccess(req, 'Pipedrive deal updated with versioned quote number', {
                    dealId,
                    originalQuoteNumber: currentQuote.QuoteNumber,
                    newQuoteNumber: updatedQuote.QuoteNumber
                });
            } catch (pipedriveError) {
                logWarning(req, 'Failed to update Pipedrive deal with new quote number', {
                    dealId,
                    error: pipedriveError.message,
                    newQuoteNumber: updatedQuote.QuoteNumber
                });
                pipedriveUpdateWarning = pipedriveError.message;
            }
        } else {
            logWarning(req, 'PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY not configured - skipping Pipedrive update');
            pipedriveUpdateWarning = 'Quote custom field key not configured in environment';
        }

        // Step 7: Return success response
        const response = {
            success: true,
            message: "Quote updated successfully with version increment",
            data: {
                dealId: dealId,
                quoteId: updatedQuote.QuoteID,
                originalQuoteNumber: currentQuote.QuoteNumber,
                updatedQuoteNumber: updatedQuote.QuoteNumber,
                status: updatedQuote.Status,
                lineItemsUpdated: updatedQuote.LineItems?.length || 0,
                totalAmount: updatedQuote.Total || 0,
                currency: updatedQuote.CurrencyCode || 'USD',
                lastUpdated: new Date().toISOString(),
                versionHistory: {
                    previousVersion: currentQuote.QuoteNumber,
                    currentVersion: updatedQuote.QuoteNumber,
                    versionIncrement: 1
                },
                pipedriveUpdated: !pipedriveUpdateWarning
            }
        };

        // Add warning if Pipedrive update failed
        if (pipedriveUpdateWarning) {
            response.warning = `Quote updated successfully but failed to update Pipedrive deal: ${pipedriveUpdateWarning}`;
        }

        res.status(200).json(response);

    } catch (error) {
        logWarning(req, 'Error updating quote with versioning', {
            dealId,
            companyId,
            quoteId,
            error: error.message,
            stack: error.stack
        });

        // Return appropriate error response based on error type
        if (error.message.includes('not authenticated') || error.message.includes('Authentication failed')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authentication failed',
                details: error.message,
                code: 401
            });
        } else if (error.message.includes('not found')) {
            return res.status(404).json({ 
                success: false,
                error: 'Quote not found',
                details: error.message,
                code: 404
            });
        } else if (error.message.includes('validation') || error.message.includes('required')) {
            return res.status(400).json({ 
                success: false,
                error: 'Validation failed',
                details: error.message,
                code: 400
            });
        } else if (error.message.includes('DRAFT status') || error.message.includes('status conflict')) {
            return res.status(409).json({ 
                success: false,
                error: 'Quote status conflict',
                details: error.message,
                code: 409
            });
        } else {
            return res.status(500).json({ 
                success: false,
                error: 'Internal server error',
                details: error.message,
                code: 500
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
            Status: 'SENT',
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

/**
 * Creates an invoice from a quote by first comparing Pipedrive and Xero data for validation
 * Uses the same validation logic as quote creation but for invoice processing
 * 
 * @param {Object} req - Express request object with body containing dealId and pipedriveCompanyId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with created invoice details or error response
 * @throws {Error} Returns 400 for missing params, 404 for deal/quote not found, 500 for API errors
 */
export const createInvoiceFromDeal = async (req, res) => {
    const { dealId, pipedriveCompanyId } = req.body;

    logProcessing(req, 'Validating input parameters for invoice creation from deal', { 
        dealId: !!dealId, 
        pipedriveCompanyId: !!pipedriveCompanyId 
    });

    if (!dealId || !pipedriveCompanyId) {
        logWarning(req, 'Missing required parameters for invoice creation from deal');
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

        // Fetch deal details to get quote information
        logProcessing(req, 'Fetching Pipedrive deal details', { dealId });
        const dealDetails = await pipedriveApiService.getDealDetails(pdApiDomain, pdAccessToken, dealId);
        
        if (!dealDetails) {
            logWarning(req, 'Deal not found', { dealId });
            return res.status(404).json({ 
                error: `Deal with ID ${dealId} not found.` 
            });
        }

        const quoteCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
        const quoteIdCustomFieldKey = process.env.PIPEDRIVE_QUOTE_ID;
        const invoiceCustomFieldKey = process.env.PIPEDRIVE_INVOICENUMBER;
        const invoiceIdCustomFieldKey = process.env.PIPEDRIVE_INVOICEID;
        const pendingStatusFieldKey = process.env.PIPEDRIVE_PENDING;
        
        const quoteNumber = quoteCustomFieldKey ? dealDetails[quoteCustomFieldKey] : null;
        const quoteId = quoteIdCustomFieldKey ? dealDetails[quoteIdCustomFieldKey] : null;
        const existingInvoiceNumber = invoiceCustomFieldKey ? dealDetails[invoiceCustomFieldKey] : null;

        logProcessing(req, 'Deal details retrieved', {
            dealTitle: dealDetails.title,
            quoteNumber: quoteNumber,
            quoteId: quoteId,
            existingInvoiceNumber: existingInvoiceNumber,
            hasQuoteCustomField: !!quoteCustomFieldKey,
            hasQuoteIdCustomField: !!quoteIdCustomFieldKey,
            hasInvoiceCustomField: !!invoiceCustomFieldKey
        });

        // Validate that deal has a quote
        if (!quoteNumber && !quoteId) {
            logWarning(req, 'Deal has no quote information', { dealId });
            return res.status(400).json({ 
                error: 'Deal does not have an associated quote. Please create a quote first.' 
            });
        }

        // Check if deal already has an invoice
        if (existingInvoiceNumber) {
            logWarning(req, 'Deal already has an invoice', { dealId, existingInvoiceNumber });
            return res.status(400).json({ 
                error: `Deal already has an associated invoice: ${existingInvoiceNumber}` 
            });
        }

        // Find the quote in Xero using the quote ID from the environment variable
        let xeroQuote = null;
        if (quoteId) {
            // First try using the specific quote ID from PIPEDRIVE_QUOTE_ID=639901ad29bc8ae8c8fe6db44b80e64712d077ae
            if (quoteId === process.env.PIPEDRIVE_QUOTE_ID) {
                logProcessing(req, 'Using specific quote ID from environment', { 
                    quoteId: process.env.PIPEDRIVE_QUOTE_ID 
                });
                xeroQuote = await xeroApiService.getXeroQuoteById(xeroAccessToken, xeroTenantId, process.env.PIPEDRIVE_QUOTE_ID);
            } else {
                logProcessing(req, 'Looking for quote by ID', { quoteId });
                xeroQuote = await xeroApiService.getXeroQuoteById(xeroAccessToken, xeroTenantId, quoteId);
            }
        }

        // If no quote found by ID, try finding by quote number
        if (!xeroQuote && quoteNumber) {
            logProcessing(req, 'Looking for quote by number', { quoteNumber });
            xeroQuote = await xeroApiService.findXeroQuoteByNumber(xeroAccessToken, xeroTenantId, quoteNumber);
        }
        
        if (!xeroQuote) {
            logWarning(req, 'Quote not found in Xero', { quoteNumber, quoteId });
            return res.status(404).json({ 
                error: `Quote not found in Xero. Quote Number: ${quoteNumber || 'N/A'}, Quote ID: ${quoteId || 'N/A'}` 
            });
        }

        logProcessing(req, 'Quote found in Xero', {
            quoteId: xeroQuote.QuoteID,
            quoteNumber: xeroQuote.QuoteNumber,
            quoteStatus: xeroQuote.Status,
            contactId: xeroQuote.Contact?.ContactID,
            lineItemsCount: xeroQuote.LineItems?.length || 0
        });

        // Compare Pipedrive and Xero data for validation (similar to quote creation logic)
        try {
            logProcessing(req, 'Comparing Pipedrive and Xero data for validation');
            
            // Fetch deal products for comparison
            const dealProducts = await pipedriveApiService.getDealProducts(pdApiDomain, pdAccessToken, dealId);
            
            logProcessing(req, 'Deal products retrieved for comparison', {
                dealProductsCount: dealProducts.length,
                xeroLineItemsCount: xeroQuote.LineItems?.length || 0
            });

            // Basic validation - ensure quote has line items
            if (!xeroQuote.LineItems || xeroQuote.LineItems.length === 0) {
                logWarning(req, 'Quote has no line items', { quoteId: xeroQuote.QuoteID });
                return res.status(400).json({ 
                    error: 'Quote has no line items. Cannot create invoice from empty quote.' 
                });
            }

            // Validate quote status - must be ACCEPTED to create invoice
            if (xeroQuote.Status !== 'ACCEPTED') {
                logWarning(req, 'Quote not accepted', { quoteNumber: xeroQuote.QuoteNumber, status: xeroQuote.Status });
                return res.status(400).json({ 
                    error: `Quote ${xeroQuote.QuoteNumber} must be accepted before creating an invoice. Current status: ${xeroQuote.Status}` 
                });
            }

        } catch (validationError) {
            logWarning(req, 'Validation error during comparison', { 
                error: validationError.message 
            });
            return res.status(400).json({ 
                error: `Validation failed: ${validationError.message}` 
            });
        }

        // Create invoice from quote
        logProcessing(req, 'Creating invoice from quote', { quoteId: xeroQuote.QuoteID });
        const createdInvoice = await xeroApiService.createInvoiceFromQuote(xeroAccessToken, xeroTenantId, xeroQuote.QuoteID);

        logProcessing(req, 'Invoice created successfully', {
            invoiceId: createdInvoice.InvoiceID,
            invoiceNumber: createdInvoice.InvoiceNumber,
            invoiceStatus: createdInvoice.Status,
            total: createdInvoice.Total
        });

        // Update Pipedrive deal with invoice information
        let pipedriveUpdateResults = {
            invoiceNumberUpdated: false,
            invoiceIdUpdated: false,
            pendingStatusUpdated: false,
            warnings: []
        };

        // Update invoice number field if configured
        if (invoiceCustomFieldKey && createdInvoice.InvoiceNumber) {
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

                pipedriveUpdateResults.invoiceNumberUpdated = true;
                logSuccess(req, 'Pipedrive deal updated with invoice number', {
                    dealId,
                    invoiceNumber: createdInvoice.InvoiceNumber
                });
            } catch (updateError) {
                logWarning(req, 'Failed to update Pipedrive deal with invoice number', {
                    dealId,
                    error: updateError.message
                });
                pipedriveUpdateResults.warnings.push(`Failed to update invoice number: ${updateError.message}`);
            }
        } else {
            pipedriveUpdateResults.warnings.push('Invoice number custom field not configured or invoice number missing');
        }

        // Update invoice ID field if configured
        if (invoiceIdCustomFieldKey && createdInvoice.InvoiceID) {
            try {
                logProcessing(req, 'Updating Pipedrive deal with invoice ID', { 
                    dealId, 
                    invoiceId: createdInvoice.InvoiceID 
                });
                
                await pipedriveApiService.updateDealCustomField(
                    pdApiDomain, 
                    pdAccessToken, 
                    dealId, 
                    invoiceIdCustomFieldKey, 
                    createdInvoice.InvoiceID
                );

                pipedriveUpdateResults.invoiceIdUpdated = true;
                logSuccess(req, 'Pipedrive deal updated with invoice ID', {
                    dealId,
                    invoiceId: createdInvoice.InvoiceID
                });
            } catch (updateError) {
                logWarning(req, 'Failed to update Pipedrive deal with invoice ID', {
                    dealId,
                    error: updateError.message
                });
                pipedriveUpdateResults.warnings.push(`Failed to update invoice ID: ${updateError.message}`);
            }
        } else {
            pipedriveUpdateResults.warnings.push('Invoice ID custom field not configured or invoice ID missing');
        }

        // Update pending status field if configured
        if (pendingStatusFieldKey) {
            try {
                logProcessing(req, 'Updating Pipedrive deal with pending status', { 
                    dealId, 
                    status: 'Pending' 
                });
                
                await pipedriveApiService.updateDealCustomField(
                    pdApiDomain, 
                    pdAccessToken, 
                    dealId, 
                    pendingStatusFieldKey, 
                    'Pending'  // Set to "Pending" when invoice is created
                );

                pipedriveUpdateResults.pendingStatusUpdated = true;
                logSuccess(req, 'Pipedrive deal updated with pending status', {
                    dealId,
                    status: 'Pending'
                });
            } catch (updateError) {
                logWarning(req, 'Failed to update Pipedrive deal with pending status', {
                    dealId,
                    error: updateError.message
                });
                pipedriveUpdateResults.warnings.push(`Failed to update pending status: ${updateError.message}`);
            }
        } else {
            pipedriveUpdateResults.warnings.push('Pending status custom field not configured');
        }

        // Prepare response
        const response = {
            success: true,
            invoice: {
                invoiceId: createdInvoice.InvoiceID,
                invoiceNumber: createdInvoice.InvoiceNumber,
                status: createdInvoice.Status,
                total: createdInvoice.Total,
                dueDate: createdInvoice.DueDate,
                date: createdInvoice.Date,
                contactId: createdInvoice.Contact?.ContactID
            },
            quote: {
                quoteId: xeroQuote.QuoteID,
                quoteNumber: xeroQuote.QuoteNumber,
                status: xeroQuote.Status
            },
            pipedrive: {
                dealId: dealId,
                dealTitle: dealDetails.title,
                updates: pipedriveUpdateResults
            },
            message: `Invoice ${createdInvoice.InvoiceNumber} created successfully from quote ${xeroQuote.QuoteNumber}`
        };

        // Add warnings if any
        if (pipedriveUpdateResults.warnings.length > 0) {
            response.warnings = pipedriveUpdateResults.warnings;
        }

        logSuccess(req, 'Invoice creation completed successfully', {
            dealId,
            quoteNumber: xeroQuote.QuoteNumber,
            invoiceNumber: createdInvoice.InvoiceNumber,
            invoiceStatus: createdInvoice.Status,
            pipedriveUpdates: pipedriveUpdateResults,
            hasWarnings: pipedriveUpdateResults.warnings.length > 0
        });

        res.json(response);

    } catch (error) {
        logWarning(req, 'Error creating invoice from deal', {
            dealId,
            error: error.message,
            stack: error.stack
        });

        return res.status(500).json({ 
            error: `Failed to create invoice from deal: ${error.message}` 
        });
    }
};

/**
 * Creates an invoice from a quote with document upload support
 * Handles both invoice creation and optional document attachments
 * 
 * @param {Object} req - Express request object with form data including dealId, pipedriveCompanyId, and optional files
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with created invoice details and attachment results
 * @throws {Error} Returns 400 for missing params, 404 for deal/quote not found, 500 for API errors
 */
export const createInvoiceWithDocuments = async (req, res) => {
    const { dealId, pipedriveCompanyId } = req.body;
    const uploadedFiles = req.files || []; // Multer adds files to req.files

    logProcessing(req, 'Validating input parameters for invoice creation with documents', { 
        dealId: !!dealId, 
        pipedriveCompanyId: !!pipedriveCompanyId,
        filesCount: uploadedFiles.length
    });

    if (!dealId || !pipedriveCompanyId) {
        // Clean up uploaded files if validation fails
        if (uploadedFiles.length > 0) {
            const { cleanupFiles } = await import('../middleware/fileUpload.js');
            cleanupFiles(uploadedFiles);
        }
        
        logWarning(req, 'Missing required parameters for invoice creation');
        return res.status(400).json({ 
            error: 'Deal ID and Pipedrive Company ID are required.' 
        });
    }

    try {
        // Use existing createInvoiceFromDeal logic to create the invoice
        logProcessing(req, 'Creating invoice from deal (step 1)', { dealId });
        
        // Create a mock response object to capture the invoice creation result
        let invoiceResult = null;
        let invoiceError = null;
        
        const mockRes = {
            json: (data) => { invoiceResult = data; },
            status: (code) => ({ json: (data) => { invoiceError = { code, data }; } })
        };

        // Create invoice first using existing logic
        await createInvoiceFromDeal(req, mockRes);
        
        if (invoiceError) {
            // Clean up uploaded files if invoice creation fails
            if (uploadedFiles.length > 0) {
                const { cleanupFiles } = await import('../middleware/fileUpload.js');
                cleanupFiles(uploadedFiles);
            }
            return res.status(invoiceError.code).json(invoiceError.data);
        }

        if (!invoiceResult || !invoiceResult.success) {
            // Clean up uploaded files if invoice creation fails
            if (uploadedFiles.length > 0) {
                const { cleanupFiles } = await import('../middleware/fileUpload.js');
                cleanupFiles(uploadedFiles);
            }
            return res.status(500).json({ 
                error: 'Failed to create invoice - no result returned' 
            });
        }

        const createdInvoice = invoiceResult.invoice;
        logProcessing(req, 'Invoice created successfully, processing attachments', {
            invoiceId: createdInvoice.invoiceId,
            invoiceNumber: createdInvoice.invoiceNumber,
            filesCount: uploadedFiles.length
        });

        // If no files uploaded, return the invoice result
        if (uploadedFiles.length === 0) {
            logProcessing(req, 'No files to upload, returning invoice result');
            return res.json({
                ...invoiceResult,
                attachments: {
                    message: 'No documents were uploaded',
                    totalCount: 0
                }
            });
        }

        // Upload attachments to the created invoice
        try {
            const xeroAccessToken = req.xeroAuth.accessToken;
            const xeroTenantId = req.xeroAuth.tenantId;

            logProcessing(req, 'Uploading attachments to invoice', {
                invoiceId: createdInvoice.invoiceId,
                filesCount: uploadedFiles.length,
                fileNames: uploadedFiles.map(f => f.originalname)
            });

            const attachmentResults = await xeroApiService.uploadMultipleInvoiceAttachments(
                xeroAccessToken,
                xeroTenantId,
                createdInvoice.invoiceId,
                uploadedFiles
            );

            logProcessing(req, 'Attachment upload completed', {
                invoiceId: createdInvoice.invoiceId,
                successful: attachmentResults.successCount,
                failed: attachmentResults.failureCount
            });

            // Clean up uploaded files after processing
            const { cleanupFiles } = await import('../middleware/fileUpload.js');
            cleanupFiles(uploadedFiles);

            // Return enhanced response with attachment results
            const enhancedResponse = {
                ...invoiceResult,
                attachments: {
                    message: `${attachmentResults.successCount} of ${attachmentResults.totalCount} documents uploaded successfully`,
                    totalCount: attachmentResults.totalCount,
                    successCount: attachmentResults.successCount,
                    failureCount: attachmentResults.failureCount,
                    successful: attachmentResults.successful.map(att => ({
                        fileName: att.Attachments?.[0]?.FileName,
                        attachmentId: att.Attachments?.[0]?.AttachmentID
                    })),
                    ...(attachmentResults.failureCount > 0 && {
                        failed: attachmentResults.failed.map(err => ({
                            error: err.message
                        }))
                    })
                }
            };

            if (attachmentResults.failureCount > 0) {
                logWarning(req, 'Some documents failed to upload', {
                    invoiceId: createdInvoice.invoiceId,
                    failureCount: attachmentResults.failureCount
                });
                enhancedResponse.warnings = [
                    ...(invoiceResult.warnings || []),
                    `${attachmentResults.failureCount} document(s) failed to upload`
                ];
            }

            logSuccess(req, 'Invoice created with document attachments', {
                invoiceId: createdInvoice.invoiceId,
                invoiceNumber: createdInvoice.invoiceNumber,
                attachmentsUploaded: attachmentResults.successCount,
                attachmentsFailed: attachmentResults.failureCount
            });

            res.json(enhancedResponse);

        } catch (attachmentError) {
            // Clean up uploaded files
            const { cleanupFiles } = await import('../middleware/fileUpload.js');
            cleanupFiles(uploadedFiles);

            logWarning(req, 'Error uploading attachments to invoice', {
                invoiceId: createdInvoice.invoiceId,
                error: attachmentError.message
            });

            // Return invoice result with attachment error
            const responseWithAttachmentError = {
                ...invoiceResult,
                attachments: {
                    message: 'Invoice created successfully, but document upload failed',
                    error: attachmentError.message,
                    totalCount: uploadedFiles.length,
                    successCount: 0,
                    failureCount: uploadedFiles.length
                },
                warnings: [
                    ...(invoiceResult.warnings || []),
                    'Document upload failed - invoice created without attachments'
                ]
            };

            res.json(responseWithAttachmentError);
        }

    } catch (error) {
        // Clean up uploaded files on any error
        if (uploadedFiles.length > 0) {
            const { cleanupFiles } = await import('../middleware/fileUpload.js');
            cleanupFiles(uploadedFiles);
        }

        logWarning(req, 'Error creating invoice with documents', {
            dealId,
            error: error.message,
            stack: error.stack
        });

        return res.status(500).json({ 
            error: `Failed to create invoice with documents: ${error.message}` 
        });
    }
};

// ===== TEST ENDPOINTS FOR E2E TESTING =====
export const getXeroQuoteByNumber = async (req, res) => {
    const { quoteNumber } = req.params;
    try {
        const xeroToken = await tokenService.getAuthToken('13961027', 'xero');
        const xeroQuote = await xeroApiService.findXeroQuoteByNumber(xeroToken.accessToken, xeroToken.tenantId, quoteNumber);
        
        if (!xeroQuote) {
            return res.status(404).json({ error: `Quote ${quoteNumber} not found` });
        }
        res.json(xeroQuote);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getXeroQuoteById = async (req, res) => {
    const { quoteId } = req.params;
    try {
        const xeroToken = await tokenService.getAuthToken('13961027', 'xero');
        const xeroQuote = await xeroApiService.getXeroQuoteById(xeroToken.accessToken, xeroToken.tenantId, quoteId);
        
        if (!xeroQuote) {
            return res.status(404).json({ error: `Quote ${quoteId} not found` });
        }
        res.json(xeroQuote);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAllXeroQuotes = async (req, res) => {
    try {
        const xeroToken = await tokenService.getAuthToken('13961027', 'xero');
        const quotes = await xeroApiService.getXeroQuotes(xeroToken.accessToken, xeroToken.tenantId);
        res.json({ Quotes: quotes, count: quotes.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteXeroQuote = async (req, res) => {
    const { quoteId } = req.params;
    try {
        const xeroToken = await tokenService.getAuthToken('13961027', 'xero');
        const deletedQuote = await xeroApiService.deleteXeroQuote(xeroToken.accessToken, xeroToken.tenantId, quoteId);
        res.json({ message: 'Quote deleted successfully', quoteId, deletedQuote });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

