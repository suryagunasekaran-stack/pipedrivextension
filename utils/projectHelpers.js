/**
 * @fileoverview Project creation helper utilities
 * 
 * This module contains helper functions for project creation operations,
 * separated from the main controller for better organization and reusability.
 * These functions handle specific tasks like token validation, data fetching,
 * Xero integration, and data formatting.
 * 
 * Key features:
 * - Token validation and refresh utilities
 * - Deal data fetching and validation
 * - Xero contact and project management
 * - Data aggregation and formatting
 * - Error handling with proper status codes
 * 
 * @module utils/projectHelpers
 */

import * as tokenService from '../services/secureTokenService.js';
import * as pipedriveApiService from '../services/pipedriveApiService.js';
import * as xeroApiService from '../services/xeroApiService.js';
import { getNextProjectNumber } from '../models/projectSequenceModel.js';
import logger from '../lib/logger.js';

/**
 * Validates and refreshes Pipedrive authentication tokens for a company
 * 
 * @param {string} companyId - The company ID to validate tokens for
 * @param {Object} req - Express request object for logging
 * @returns {Promise<Object>} Valid token credentials with accessToken and apiDomain
 * @throws {Error} Throws error with status code for authentication failures
 */
export async function validateAndRefreshPipedriveTokens(companyId, req) {
    let companyTokens = await tokenService.getAuthToken(companyId, 'pipedrive');
    
    if (!companyTokens || !companyTokens.accessToken) {
        logger.error('Pipedrive not authenticated for company', {
            companyId,
            hasTokens: !!companyTokens,
            hasAccessToken: !!(companyTokens?.accessToken)
        });
        const error = new Error(`Pipedrive not authenticated for company ${companyId}.`);
        error.statusCode = 401;
        throw error;
    }

    // Check if token needs refresh
    if (Date.now() >= companyTokens.tokenExpiresAt) {
        logger.info('Refreshing expired Pipedrive token', { companyId });
        try {
            companyTokens = await tokenService.refreshPipedriveToken(companyId);
            logger.info('Successfully refreshed Pipedrive token', { companyId });
        } catch (refreshError) {
            logger.error('Failed to refresh Pipedrive token', { companyId, error: refreshError.message });
            const error = new Error(`Failed to refresh Pipedrive token for company ${companyId}. Please re-authenticate.`);
            error.statusCode = 401;
            throw error;
        }
    }

    return companyTokens;
}

/**
 * Validates request parameters for project creation
 * 
 * @param {Object} requestBody - The request body containing dealId, companyId, etc.
 * @param {Object} req - Express request object for logging
 * @returns {Object} Validated parameters
 * @throws {Error} Throws error with status code 400 for validation failures
 */
export function validateProjectCreationRequest(requestBody, req) {
    const { pipedriveDealId, pipedriveCompanyId, existingProjectNumberToLink } = requestBody;

    if (!pipedriveDealId || !pipedriveCompanyId) {
        logger.warn('Missing required parameters for project creation', {
            pipedriveDealId: !!pipedriveDealId,
            pipedriveCompanyId: !!pipedriveCompanyId
        });
        const error = new Error('Deal ID and Company ID are required in the request body.');
        error.statusCode = 400;
        throw error;
    }

    return { 
        dealId: pipedriveDealId, 
        companyId: pipedriveCompanyId, 
        existingProjectNumberToLink 
    };
}

/**
 * Fetches and validates deal details from Pipedrive
 * 
 * @param {string} apiDomain - Pipedrive API domain
 * @param {string} accessToken - Pipedrive access token
 * @param {string} dealId - Deal ID to fetch
 * @param {Object} req - Express request object for logging
 * @returns {Promise<Object>} Deal details with department validation
 * @throws {Error} Throws error with status code for deal-related failures
 */
export async function fetchAndValidateDeal(apiDomain, accessToken, dealId, req) {
    const dealDetails = await pipedriveApiService.getDealDetails(apiDomain, accessToken, dealId);
    
    if (!dealDetails) {
        const error = new Error(`Deal with ID ${dealId} not found.`);
        error.statusCode = 404;
        throw error;
    }

    const departmentKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT;
    const departmentName = departmentKey ? dealDetails[departmentKey] : null;
    
    if (!departmentName) {
        logger.warn('Deal missing required department field', { dealId, departmentKey });
        const error = new Error('Department is required for project number generation. Please ensure the deal has a department specified.');
        error.statusCode = 400;
        error.missingField = 'department';
        throw error;
    }

    return { dealDetails, departmentName };
}

