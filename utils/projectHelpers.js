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
import { batchOperations } from '../services/batchOperationsService.js';
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
 * @deprecated This function has been moved to xeroBusinessService.findOrCreateXeroContact
 * Use: import { findOrCreateXeroContact } from '../services/xeroBusinessService.js'
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
            Name: orgDetails.name,  // Fixed: Xero API expects 'Name' not 'name'
            ...(contactEmail && { EmailAddress: contactEmail })  // Only add email if it exists
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
 * Handles Xero integration for project creation using the business service
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
    // Import the business service
    const xeroBusinessService = await import('../services/xeroBusinessService.js');
    
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
        // Use the business service to create the project with all related entities
        logger.info('Using Xero business service to create project from deal', {
            dealId,
            projectNumber,
            companyId
        });

        const result = await xeroBusinessService.createProjectFromDeal(
            { xeroAccessToken, xeroTenantId },
            dealDetails,
            projectNumber,
            {
                dealId,
                companyId,
                pipedriveAuth: {
                    apiDomain: pipedriveApiDomain,
                    accessToken: pipedriveAccessToken
                }
            }
        );

        logger.info('Xero project creation completed', {
            projectCreated: result.projectCreated,
            projectId: result.projectId,
            tasksCreated: result.tasks ? result.tasks.length : 0,
            quoteAccepted: result.quote ? result.quote.accepted : false
        });

        return result;

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
    // Use batch operations to fetch all related data efficiently
    logger.info('Fetching deal related data with batch operations', { dealId });
    
    try {
        const dealData = await batchOperations.fetchDealWithRelatedEntities({
            auth: { apiDomain, accessToken },
            dealId,
            cache: req.cache || new Map()
        });
        
        return {
            personDetails: dealData.person,
            orgDetails: dealData.organization,
            dealProducts: dealData.products
        };
    } catch (error) {
        logger.error('Error in batch fetch of deal related data', {
            dealId,
            error: error.message
        });
        
        // Fallback to individual fetches if batch fails
        logger.warn('Falling back to individual API calls', { dealId });
        
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
