import * as tokenService from '../services/tokenService.js'; // Added .js and changed import style
import * as pipedriveApiService from '../services/pipedriveApiService.js'; // Added .js and changed import style
import * as xeroApiService from '../services/xeroApiService.js'; // Added .js and changed import style
import { v4 as uuidv4 } from 'uuid'; // For idempotency key

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
            console.log(`Pipedrive token expired for ${pipedriveCompanyId} in createXeroQuote, attempting refresh.`);
            pdCompanyTokens = await tokenService.refreshPipedriveToken(pipedriveCompanyId);
        }
        const pdApiDomain = pdCompanyTokens.apiDomain;
        const pdAccessToken = pdCompanyTokens.accessToken;

        const dealDetails = await pipedriveApiService.getDealDetails(pdApiDomain, pdAccessToken, pipedriveDealId);
        if (!dealDetails) return res.status(404).json({ error: `Pipedrive Deal ${pipedriveDealId} not found.` });

        let personDetails = null;
        if (dealDetails.person_id && dealDetails.person_id.value) {
            personDetails = await pipedriveApiService.getPersonDetails(pdApiDomain, pdAccessToken, dealDetails.person_id.value);
        }
        if (!personDetails) return res.status(404).json({ error: 'Pipedrive Person details not found for the deal.' });
        
        const dealProducts = await pipedriveApiService.getDealProducts(pdApiDomain, pdAccessToken, pipedriveDealId);

        // 2. Get Xero Tokens (and refresh if necessary)
        let xeroTokenInfo = tokenService.allXeroTokens[pipedriveCompanyId];
        if (!xeroTokenInfo || !xeroTokenInfo.accessToken || !xeroTokenInfo.tenantId) {
            return res.status(401).json({ error: `Xero not authenticated for Pipedrive company ${pipedriveCompanyId}. Please connect to Xero first.` });
        }

        if (Date.now() >= xeroTokenInfo.tokenExpiresAt) {
            console.log(`Xero token expired for ${pipedriveCompanyId} in createXeroQuote, attempting refresh.`);
            xeroTokenInfo = await tokenService.refreshXeroToken(pipedriveCompanyId);
        }
        const xeroAccessToken = xeroTokenInfo.accessToken;
        const xeroTenantId = xeroTokenInfo.tenantId;

        // 3. Xero Contact Management
        let xeroContactID;
        const contactEmail = personDetails.email && personDetails.email.find(e => e.primary)?.value;
        const contactName = personDetails.name;

        if (!contactName) {
             return res.status(400).json({ error: 'Pipedrive person has no name, which is required for Xero contact.' });
        }

        const existingXeroContact = contactEmail ? await xeroApiService.findXeroContactByEmail(xeroAccessToken, xeroTenantId, contactEmail) : null;
        if (existingXeroContact) {
            xeroContactID = existingXeroContact.ContactID;
        } else {
            const newContactPayload = {
                Name: contactName,
                EmailAddress: contactEmail || undefined
            };
            const createdContact = await xeroApiService.createXeroContact(xeroAccessToken, xeroTenantId, newContactPayload);
            xeroContactID = createdContact.ContactID;
        }

        // 4. Prepare Xero Quote Data
        let lineItems = dealProducts.map(p => ({
            Description: p.name || 'N/A',
            Quantity: p.quantity || 1,
            UnitAmount: p.item_price || 0,
            AccountCode: "200", // Placeholder
            TaxType: "NONE"     // Placeholder
        }));

        if (lineItems.length === 0 && dealDetails.value && dealDetails.value > 0) {
             lineItems.push({
                Description: dealDetails.title || "Deal Value",
                Quantity: 1,
                UnitAmount: dealDetails.value,
                AccountCode: "200",
                TaxType: "NONE"
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

        // 5. Create Quote in Xero
        const createdQuote = await xeroApiService.createXeroQuote(xeroAccessToken, xeroTenantId, quotePayload);
        
        // Update Pipedrive deal with Xero Quote Number
        try {
            await pipedriveApiService.updateDealWithQuoteNumber(pipedriveDealId, createdQuote.QuoteNumber, pipedriveCompanyId);
        } catch (updateError) {
            console.error('Failed to update Pipedrive deal with Xero quote number:', updateError.message);
            // Handle error (e.g., log it, notify someone, etc.)
        }

        res.status(201).json({ 
            message: 'Xero quote created successfully!', 
            quoteNumber: createdQuote.QuoteNumber, 
            quoteId: createdQuote.QuoteID,
            xeroContactID: xeroContactID,
            status: createdQuote.Status
        });

    } catch (error) {
        console.error('Error in /api/xero/create-quote:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        if (error.response && error.response.data && error.response.data.Elements) {
            return res.status(400).json({ error: 'Xero API validation error.', details: error.response.data.Elements });
        }
        if (error.response && error.response.data && error.response.data.Message) {
            return res.status(error.response.status || 500).json({ error: error.response.data.Message, details: error.response.data.Detail || error.message });
        }
        res.status(500).json({ error: 'Failed to create Xero quote.', details: error.message });
    }
};