/**
 * Generates a project number for the deal
 * 
 * @param {string} dealId - Deal ID
 * @param {string} departmentName - Department name for project numbering
 * @param {string} existingProjectNumberToLink - Optional existing project number to link to
 * @param {Object} req - Express request object for logging
 * @returns {Promise<string>} Generated or linked project number
 * @throws {Error} Throws error with status code 500 for generation failures
 */
export async function generateProjectNumber(dealId, departmentName, existingProjectNumberToLink, req) {
    try {
        const projectNumber = await getNextProjectNumber(
            dealId, 
            departmentName, 
            existingProjectNumberToLink
        );
        
        logger.info('Project number generated successfully', {
            dealId,
            departmentName,
            projectNumber,
            isLinking: !!existingProjectNumberToLink
        });
        
        return projectNumber;
    } catch (projectError) {
        logger.error('Error generating project number', {
            dealId,
            departmentName,
            error: projectError.message
        });
        const error = new Error('Failed to generate project number.');
        error.statusCode = 500;
        error.details = projectError.message;
        throw error;
    }
}

/**
 * Creates or finds Xero contact based on deal organization
 * 
 * @param {string} accessToken - Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {Object} dealDetails - Deal details from Pipedrive
 * @param {string} pipedriveApiDomain - Pipedrive API domain
 * @param {string} pipedriveAccessToken - Pipedrive access token
 * @param {Object} req - Express request object for logging
 * @returns {Promise<string|null>} Xero contact ID or null if not created
 */
export async function createOrFindXeroContact(accessToken, tenantId, dealDetails, pipedriveApiDomain, pipedriveAccessToken, req) {
    if (!dealDetails.org_id || !dealDetails.org_id.value) {
        logger.info('No organization associated with deal, skipping Xero contact creation');
        return null;
    }

    try {
        const orgDetails = await pipedriveApiService.getOrganizationDetails(
            pipedriveApiDomain, 
            pipedriveAccessToken, 
            dealDetails.org_id.value
        );
        
        if (!orgDetails || !orgDetails.name) {
            logger.warn('Organization details incomplete', { orgId: dealDetails.org_id.value });
            return null;
        }

        // Check if contact already exists in Xero
        const existingContact = await xeroApiService.findXeroContactByName(
            accessToken, 
            tenantId, 
            orgDetails.name
        );
        
        if (existingContact) {
            logger.info('Found existing Xero contact', {
                contactId: existingContact.ContactID,
                contactName: existingContact.Name
            });
            return existingContact.ContactID;
        }

        // Create new contact
        let personDetails = null;
        let contactEmail = null;
        
        if (dealDetails.person_id && dealDetails.person_id.value) {
            try {
                personDetails = await pipedriveApiService.getPersonDetails(
                    pipedriveApiDomain, 
                    pipedriveAccessToken, 
                    dealDetails.person_id.value
                );
                
                if (personDetails && personDetails.email && personDetails.email.length > 0) {
                    contactEmail = personDetails.email[0].value;
                }
            } catch (personError) {
                logger.warn('Could not fetch person details for contact email', {
                    personId: dealDetails.person_id.value,
                    error: personError.message
                });
            }
        }

        const contactData = {
            name: orgDetails.name,
            email: contactEmail,
            isCustomer: true
        };

        const newContact = await xeroApiService.createXeroContact(accessToken, tenantId, contactData);
        
        if (newContact && newContact.ContactID) {
            logger.info('Created new Xero contact', {
                contactId: newContact.ContactID,
                contactName: newContact.Name,
                email: contactEmail
            });
            return newContact.ContactID;
        }
        
        return null;
    } catch (contactError) {
        logger.error('Error creating/finding Xero contact', {
            dealId: dealDetails.id,
            orgId: dealDetails.org_id?.value,
            error: contactError.message
        });
        return null;
    }
}

