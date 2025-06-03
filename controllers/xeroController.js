import * as tokenService from '../services/tokenService.js'; // Added .js and changed import style
import * as pipedriveApiService from '../services/pipedriveApiService.js'; // Added .js and changed import style
import * as xeroApiService from '../services/xeroApiService.js'; // Added .js and changed import style
import { v4 as uuidv4 } from 'uuid';

export const getXeroStatus = (req, res) => {
    const { pipedriveCompanyId } = req.query;

    if (!pipedriveCompanyId) {
        return res.status(400).json({ error: 'Pipedrive Company ID is required.' });
    }

    const xeroTokenInfo = tokenService.allXeroTokens[pipedriveCompanyId];

    if (xeroTokenInfo && xeroTokenInfo.accessToken && xeroTokenInfo.tenantId) {
        // Basic check: token and tenantId exist
        // For a more robust check, you could verify if the token is close to expiry
        // or even make a lightweight API call to Xero (e.g., /connections)
        // to ensure the token is still valid, but that adds latency.
        const isConnected = true;
        const needsReconnect = Date.now() >= (xeroTokenInfo.tokenExpiresAt || 0);
        res.json({ 
            isConnected: isConnected, 
            needsReconnect: needsReconnect, // Client can use this to prompt re-auth if token is expired
            message: isConnected ? 'Xero is connected.' : 'Xero is not connected.' 
        });
    } else {
        res.json({ isConnected: false, message: 'Xero is not connected.' });
    }
};

