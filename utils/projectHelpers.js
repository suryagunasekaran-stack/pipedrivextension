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
import { validateProjectNumber } from './projectNumberUtils.js';
import { validateDealForProject } from './projectBusinessRules.js';

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

    // Apply business rules validation
    try {
        validateDealForProject(dealDetails);
    } catch (validationError) {
        logger.warn('Deal failed business rules validation', { 
            dealId, 
            error: validationError.message 
        });
        const error = new Error(validationError.message);
        error.statusCode = 400;
        error.validationError = true;
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
        // Validate existing project number if provided
        if (existingProjectNumberToLink) {
            if (!validateProjectNumber(existingProjectNumberToLink)) {
                logger.warn('Invalid existing project number format', {
                    dealId,
                    providedProjectNumber: existingProjectNumberToLink
                });
                const error = new Error('Invalid project number format provided for linking.');
                error.statusCode = 400;
                throw error;
            }
        }

        const projectNumber = await getNextProjectNumber(
            dealId, 
            departmentName, 
            existingProjectNumberToLink
        );
        
        // Validate generated project number
        if (!validateProjectNumber(projectNumber)) {
            logger.error('Generated invalid project number', {
                dealId,
                departmentName,
                generatedNumber: projectNumber
            });
            const error = new Error('Generated project number failed validation.');
            error.statusCode = 500;
            throw error;
        }
        
        logger.info('Project number generated successfully', {
            dealId,
            departmentName,
            projectNumber,
            isLinking: !!existingProjectNumberToLink
        });
        
        return projectNumber;
    } catch (projectError) {
        // Re-throw if already has status code
        if (projectError.statusCode) {
            throw projectError;
        }
        
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
            error: contactError.message
        });
        // Re-throw the error to be caught by the calling function
        throw contactError;
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
    // Xero auth is guaranteed by middleware
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

        // Step 2: Get deal products
        const dealProducts = await pipedriveApiService.getDealProducts(
            pipedriveApiDomain,
            pipedriveAccessToken,
            dealId
        );

        // Step 3: Create Xero project
        const vesselNameKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME;
        const vesselName = vesselNameKey ? dealDetails[vesselNameKey] : 'Unknown Vessel';
        
        const projectData = {
            contactId: xeroContactId,
            name: `${projectNumber} - ${vesselName}`,
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

        // Step 4: Create default tasks
        const defaultTasks = [
            "Manhour",
            "Overtime",
            "Transport",
            "Supply Labour"
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
                logger.error(`Failed to create task "${taskName}" for project ${projectId}`, {
                    projectId,
                    taskName,
                    error: taskError,
                    errorMessage: taskError.message,
                    errorStack: taskError.stack
                });
            }
        }

        logger.info(`Task creation completed for project ${projectId}`, {
            totalTasks: defaultTasks.length,
            createdTasks: createdTasks.length
        });

        // Step 5: Handle Xero quote acceptance using Pipedrive custom field
        let quoteAcceptanceResult = undefined;
        
        try {
            logger.info('Checking for Xero quote acceptance using Pipedrive custom field', {
                dealId,
                projectId
            });
            
            // Get the Xero quote ID from the Pipedrive custom field
            const quoteIdCustomFieldKey = process.env.PIPEDRIVE_QUOTE_ID;
            
            if (!quoteIdCustomFieldKey) {
                logger.warn('PIPEDRIVE_QUOTE_ID environment variable not configured', { dealId });
                quoteAcceptanceResult = {
                    accepted: false,
                    error: 'Quote ID custom field not configured'
                };
            } else {
                const xeroQuoteId = dealDetails[quoteIdCustomFieldKey];
                
                logger.info('Checking for quote ID in deal custom field', {
                    dealId,
                    customFieldKey: quoteIdCustomFieldKey,
                    hasQuoteId: !!xeroQuoteId,
                    quoteId: xeroQuoteId
                });

                if (!xeroQuoteId) {
                    logger.info('No Xero quote ID found in deal custom field, skipping quote acceptance', {
                        dealId,
                        customFieldKey: quoteIdCustomFieldKey
                    });
                    quoteAcceptanceResult = {
                        accepted: false,
                        error: 'No quote ID found in deal custom field'
                    };
                } else {
                    // Get quote details first to check status
                    logger.info('Retrieving quote details from Xero', {
                        quoteId: xeroQuoteId,
                        dealId
                    });

                    try {
                        const currentQuote = await xeroApiService.getXeroQuoteById(xeroAccessToken, xeroTenantId, xeroQuoteId);
                        
                        if (!currentQuote) {
                            logger.warn('Quote not found in Xero', {
                                quoteId: xeroQuoteId,
                                dealId
                            });
                            quoteAcceptanceResult = {
                                accepted: false,
                                error: `Quote ${xeroQuoteId} not found in Xero`
                            };
                        } else if (currentQuote.Status === 'ACCEPTED') {
                            logger.warn('Quote is already accepted, skipping update', {
                                quoteId: xeroQuoteId,
                                quoteNumber: currentQuote.QuoteNumber,
                                dealId
                            });
                            quoteAcceptanceResult = {
                                accepted: true,
                                alreadyAccepted: true,
                                quoteId: xeroQuoteId,
                                quoteNumber: currentQuote.QuoteNumber,
                                error: null
                            };
                        } else if (currentQuote.Status === 'DRAFT') {
                            logger.warn('Quote is in DRAFT status, cannot accept directly', {
                                quoteId: xeroQuoteId,
                                quoteNumber: currentQuote.QuoteNumber,
                                status: currentQuote.Status,
                                dealId
                            });
                            quoteAcceptanceResult = {
                                accepted: false,
                                error: 'Quote must be in SENT status to be accepted',
                                statusReason: 'DRAFT',
                                quoteId: xeroQuoteId,
                                quoteNumber: currentQuote.QuoteNumber
                            };
                        } else if (currentQuote.Status === 'SENT') {
                            logger.info('Accepting Xero quote using new simplified approach', {
                                quoteId: xeroQuoteId,
                                quoteNumber: currentQuote.QuoteNumber,
                                currentStatus: currentQuote.Status,
                                dealId
                            });

                            try {
                                const acceptedQuote = await xeroApiService.acceptXeroQuote(
                                    xeroAccessToken,
                                    xeroTenantId,
                                    xeroQuoteId
                                );

                                logger.info('Xero quote accepted successfully', {
                                    quoteId: xeroQuoteId,
                                    quoteNumber: acceptedQuote.QuoteNumber,
                                    newStatus: acceptedQuote.Status,
                                    dealId
                                });

                                quoteAcceptanceResult = {
                                    accepted: true,
                                    quoteId: xeroQuoteId,
                                    quoteNumber: acceptedQuote.QuoteNumber,
                                    error: null
                                };
                            } catch (acceptError) {
                                logger.error('Failed to accept quote using new approach', {
                                    quoteId: xeroQuoteId,
                                    quoteNumber: currentQuote.QuoteNumber,
                                    currentStatus: currentQuote.Status,
                                    dealId,
                                    errorMessage: acceptError.message,
                                    errorStack: acceptError.stack,
                                    xeroApiResponse: acceptError.response?.data,
                                    xeroApiStatus: acceptError.response?.status
                                });
                                
                                quoteAcceptanceResult = {
                                    accepted: false,
                                    error: `Quote acceptance failed: ${acceptError.message}`,
                                    details: acceptError.response?.data,
                                    statusCode: acceptError.response?.status,
                                    quoteNumber: currentQuote.QuoteNumber
                                };
                            }
                        } else {
                            logger.warn('Quote has unexpected status', {
                                quoteId: xeroQuoteId,
                                quoteNumber: currentQuote.QuoteNumber,
                                status: currentQuote.Status,
                                dealId
                            });
                            quoteAcceptanceResult = {
                                accepted: false,
                                error: `Quote has unexpected status: ${currentQuote.Status}`,
                                quoteId: xeroQuoteId,
                                quoteNumber: currentQuote.QuoteNumber
                            };
                        }
                    } catch (quoteRetrievalError) {
                        logger.error('Error retrieving quote details from Xero', {
                            quoteId: xeroQuoteId,
                            dealId,
                            errorMessage: quoteRetrievalError.message,
                            errorStack: quoteRetrievalError.stack,
                            xeroApiResponse: quoteRetrievalError.response?.data,
                            xeroApiStatus: quoteRetrievalError.response?.status
                        });
                        
                        quoteAcceptanceResult = {
                            accepted: false,
                            error: `Failed to retrieve quote details: ${quoteRetrievalError.message}`,
                            details: quoteRetrievalError.response?.data,
                            statusCode: quoteRetrievalError.response?.status
                        };
                    }
                }
            }
        } catch (quoteError) {
            logger.error('Error during quote acceptance process using new approach', {
                dealId,
                errorMessage: quoteError.message,
                errorStack: quoteError.stack,
                xeroApiResponse: quoteError.response?.data,
                xeroApiStatus: quoteError.response?.status
            });
            quoteAcceptanceResult = {
                accepted: false,
                error: `Quote acceptance process failed: ${quoteError.message}`,
                details: quoteError.response?.data,
                statusCode: quoteError.response?.status
            };
        }

        return {
            projectCreated: true,
            projectId,
            tasks: createdTasks,
            quote: quoteAcceptanceResult
        };

    } catch (error) {
        logger.error('Error during Xero integration', {
            dealId,
            error: error.message,
            stack: error.stack
        });
        return {
            projectCreated: false,
            error: error.message
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