/**
 * Handles Xero integration for project creation
 * 
 * @param {string} companyId - Company ID for token lookup
 * @param {Object} dealDetails - Deal details from Pipedrive
 * @param {string} projectNumber - Generated project number
 * @param {string} dealId - Deal ID
 * @param {string} pipedriveApiDomain - Pipedrive API domain
 * @param {string} pipedriveAccessToken - Pipedrive access token
 * @param {Object} req - Express request object for logging and auth
 * @returns {Promise<Object>} Xero integration result
 */
export async function handleXeroIntegration(companyId, dealDetails, projectNumber, dealId, pipedriveApiDomain, pipedriveAccessToken, req) {
    // Check if Xero tokens are available (from middleware)
    if (!req.xeroAuth || !req.xeroAuth.accessToken) {
        logger.info('Xero integration not available for company', { companyId });
        return {
            projectCreated: false,
            message: 'Xero not authenticated for this company'
        };
    }

    let xeroAccessToken = req.xeroAuth.accessToken;
    const xeroTenantId = req.xeroAuth.tenantId;
    
    // Check if Xero token needs refresh
    const xeroTokenData = await tokenService.getAuthToken(companyId, 'xero');
    if (xeroTokenData && Date.now() >= xeroTokenData.tokenExpiresAt) {
        logger.info('Refreshing expired Xero token', { companyId });
        try {
            const refreshedXeroToken = await tokenService.refreshXeroToken(companyId);
            xeroAccessToken = refreshedXeroToken.accessToken;
        } catch (xeroRefreshError) {
            return {
                projectCreated: false,
                error: 'Failed to refresh Xero token',
                message: 'Xero token expired and refresh failed'
            };
        }
    }

    try {
        // Step 1: Create or find Xero contact
        const xeroContactId = await createOrFindXeroContact(
            xeroAccessToken, 
            xeroTenantId, 
            dealDetails, 
            pipedriveApiDomain, 
            pipedriveAccessToken, 
            req
        );
        
        if (!xeroContactId) {
            logger.warn('No Xero contact available, skipping Xero project creation');
            return {
                projectCreated: false,
                message: 'Could not create or find Xero contact for project creation'
            };
        }

        // Step 2: Create Xero project
        const vesselNameKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME;
        const vesselName = vesselNameKey ? dealDetails[vesselNameKey] : 'Unknown Vessel';
        
        const projectData = {
            contactId: xeroContactId,
            name: `IPC - ${vesselName}`,
            estimateAmount: dealDetails.value || null,
            deadline: dealDetails.expected_close_date || null
        };

        logger.info('Creating Xero project', {
            contactId: xeroContactId,
            projectName: projectData.name,
            estimateAmount: projectData.estimateAmount,
            dealId
        });

        const xeroProject = await xeroApiService.createXeroProject(
            xeroAccessToken,
            xeroTenantId,
            projectData,
            null, // quoteId
            dealId,
            companyId
        );

        if (!xeroProject || (!xeroProject.ProjectID && !xeroProject.projectId)) {
            logger.warn('Project creation succeeded but no project ID found', {
                projectData: projectData,
                xeroResponse: xeroProject
            });
            return {
                projectCreated: false,
                error: 'Project creation response missing ProjectID'
            };
        }

        const projectId = xeroProject.ProjectID || xeroProject.projectId;

        // Step 3: Create default tasks
        const defaultTasks = [
            "manhours",
            "overtime", 
            "transport",
            "supply labour"
        ];

        logger.info('Starting task creation for project', {
            projectId,
            taskCount: defaultTasks.length
        });

        const createdTasks = [];
        
        for (const taskName of defaultTasks) {
            try {
                logger.info(`Creating task "${taskName}" for project ${projectId}`);
                
                const task = await xeroApiService.createXeroTask(
                    xeroAccessToken,
                    xeroTenantId,
                    projectId,
                    taskName
                );
                
                if (task && (task.TaskID || task.taskId)) {
                    logger.info(`Task "${taskName}" created successfully`, {
                        taskId: task.TaskID || task.taskId,
                        taskName: task.Name || taskName
                    });
                    createdTasks.push(task);
                } else {
                    logger.warn(`No task data returned for "${taskName}"`, { projectId });
                }
            } catch (taskError) {
                logger.error(`Failed to create task "${taskName}"`, {
                    projectId,
                    taskName,
                    error: taskError.message
                });
            }
        }

        logger.info(`Task creation completed for project ${projectId}`, {
            totalTasks: defaultTasks.length,
            createdTasks: createdTasks.length
        });

        // Step 4: Handle Xero quote acceptance if quote number exists
        const xeroQuoteKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
        const xeroQuoteNumber = xeroQuoteKey ? dealDetails[xeroQuoteKey] : null;
        
        let quoteAcceptanceResult = null;
        
        if (xeroQuoteNumber) {
            logger.info('Checking for Xero quote to accept', {
                quoteNumber: xeroQuoteNumber,
                dealId,
                projectId
            });
            
            try {
                // Search for the quote by quote number
                const quotes = await xeroApiService.getXeroQuotes(
                    xeroAccessToken,
                    xeroTenantId,
                    {
                        where: `QuoteNumber="${xeroQuoteNumber}"`,
                        page: 1
                    }
                );

                logger.info('Attempting to find and accept Xero quote', { quoteNumber: xeroQuoteNumber });
                
                if (!quotes || !Array.isArray(quotes)) {
                    logger.warn('Invalid quotes response format', {
                        quoteNumber: xeroQuoteNumber,
                        quotesType: typeof quotes,
                        quotesValue: quotes
                    });
                    quoteAcceptanceResult = {
                        accepted: false,
                        error: 'Invalid quotes response format'
                    };
                } else {
                    logger.info('Quote search result', {
                        quoteNumber: xeroQuoteNumber,
                        foundQuotes: quotes.length,
                        quotes: quotes.map(q => ({
                            QuoteID: q.QuoteID,
                            QuoteNumber: q.QuoteNumber,
                            Status: q.Status
                        }))
                    });

                    const targetQuote = quotes.find(quote => quote.QuoteNumber === xeroQuoteNumber);
                    
                    if (targetQuote) {
                        if (targetQuote.Status === 'ACCEPTED') {
                            logger.info('Quote is already accepted, skipping update', {
                                quoteId: targetQuote.QuoteID,
                                quoteNumber: xeroQuoteNumber
                            });
                            quoteAcceptanceResult = {
                                accepted: true,
                                alreadyAccepted: true,
                                quoteId: targetQuote.QuoteID
                            };
                        } else {
                            // Update quote status to ACCEPTED
                            const quoteUpdateData = {
                                QuoteID: targetQuote.QuoteID,
                                Status: 'ACCEPTED'
                            };

                            logger.info('Accepting Xero quote', {
                                quoteId: targetQuote.QuoteID,
                                quoteNumber: xeroQuoteNumber,
                                currentStatus: targetQuote.Status
                            });

                            try {
                                const updatedQuote = await xeroApiService.updateQuoteStatus(
                                    xeroAccessToken,
                                    xeroTenantId,
                                    targetQuote.QuoteID,
                                    'ACCEPTED'
                                );

                                logger.info('Xero quote accepted successfully', {
                                    quoteId: targetQuote.QuoteID,
                                    quoteNumber: xeroQuoteNumber,
                                    newStatus: updatedQuote?.Status || 'ACCEPTED'
                                });

                                quoteAcceptanceResult = {
                                    accepted: true,
                                    quoteId: targetQuote.QuoteID,
                                    previousStatus: targetQuote.Status,
                                    newStatus: updatedQuote?.Status || 'ACCEPTED'
                                };
                            } catch (updateError) {
                                logger.error('Failed to update quote status', {
                                    quoteId: targetQuote.QuoteID,
                                    quoteNumber: xeroQuoteNumber,
                                    error: updateError.message
                                });
                                quoteAcceptanceResult = {
                                    accepted: false,
                                    error: updateError.message
                                };
                            }
                        }
                    } else {
                        logger.warn('Xero quote not found', {
                            quoteNumber: xeroQuoteNumber,
                            searchedQuotes: quotes.map(q => q.QuoteNumber)
                        });
                        quoteAcceptanceResult = {
                            accepted: false,
                            error: 'Quote not found'
                        };
                    }
                }
            } catch (quoteError) {
                logger.error('Failed to accept Xero quote', {
                    quoteNumber: xeroQuoteNumber,
                    dealId,
                    projectId,
                    error: quoteError.message
                });
                quoteAcceptanceResult = {
                    accepted: false,
                    error: quoteError.message
                };
            }
        } else {
            logger.info('No Xero quote number provided, skipping quote acceptance', {
                dealId,
                projectId
            });
        }

        logger.info('Xero project created successfully', {
            projectId: projectId,
            projectName: projectData.name,
            contactId: xeroContactId,
            tasksCreated: createdTasks.length,
            quoteAccepted: quoteAcceptanceResult?.accepted || false
        });

        return {
            projectCreated: true,
            projectId: projectId,
            projectName: projectData.name,
            contactId: xeroContactId,
            tasks: createdTasks,
            quote: quoteAcceptanceResult
        };

    } catch (error) {
        logger.error('Failed to create Xero project', {
            companyId,
            dealId,
            projectNumber,
            error: error.message
        });
        
        return {
            projectCreated: false,
            error: error.message,
            message: 'Xero project creation failed'
        };
    }
}