export const createXeroQuote = async (req, res) => {
    const { pipedriveCompanyId, pipedriveDealId } = req.body;

    if (!pipedriveCompanyId || !pipedriveDealId) {
        return res.status(400).json({ error: 'Pipedrive Company ID and Deal ID are required.' });
    }

    try {
        // 1. Get Pipedrive Tokens and Data
        let pdCompanyTokens = tokenService.allCompanyTokens[pipedriveCompanyId];
        if (!pdCompanyTokens || !pdCompanyTokens.accessToken) {
            return res.status(401).json({ error: `Pipedrive not authenticated for company ${pipedriveCompanyId}.` });
        }
        if (Date.now() >= pdCompanyTokens.tokenExpiresAt) {
            pdCompanyTokens = await tokenService.refreshPipedriveToken(pipedriveCompanyId);
        }
        const pdApiDomain = pdCompanyTokens.apiDomain; // Ensure this is correctly retrieved/set during Pipedrive auth
        const pdAccessToken = pdCompanyTokens.accessToken;

        const dealDetails = await pipedriveApiService.getDealDetails(pdApiDomain, pdAccessToken, pipedriveDealId);
        if (!dealDetails) return res.status(404).json({ error: `Pipedrive Deal ${pipedriveDealId} not found.` });

        // Fetch Organization details - this will be the primary contact entity in Xero
        if (!dealDetails.org_id || !dealDetails.org_id.value) {
            return res.status(400).json({ error: 'Pipedrive Deal is not associated with an Organization, which is required for the Xero contact.' });
        }
        // Assuming getOrganizationDetails exists in pipedriveApiService
        const organizationDetails = await pipedriveApiService.getOrganizationDetails(pdApiDomain, pdAccessToken, dealDetails.org_id.value);
        if (!organizationDetails) return res.status(404).json({ error: `Pipedrive Organization ${dealDetails.org_id.value} not found.` });

        // Fetch Person details (for email, to associate with the Organization contact in Xero)
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

        if (!contactName) { // Should be caught by organizationDetails check, but good to be safe.
             return res.status(400).json({ error: 'Pipedrive organization has no name, which is required for Xero contact.' });
        }

        // 2. Get Xero Tokens (and refresh if necessary)
        let xeroTokenInfo = tokenService.allXeroTokens[pipedriveCompanyId];
        if (!xeroTokenInfo || !xeroTokenInfo.accessToken || !xeroTokenInfo.tenantId) {
            return res.status(401).json({ error: `Xero not authenticated for Pipedrive company ${pipedriveCompanyId}. Please connect to Xero first.` });
        }

        if (Date.now() >= xeroTokenInfo.tokenExpiresAt) {
            xeroTokenInfo = await tokenService.refreshXeroToken(pipedriveCompanyId); // This should save the refreshed token
        }
        const xeroAccessToken = xeroTokenInfo.accessToken;
        const xeroTenantId = xeroTokenInfo.tenantId;


        // 3. Xero Contact Management (using Organization Name and Person's Email)
        let xeroContactID;
        
        // Try to find Xero contact by Organization Name
        let existingXeroContact = await xeroApiService.findXeroContactByName(xeroAccessToken, xeroTenantId, contactName);

        if (existingXeroContact) {
            xeroContactID = existingXeroContact.ContactID;
            // Optional: If contactEmail is available and different from existingXeroContact.EmailAddress,
            // you could update the contact here. For now, we'll use the existing contact as is.
        } else {
            // If not found by name, create a new contact
            const newContactPayload = {
                Name: contactName,
                // Only add EmailAddress if contactEmail is not null/undefined
                ...(contactEmail && { EmailAddress: contactEmail }) 
            };
            const createdContact = await xeroApiService.createXeroContact(xeroAccessToken, xeroTenantId, newContactPayload);
            // createXeroContact now returns the contact object directly
            xeroContactID = createdContact.ContactID; 
        }

        // 4. Prepare Xero Quote Data
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
            Status: "DRAFT" // Or make this configurable / based on Pipedrive deal stage
        };
        
        const idempotencyKey = uuidv4();
        const pipedriveDealReference = `Pipedrive Deal ID: ${pipedriveDealId}`;

        // 5. Create Quote in Xero
        const createdQuote = await xeroApiService.createQuote(xeroAccessToken, xeroTenantId, quotePayload, idempotencyKey, pipedriveDealReference);
        
        // 6. Update Pipedrive deal with Xero Quote Number
        if (createdQuote && createdQuote.QuoteNumber) {
            try {
                // Ensure updateDealWithQuoteNumber is correctly imported/available in pipedriveApiService
                // Pass pdApiDomain and pdAccessToken to updateDealWithQuoteNumber
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
                // Provide more structured error details for the Pipedrive update failure
                const pipedriveErrorDetails = updateError.response ? updateError.response.data : (updateError.message || 'Unknown error during Pipedrive update.');
                return res.status(201).json({ // Still 201 as Xero quote was created
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

export const acceptXeroQuote = async (req, res) => {
    const { pipedriveCompanyId } = req.body; // Assuming companyId might be needed for token retrieval
    const { quoteId } = req.params;

    if (!pipedriveCompanyId) {
        return res.status(400).json({ error: 'Pipedrive Company ID is required in the request body.' });
    }
    if (!quoteId) {
        return res.status(400).json({ error: 'Xero Quote ID is required in the URL parameters.' });
    }

    try {
        // 1. Get Xero Tokens (and refresh if necessary)
        let xeroTokenInfo = tokenService.allXeroTokens[pipedriveCompanyId];
        if (!xeroTokenInfo || !xeroTokenInfo.accessToken || !xeroTokenInfo.tenantId) {
            return res.status(401).json({ error: `Xero not authenticated for Pipedrive company ${pipedriveCompanyId}. Please connect to Xero first.` });
        }

        if (Date.now() >= xeroTokenInfo.tokenExpiresAt) {
            xeroTokenInfo = await tokenService.refreshXeroToken(pipedriveCompanyId);
        }
        const xeroAccessToken = xeroTokenInfo.accessToken;
        const xeroTenantId = xeroTokenInfo.tenantId;

        // 2. Call Xero API to accept the quote
        // Placeholder for the actual Xero API call to accept a quote
        // You'll need to implement this in xeroApiService.js and call it here
        // For example: await xeroApiService.acceptQuote(xeroAccessToken, xeroTenantId, quoteId);
        
        // Simulating a successful quote acceptance for now
        
        // This is a placeholder. Replace with actual Xero API call.
        const acceptanceResult = await xeroApiService.updateQuoteStatus(xeroAccessToken, xeroTenantId, quoteId, 'ACCEPTED');


        if (acceptanceResult) { // Check if acceptanceResult indicates success
            res.status(200).json({ message: `Quote ${quoteId} successfully accepted in Xero.`, details: acceptanceResult });
        } else {
            // If acceptanceResult is structured to provide error details
            res.status(500).json({ error: `Failed to accept quote ${quoteId} in Xero.`, details: acceptanceResult });
        }

    } catch (error) {
        console.error('Error accepting Xero quote:', error);
        // Check if the error is from Xero API with specific details
        if (error.response && error.response.data) {
            return res.status(error.response.status || 500).json({ 
                error: 'Failed to accept Xero quote.', 
                xeroError: error.response.data 
            });
        }
        res.status(500).json({ error: 'Internal server error while accepting Xero quote.', details: error.message });
    }
};

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
        // 1. Get Xero Tokens (and refresh if necessary)
        let xeroTokenInfo = tokenService.allXeroTokens[pipedriveCompanyId];
        
        if (!xeroTokenInfo || !xeroTokenInfo.accessToken || !xeroTokenInfo.tenantId) {
            return res.status(401).json({ error: `Xero not authenticated for Pipedrive company ${pipedriveCompanyId}. Please connect to Xero first.` });
        }

        if (Date.now() >= xeroTokenInfo.tokenExpiresAt) {
            xeroTokenInfo = await tokenService.refreshXeroToken(pipedriveCompanyId);
        }
        
        const xeroAccessToken = xeroTokenInfo.accessToken;
        const xeroTenantId = xeroTokenInfo.tenantId;

        // 2. Prepare Project Data
        const projectData = {
            contactId: contactId,
            name: name,
            estimateAmount: estimateAmount, // Optional
            deadline: deadline, // Optional, format YYYY-MM-DD
        };

        // 3. Call Xero API to create the project
        const newProject = await xeroApiService.createXeroProject(xeroAccessToken, xeroTenantId, projectData, quoteId, dealId, pipedriveCompanyId);        // 4. Update Pipedrive deal with project number if available and dealId is provided
        if (newProject && dealId && pipedriveCompanyId) {
            try {
                // Get Pipedrive tokens for updating the deal
                let pdCompanyTokens = tokenService.allCompanyTokens[pipedriveCompanyId];
                if (!pdCompanyTokens || !pdCompanyTokens.accessToken) {
                    // Warning: Pipedrive tokens not available for deal update
                } else {
                    if (Date.now() >= pdCompanyTokens.tokenExpiresAt) {
                        pdCompanyTokens = await tokenService.refreshPipedriveToken(pipedriveCompanyId);
                    }
                    
                    const pdApiDomain = pdCompanyTokens.apiDomain;
                    const pdAccessToken = pdCompanyTokens.accessToken;
                    
                    // Try to extract project number/ID from the response
                    const projectIdentifier = newProject.projectId || newProject.id || newProject.projectNumber || `Project: ${name}`;
                    
                    await pipedriveApiService.updateDealWithProjectNumber(pdApiDomain, pdAccessToken, dealId, projectIdentifier);
                }
            } catch (updateError) {
                console.error('Failed to update Pipedrive deal with project info:', updateError.message);
                // Don't fail the whole operation if Pipedrive update fails
            }
        }

        if (newProject) { // Check if newProject indicates success
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
