import 'dotenv/config';
import * as tokenService from '../services/tokenService.js';
import * as pipedriveApiService from '../services/pipedriveApiService.js';
import * as xeroApiService from '../services/xeroApiService.js';
import { getNextProjectNumber } from '../models/projectSequenceModel.js';

export const createFullProject = async (req, res) => {
    const { dealId, companyId, existingProjectNumberToLink } = req.body;

    // Validate required parameters
    if (!dealId || !companyId) {
        return res.status(400).json({ 
            error: 'Deal ID and Company ID are required in the request body.' 
        });
    }

    // Get and validate Pipedrive tokens
    let companyTokens = tokenService.allCompanyTokens[companyId];
    if (!companyTokens || !companyTokens.accessToken) {
        return res.status(401).json({ 
            error: `Pipedrive not authenticated for company ${companyId}.` 
        });
    }

    // Check token expiration and refresh if needed
    if (Date.now() >= companyTokens.tokenExpiresAt) {
        try {
            console.log(`Pipedrive token expired for ${companyId} in createFullProject, attempting refresh.`);
            companyTokens = await tokenService.refreshPipedriveToken(companyId);
        } catch (refreshError) {
            console.error(`Failed to refresh Pipedrive token for ${companyId} in createFullProject:`, refreshError.message);
            return res.status(401).json({ 
                error: `Failed to refresh Pipedrive token for company ${companyId}. Please re-authenticate.` 
            });
        }
    }

    const { accessToken, apiDomain } = companyTokens;
    
    // Get environment variables for custom fields
    const departmentKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT;
    const vesselNameKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME;
    const salesInChargeKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_SALES_IN_CHARGE;
    const locationKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_LOCATION;

    try {
        // 1. Fetch deal details from Pipedrive
        const dealDetails = await pipedriveApiService.getDealDetails(apiDomain, accessToken, dealId);
        
        if (!dealDetails) {
            return res.status(404).json({ 
                error: `Deal with ID ${dealId} not found.` 
            });
        }

        // 2. Extract department from deal custom field
        const departmentName = departmentKey ? dealDetails[departmentKey] : null;
        
        if (!departmentName) {
            return res.status(400).json({ 
                error: 'Department is required for project number generation. Please ensure the deal has a department specified.',
                missingField: 'department'
            });
        }

        // 3. Generate or get project number using the MongoDB service
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

        // 4. Create Xero project if Xero is connected
        let xeroProject = null;
        let xeroContactId = null;
        let xeroError = null;
        
        const xeroTokenInfo = tokenService.allXeroTokens[companyId];
        if (xeroTokenInfo && xeroTokenInfo.accessToken && xeroTokenInfo.tenantId) {
            try {
                // Check if Xero token needs refresh
                let currentXeroTokenInfo = xeroTokenInfo;
                if (Date.now() >= xeroTokenInfo.tokenExpiresAt) {
                    currentXeroTokenInfo = await tokenService.refreshXeroToken(companyId);
                }

                // Get or create Xero contact based on deal organization
                if (dealDetails.org_id && dealDetails.org_id.value) {
                    const orgDetails = await pipedriveApiService.getOrganizationDetails(apiDomain, accessToken, dealDetails.org_id.value);
                    
                    if (orgDetails && orgDetails.name) {
                        // Try to find existing Xero contact by organization name
                        const existingContact = await xeroApiService.findXeroContactByName(
                            currentXeroTokenInfo.accessToken, 
                            currentXeroTokenInfo.tenantId, 
                            orgDetails.name
                        );
                        
                        if (existingContact) {
                            xeroContactId = existingContact.ContactID;
                            console.log(`Found existing Xero contact: ${orgDetails.name} (ID: ${xeroContactId})`);
                        } else {
                            // Create new Xero contact
                            const newContactPayload = { Name: orgDetails.name };
                            
                            // Add email if person is associated with deal
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
                            console.log(`Created new Xero contact: ${orgDetails.name} (ID: ${xeroContactId})`);
                        }
                    }
                }

                // Create Xero project if we have a contact
                if (xeroContactId) {
                    const projectName = `${projectNumber} - ${dealDetails.title || 'Project'}`;
                    const projectData = {
                        contactId: xeroContactId,
                        name: projectName,
                        estimateAmount: dealDetails.value || null,
                    };

                    console.log('=== ATTEMPTING XERO PROJECT CREATION ===');
                    console.log('Xero Access Token (first 20 chars):', currentXeroTokenInfo.accessToken.substring(0, 20) + '...');
                    console.log('Xero Tenant ID:', currentXeroTokenInfo.tenantId);
                    
                    // Validate the data before sending
                    console.log('=== PROJECT DATA VALIDATION ===');
                    console.log('xeroContactId:', JSON.stringify(xeroContactId));
                    console.log('projectNumber:', JSON.stringify(projectNumber));
                    console.log('dealDetails.title:', JSON.stringify(dealDetails.title));
                    console.log('projectName:', JSON.stringify(projectName));
                    console.log('dealDetails.value:', JSON.stringify(dealDetails.value));
                    console.log('Project Data being sent:', JSON.stringify(projectData, null, 2));
                    
                    // Double-check the structure
                    if (!projectData.contactId || typeof projectData.contactId !== 'string') {
                        console.error('❌ INVALID contactId:', projectData.contactId);
                    }
                    if (!projectData.name || typeof projectData.name !== 'string') {
                        console.error('❌ INVALID name:', projectData.name);
                    }
                    if (projectData.contactId && projectData.name) {
                        console.log('✅ Project data validation passed');
                    }
                    console.log('Deal ID:', dealId);
                    console.log('Company ID:', companyId);
                    console.log('=== CALLING createXeroProject ===');

                    xeroProject = await xeroApiService.createXeroProject(
                        currentXeroTokenInfo.accessToken,
                        currentXeroTokenInfo.tenantId,
                        projectData,
                        null, // quoteId - you can link this if you have quote info
                        dealId,
                        companyId
                    );
                    console.log('✅ Xero project created successfully:', xeroProject);
                } else {
                    console.warn('No Xero contact available, skipping Xero project creation');
                }
                
            } catch (xeroProjectError) {
                console.error('=== XERO PROJECT INTEGRATION ERROR ===');
                console.error('Failed to create Xero project for deal:', dealId);
                console.error('Company ID:', companyId);
                console.error('Project Number:', projectNumber);
                console.error('Xero Contact ID:', xeroContactId);
                console.error('Error Type:', typeof xeroProjectError);
                console.error('Error Name:', xeroProjectError.name);
                console.error('Error Message:', xeroProjectError.message);
                console.error('Error Stack:', xeroProjectError.stack);
                
                if (xeroProjectError.response) {
                    console.error('=== HTTP RESPONSE ERROR DETAILS ===');
                    console.error('HTTP Status:', xeroProjectError.response.status);
                    console.error('Status Text:', xeroProjectError.response.statusText);
                    console.error('Response Headers:', JSON.stringify(xeroProjectError.response.headers, null, 2));
                    console.error('Response Data (Full):', JSON.stringify(xeroProjectError.response.data, null, 2));
                    
                    // Check for specific Xero error patterns
                    if (xeroProjectError.response.data) {
                        const errorData = xeroProjectError.response.data;
                        
                        if (errorData.Elements) {
                            console.error('=== XERO VALIDATION ERRORS ===');
                            errorData.Elements.forEach((element, index) => {
                                console.error(`Validation Error ${index + 1}:`, JSON.stringify(element, null, 2));
                            });
                        }
                        
                        if (errorData.Type) {
                            console.error('Xero Error Type:', errorData.Type);
                        }
                        
                        if (errorData.Message) {
                            console.error('Xero Error Message:', errorData.Message);
                        }
                        
                        if (errorData.Detail) {
                            console.error('Xero Error Detail:', errorData.Detail);
                        }
                    }
                } else if (xeroProjectError.request) {
                    console.error('=== REQUEST ERROR (No Response) ===');
                    console.error('Request was made but no response received');
                    console.error('Request details:', xeroProjectError.request);
                } else {
                    console.error('=== GENERAL ERROR ===');
                    console.error('Error in setting up the request');
                }
                
                console.error('=== END XERO ERROR DETAILS ===');
                
                xeroError = `${xeroProjectError.message} (Status: ${xeroProjectError.response?.status || 'Unknown'})`;
                // Don't fail the entire operation if Xero project creation fails
            }
        }

        // 5. Fetch additional deal-related data for comprehensive response
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

        // 6. Update Pipedrive deal with the generated project number
        try {
            await pipedriveApiService.updateDealWithProjectNumber(apiDomain, accessToken, dealId, projectNumber);
            console.log(`Pipedrive deal ${dealId} updated with project number ${projectNumber}`);
        } catch (updateError) {
            console.warn(`Warning: Failed to update Pipedrive deal ${dealId} with project number ${projectNumber}:`, updateError.message);
            // Continue execution even if the update fails - the project number is still generated and stored
        }

        // 7. Create enhanced deal object with custom fields
        const projectDealObject = {
            ...dealDetails,
            // Add custom fields to the deal object
            department: departmentName,
            vessel_name: vesselNameKey ? (dealDetails[vesselNameKey] || null) : null,
            sales_in_charge: salesInChargeKey ? (dealDetails[salesInChargeKey] || null) : null,
            location: locationKey ? (dealDetails[locationKey] || null) : null,
            // Add the generated project number
            projectNumber: projectNumber
        };

        // 8. Return comprehensive project data
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

        const xeroStatus = xeroProject ? 'with Xero project' : (xeroError ? `with Xero error: ${xeroError}` : 'without Xero');
        console.log(`Project creation completed for deal ${dealId} with project number ${projectNumber} ${xeroStatus}`);
        res.status(201).json(responseData);

    } catch (error) {
        console.error('Error in createFullProject controller:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: 'Failed to create project.',
            details: error.message,
            dealId: dealId,
            companyId: companyId
        });
    }
};