/**
 * Fetches comprehensive deal-related data from Pipedrive
 * 
 * @param {string} apiDomain - Pipedrive API domain
 * @param {string} accessToken - Pipedrive access token
 * @param {Object} dealDetails - Deal details object
 * @param {string} dealId - Deal ID
 * @param {Object} req - Express request object for logging
 * @returns {Promise<Object>} Comprehensive deal data including person, organization, and products
 */
export async function fetchDealRelatedData(apiDomain, accessToken, dealDetails, dealId, req) {
    let personDetails = null;
    let orgDetails = null;
    let dealProducts = [];

    // Fetch person details if available
    if (dealDetails.person_id && dealDetails.person_id.value) {
        try {
            personDetails = await pipedriveApiService.getPersonDetails(
                apiDomain, 
                accessToken, 
                dealDetails.person_id.value
            );
        } catch (personError) {
            logger.warn('Could not fetch person details', {
                personId: dealDetails.person_id.value,
                error: personError.message
            });
        }
    }

    // Fetch organization details if available
    if (dealDetails.org_id && dealDetails.org_id.value) {
        try {
            orgDetails = await pipedriveApiService.getOrganizationDetails(
                apiDomain, 
                accessToken, 
                dealDetails.org_id.value
            );
        } catch (orgError) {
            logger.warn('Could not fetch organization details', {
                orgId: dealDetails.org_id.value,
                error: orgError.message
            });
        }
    }

    // Fetch deal products
    try {
        dealProducts = await pipedriveApiService.getDealProducts(apiDomain, accessToken, dealId);
    } catch (productsError) {
        logger.warn('Could not fetch deal products', {
            dealId,
            error: productsError.message
        });
    }

    return { personDetails, orgDetails, dealProducts };
}

