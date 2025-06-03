/**
 * @fileoverview Project creation controller handling full project lifecycle.
 * Integrates Pipedrive deals with project numbering system and optional Xero project creation.
 * Manages token validation, project sequence generation, and comprehensive data aggregation.
 */

import 'dotenv/config';
import * as tokenService from '../services/tokenService.js';
import * as pipedriveApiService from '../services/pipedriveApiService.js';
import * as xeroApiService from '../services/xeroApiService.js';
import { getNextProjectNumber } from '../models/projectSequenceModel.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * Creates a comprehensive project by generating project numbers, integrating with Xero,
 * and aggregating all related data from Pipedrive. Supports linking to existing projects
 * or creating new ones with sequential numbering by department.
 * 
 * @param {Object} req - Express request object with body containing dealId, companyId, and optional existingProjectNumberToLink
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with complete project data including Xero integration status
 * @throws {Error} Returns 400 for validation errors, 401 for auth issues, 404 for missing deals, 500 for system errors
 */
export const createFullProject = asyncHandler(async (req, res) => {
    const { dealId, companyId, existingProjectNumberToLink } = req.body;

    req.log.info('Starting full project creation', {
        dealId,
        companyId,
        existingProjectNumberToLink,
        userAgent: req.get('User-Agent')
    });

    if (!dealId || !companyId) {
        req.log.warn('Missing required parameters for project creation', {
            dealId: !!dealId,
            companyId: !!companyId
        });
        return res.status(400).json({ 
            error: 'Deal ID and Company ID are required in the request body.',
            requestId: req.id
        });
    }

    let companyTokens = tokenService.allCompanyTokens[companyId];
    if (!companyTokens || !companyTokens.accessToken) {
        req.log.error('Pipedrive not authenticated for company', {
            companyId,
            hasTokens: !!companyTokens,
            hasAccessToken: !!(companyTokens?.accessToken)
        });
        return res.status(401).json({ 
            error: `Pipedrive not authenticated for company ${companyId}.`,
            requestId: req.id
        });
    }

    if (Date.now() >= companyTokens.tokenExpiresAt) {
        req.log.info('Refreshing expired Pipedrive token', { companyId });
        try {
            companyTokens = await tokenService.refreshPipedriveToken(companyId);
            req.log.info('Successfully refreshed Pipedrive token', { companyId });
        } catch (refreshError) {
            req.log.error(refreshError, { companyId }, 'Failed to refresh Pipedrive token');
            return res.status(401).json({ 
                error: `Failed to refresh Pipedrive token for company ${companyId}. Please re-authenticate.`,
                requestId: req.id
            });
        }
    }

    const { accessToken, apiDomain } = companyTokens;
    
    const departmentKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT;
    const vesselNameKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME;
    const salesInChargeKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_SALES_IN_CHARGE;
    const locationKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_LOCATION;

    try {
        const dealDetails = await pipedriveApiService.getDealDetails(apiDomain, accessToken, dealId);
        
        if (!dealDetails) {
            return res.status(404).json({ 
                error: `Deal with ID ${dealId} not found.` 
            });
        }

        const departmentName = departmentKey ? dealDetails[departmentKey] : null;
        
        if (!departmentName) {
            return res.status(400).json({ 
                error: 'Department is required for project number generation. Please ensure the deal has a department specified.',
                missingField: 'department'
            });
        }

        let projectNumber;
        try {
            projectNumber = await getNextProjectNumber(
                dealId, 
                departmentName, 
                existingProjectNumberToLink
            );
        } catch (projectError) {
            console.error('Error generating project number:', projectError.message);
            return res.status(500).json({ 
                error: 'Failed to generate project number.',
                details: projectError.message 
            });
        }

        // Create Xero project if integration is available
        let xeroProject = null;
        let xeroContactId = null;
        let xeroError = null;
        
        const xeroTokenInfo = tokenService.allXeroTokens[companyId];
        if (xeroTokenInfo && xeroTokenInfo.accessToken && xeroTokenInfo.tenantId) {
            try {
                let currentXeroTokenInfo = xeroTokenInfo;
                if (Date.now() >= xeroTokenInfo.tokenExpiresAt) {
                    currentXeroTokenInfo = await tokenService.refreshXeroToken(companyId);
                }

                if (dealDetails.org_id && dealDetails.org_id.value) {
                    const orgDetails = await pipedriveApiService.getOrganizationDetails(apiDomain, accessToken, dealDetails.org_id.value);
                    
                    if (orgDetails && orgDetails.name) {
                        const existingContact = await xeroApiService.findXeroContactByName(
                            currentXeroTokenInfo.accessToken, 
                            currentXeroTokenInfo.tenantId, 
                            orgDetails.name
                        );
                        
                        if (existingContact) {
                            xeroContactId = existingContact.ContactID;
                        } else {
                            const newContactPayload = { Name: orgDetails.name };
                            
                            // Add primary email from associated person if available
                            if (dealDetails.person_id && dealDetails.person_id.value) {
                                try {
                                    const personDetails = await pipedriveApiService.getPersonDetails(apiDomain, accessToken, dealDetails.person_id.value);
                                    if (personDetails && personDetails.email && personDetails.email.length > 0) {
                                        const primaryEmail = personDetails.email.find(e => e.primary);
                                        newContactPayload.EmailAddress = primaryEmail ? primaryEmail.value : personDetails.email[0].value;
                                    }
                                } catch (personError) {
                                    console.warn('Could not fetch person details for contact email:', personError.message);
                                }
                            }
                            
                            const createdContact = await xeroApiService.createXeroContact(
                                currentXeroTokenInfo.accessToken,
                                currentXeroTokenInfo.tenantId,
                                newContactPayload
                            );
                            xeroContactId = createdContact.ContactID;
                        }
                    }
                }

                if (xeroContactId) {
                    const projectName = `${projectNumber} - ${dealDetails.title || 'Project'}`;
                    const projectData = {
                        contactId: xeroContactId,
                        name: projectName,
                        estimateAmount: dealDetails.value || null,
                    };

                    xeroProject = await xeroApiService.createXeroProject(
                        currentXeroTokenInfo.accessToken,
                        currentXeroTokenInfo.tenantId,
                        projectData,
                        null,
                        dealId,
                        companyId
                    );
                } else {
                    console.warn('No Xero contact available, skipping Xero project creation');
                }
                
            } catch (xeroProjectError) {
                console.error('Failed to create Xero project:', {
                    dealId,
                    companyId,
                    projectNumber,
                    error: xeroProjectError.message,
                    status: xeroProjectError.response?.status
                });
                
                xeroError = `${xeroProjectError.message} (Status: ${xeroProjectError.response?.status || 'Unknown'})`;
            }
        }

        // Fetch comprehensive deal-related data
        let personDetails = null;
        if (dealDetails.person_id && dealDetails.person_id.value) {
            try {
                personDetails = await pipedriveApiService.getPersonDetails(apiDomain, accessToken, dealDetails.person_id.value);
            } catch (error) {
                console.warn(`Could not fetch person details for person ID ${dealDetails.person_id.value}:`, error.message);
            }
        }

        let orgDetails = null;
        if (dealDetails.org_id && dealDetails.org_id.value) {
            try {
                orgDetails = await pipedriveApiService.getOrganizationDetails(apiDomain, accessToken, dealDetails.org_id.value);
            } catch (error) {
                console.warn(`Could not fetch organization details for org ID ${dealDetails.org_id.value}:`, error.message);
            }
        }

        let dealProducts = [];
        try {
            dealProducts = await pipedriveApiService.getDealProducts(apiDomain, accessToken, dealId);
        } catch (error) {
            console.warn(`Could not fetch deal products for deal ID ${dealId}:`, error.message);
        }

        // Update Pipedrive deal with the generated project number
        try {
            await pipedriveApiService.updateDealWithProjectNumber(apiDomain, accessToken, dealId, projectNumber);
        } catch (updateError) {
            console.warn(`Warning: Failed to update Pipedrive deal ${dealId} with project number ${projectNumber}:`, updateError.message);
        }

        // Create enhanced deal object with custom fields and project number
        const projectDealObject = {
            ...dealDetails,
            department: departmentName,
            vessel_name: vesselNameKey ? (dealDetails[vesselNameKey] || null) : null,
            sales_in_charge: salesInChargeKey ? (dealDetails[salesInChargeKey] || null) : null,
            location: locationKey ? (dealDetails[locationKey] || null) : null,
            projectNumber: projectNumber
        };

        const responseData = {
            success: true,
            message: existingProjectNumberToLink 
                ? `Deal ${dealId} successfully linked to existing project ${projectNumber}.`
                : `New project created successfully with project number ${projectNumber}.`,
            projectNumber: projectNumber,
            deal: projectDealObject,
            person: personDetails,
            organization: orgDetails,
            products: dealProducts,
            xero: {
                projectCreated: !!xeroProject,
                project: xeroProject,
                contactId: xeroContactId,
                error: xeroError
            },
            metadata: {
                dealId: dealId,
                companyId: companyId,
                isNewProject: !existingProjectNumberToLink,
                generatedAt: new Date().toISOString()
            }
        };

        res.status(201).json(responseData);

    } catch (error) {
        req.log.error(error, {
            dealId,
            companyId,
            errorName: error.name,
            errorMessage: error.message
        }, 'Error in createFullProject controller');
        
        res.status(500).json({ 
            error: 'Failed to create project.',
            details: error.message,
            dealId: dealId,
            companyId: companyId,
            requestId: req.id
        });
    }
});
