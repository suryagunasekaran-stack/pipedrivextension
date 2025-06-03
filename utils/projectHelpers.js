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

/**
 * Validates and refreshes Pipedrive authentication tokens for a company
 * 
 * @param {string} companyId - The company ID to validate tokens for
 * @param {Object} req - Express request object for logging
 * @returns {Promise<Object>} Valid token credentials with accessToken and apiDomain
 * @throws {Error} Throws error with status code for authentication failures
 */
export async function validateAndRefreshPipedriveTokens(companyId, req) {
    let companyTokens = tokenService.allCompanyTokens[companyId];
    
    if (!companyTokens || !companyTokens.accessToken) {
        req.log.error('Pipedrive not authenticated for company', {
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
        req.log.info('Refreshing expired Pipedrive token', { companyId });
        try {
            companyTokens = await tokenService.refreshPipedriveToken(companyId);
            req.log.info('Successfully refreshed Pipedrive token', { companyId });
        } catch (refreshError) {
            req.log.error(refreshError, { companyId }, 'Failed to refresh Pipedrive token');
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
        req.log.warn('Missing required parameters for project creation', {
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
        req.log.warn('Deal missing required department field', { dealId, departmentKey });
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
        
        req.log.info('Project number generated successfully', {
            dealId,
            departmentName,
            projectNumber,
            isLinking: !!existingProjectNumberToLink
        });
        
        return projectNumber;
    } catch (projectError) {
        req.log.error('Error generating project number', {
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
        req.log.info('No organization associated with deal, skipping Xero contact creation');
        return null;
    }

    try {
        const orgDetails = await pipedriveApiService.getOrganizationDetails(
            pipedriveApiDomain, 
            pipedriveAccessToken, 
            dealDetails.org_id.value
        );
        
        if (!orgDetails || !orgDetails.name) {
            req.log.warn('Organization details incomplete', { orgId: dealDetails.org_id.value });
            return null;
        }

        // Check if contact already exists in Xero
        const existingContact = await xeroApiService.findXeroContactByName(
            accessToken, 
            tenantId, 
            orgDetails.name
        );
        
        if (existingContact) {
            req.log.info('Found existing Xero contact', { 
                contactId: existingContact.ContactID,
                orgName: orgDetails.name 
            });
            return existingContact.ContactID;
        }

        // Create new contact
        const newContactPayload = { Name: orgDetails.name };
        
        // Add primary email from associated person if available
        if (dealDetails.person_id && dealDetails.person_id.value) {
            try {
                const personDetails = await pipedriveApiService.getPersonDetails(
                    pipedriveApiDomain, 
                    pipedriveAccessToken, 
                    dealDetails.person_id.value
                );
                
                if (personDetails && personDetails.email && personDetails.email.length > 0) {
                    const primaryEmail = personDetails.email.find(e => e.primary);
                    newContactPayload.EmailAddress = primaryEmail ? primaryEmail.value : personDetails.email[0].value;
                }
            } catch (personError) {
                req.log.warn('Could not fetch person details for contact email', { 
                    personId: dealDetails.person_id.value,
                    error: personError.message 
                });
            }
        }
        
        const createdContact = await xeroApiService.createXeroContact(
            accessToken,
            tenantId,
            newContactPayload
        );
        
        req.log.info('Created new Xero contact', { 
            contactId: createdContact.ContactID,
            orgName: orgDetails.name 
        });
        
        return createdContact.ContactID;
    } catch (error) {
        req.log.error('Error creating/finding Xero contact', {
            orgId: dealDetails.org_id.value,
            error: error.message
        });
        return null;
    }
}

/**
 * Handles Xero project creation with proper token management
 * 
 * @param {string} companyId - Company ID for token lookup
 * @param {Object} dealDetails - Deal details from Pipedrive
 * @param {string} projectNumber - Generated project number
 * @param {string} dealId - Deal ID
 * @param {string} pipedriveApiDomain - Pipedrive API domain
 * @param {string} pipedriveAccessToken - Pipedrive access token
 * @param {Object} req - Express request object for logging
 * @returns {Promise<Object>} Xero integration result with project, contactId, and error info
 */
export async function handleXeroIntegration(companyId, dealDetails, projectNumber, dealId, pipedriveApiDomain, pipedriveAccessToken, req) {
    const result = {
        projectCreated: false,
        project: null,
        contactId: null,
        error: null
    };

    const xeroTokenInfo = tokenService.allXeroTokens[companyId];
    if (!xeroTokenInfo || !xeroTokenInfo.accessToken || !xeroTokenInfo.tenantId) {
        req.log.info('Xero integration not available for company', { companyId });
        return result;
    }

    try {
        // Refresh Xero token if needed
        let currentXeroTokenInfo = xeroTokenInfo;
        if (Date.now() >= xeroTokenInfo.tokenExpiresAt) {
            req.log.info('Refreshing expired Xero token', { companyId });
            currentXeroTokenInfo = await tokenService.refreshXeroToken(companyId);
        }

        // Create or find Xero contact
        const xeroContactId = await createOrFindXeroContact(
            currentXeroTokenInfo.accessToken,
            currentXeroTokenInfo.tenantId,
            dealDetails,
            pipedriveApiDomain,
            pipedriveAccessToken,
            req
        );

        if (!xeroContactId) {
            req.log.warn('No Xero contact available, skipping Xero project creation');
            return result;
        }

        // Create Xero project
        const projectName = `${projectNumber} - ${dealDetails.title || 'Project'}`;
        const projectData = {
            contactId: xeroContactId,
            name: projectName,
            estimateAmount: dealDetails.value || null,
        };

        const xeroProject = await xeroApiService.createXeroProject(
            currentXeroTokenInfo.accessToken,
            currentXeroTokenInfo.tenantId,
            projectData,
            null,
            dealId,
            companyId
        );

        req.log.info('Xero project created successfully', {
            projectId: xeroProject.ProjectID,
            projectName,
            contactId: xeroContactId
        });

        result.projectCreated = true;
        result.project = xeroProject;
        result.contactId = xeroContactId;

    } catch (xeroError) {
        req.log.error('Failed to create Xero project', {
            dealId,
            companyId,
            projectNumber,
            error: xeroError.message,
            status: xeroError.response?.status
        });
        
        result.error = `${xeroError.message} (Status: ${xeroError.response?.status || 'Unknown'})`;
    }

    return result;
}

/**
 * Fetches comprehensive deal-related data from Pipedrive
 * 
 * @param {string} apiDomain - Pipedrive API domain
 * @param {string} accessToken - Pipedrive access token
 * @param {Object} dealDetails - Deal details
 * @param {string} dealId - Deal ID
 * @param {Object} req - Express request object for logging
 * @returns {Promise<Object>} Comprehensive deal data including person, organization, and products
 */
export async function fetchDealRelatedData(apiDomain, accessToken, dealDetails, dealId, req) {
    const result = {
        personDetails: null,
        orgDetails: null,
        dealProducts: []
    };

    // Fetch person details
    if (dealDetails.person_id && dealDetails.person_id.value) {
        try {
            result.personDetails = await pipedriveApiService.getPersonDetails(
                apiDomain, 
                accessToken, 
                dealDetails.person_id.value
            );
        } catch (error) {
            req.log.warn('Could not fetch person details', {
                personId: dealDetails.person_id.value,
                error: error.message
            });
        }
    }

    // Fetch organization details
    if (dealDetails.org_id && dealDetails.org_id.value) {
        try {
            result.orgDetails = await pipedriveApiService.getOrganizationDetails(
                apiDomain, 
                accessToken, 
                dealDetails.org_id.value
            );
        } catch (error) {
            req.log.warn('Could not fetch organization details', {
                orgId: dealDetails.org_id.value,
                error: error.message
            });
        }
    }

    // Fetch deal products
    try {
        result.dealProducts = await pipedriveApiService.getDealProducts(apiDomain, accessToken, dealId);
    } catch (error) {
        req.log.warn('Could not fetch deal products', {
            dealId,
            error: error.message
        });
    }

    return result;
}

/**
 * Updates Pipedrive deal with the generated project number
 * 
 * @param {string} apiDomain - Pipedrive API domain
 * @param {string} accessToken - Pipedrive access token
 * @param {string} dealId - Deal ID to update
 * @param {string} projectNumber - Project number to set
 * @param {Object} req - Express request object for logging
 * @returns {Promise<void>}
 */
export async function updateDealWithProjectNumber(apiDomain, accessToken, dealId, projectNumber, req) {
    try {
        await pipedriveApiService.updateDealWithProjectNumber(apiDomain, accessToken, dealId, projectNumber);
        req.log.info('Successfully updated deal with project number', { dealId, projectNumber });
    } catch (updateError) {
        req.log.warn('Failed to update Pipedrive deal with project number', {
            dealId,
            projectNumber,
            error: updateError.message
        });
    }
}

/**
 * Creates enhanced deal object with custom fields and project number
 * 
 * @param {Object} dealDetails - Original deal details
 * @param {string} departmentName - Department name
 * @param {string} projectNumber - Generated project number
 * @returns {Object} Enhanced deal object with custom fields
 */
export function createEnhancedDealObject(dealDetails, departmentName, projectNumber) {
    const vesselNameKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME;
    const salesInChargeKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_SALES_IN_CHARGE;
    const locationKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_LOCATION;

    return {
        ...dealDetails,
        department: departmentName,
        vessel_name: vesselNameKey ? (dealDetails[vesselNameKey] || null) : null,
        sales_in_charge: salesInChargeKey ? (dealDetails[salesInChargeKey] || null) : null,
        location: locationKey ? (dealDetails[locationKey] || null) : null,
        projectNumber: projectNumber
    };
}