/**
 * Updates the Pipedrive deal with the generated project number
 * 
 * @param {string} apiDomain - Pipedrive API domain
 * @param {string} accessToken - Pipedrive access token
 * @param {string} dealId - Deal ID to update
 * @param {string} projectNumber - Project number to add to deal
 * @param {Object} req - Express request object for logging
 * @returns {Promise<void>} Updates deal or logs warning on failure
 */
export async function updateDealWithProjectNumber(apiDomain, accessToken, dealId, projectNumber, req) {
    try {
        await pipedriveApiService.updateDealWithProjectNumber(apiDomain, accessToken, dealId, projectNumber);
        logger.info('Successfully updated deal with project number', { dealId, projectNumber });
    } catch (updateError) {
        logger.warn('Failed to update Pipedrive deal with project number', {
            dealId,
            projectNumber,
            error: updateError.message
        });
        // Don't throw error - project creation should still succeed
    }
}

/**
 * Creates an enhanced deal object with department and project information
 * 
 * @param {Object} dealDetails - Original deal details from Pipedrive
 * @param {string} departmentName - Department name
 * @param {string} projectNumber - Generated project number
 * @returns {Object} Enhanced deal object for frontend consumption
 */
export function createEnhancedDealObject(dealDetails, departmentName, projectNumber) {
    return {
        ...dealDetails,
        department: departmentName,
        projectNumber: projectNumber,
        enhancedAt: new Date().toISOString()
    };
}
