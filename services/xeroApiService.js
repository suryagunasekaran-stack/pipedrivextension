import axios from 'axios'; // Changed to import

export async function getXeroConnections(accessToken) {
    const connectionsUrl = 'https://api.xero.com/connections';
    const response = await axios.get(connectionsUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.data || response.data.length === 0) {
        throw new Error('No Xero tenants found for this user.');
    }
    return response.data; // Returns an array of connections
}

export async function findXeroContactByEmail(accessToken, tenantId, email) {
    const searchContactUrl = `https://api.xero.com/api.xro/2.0/Contacts?where=EmailAddress=="${encodeURIComponent(email)}"`;
    const response = await axios.get(searchContactUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Accept': 'application/json'
        }
    });
    if (response.data.Contacts && response.data.Contacts.length > 0) {
        return response.data.Contacts[0];
    }
    return null;
}

export async function createXeroContact(accessToken, tenantId, contactPayload) {
    const createContactUrl = 'https://api.xero.com/api.xro/2.0/Contacts';
    const response = await axios.post(createContactUrl, { Contacts: [contactPayload] }, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
    return response.data.Contacts[0];
}

export const createQuote = async (accessToken, tenantId, pipedriveData, pipedriveCompanyId, idempotencyKey) => {
    const { deal, person, organization, products } = pipedriveData;

    const lineItems = products.map(p => ({
        Description: p.name || 'Unnamed Product',
        Quantity: p.quantity || 1,
        UnitAmount: p.item_price || 0,
        AccountCode: process.env.XERO_DEFAULT_ACCOUNT_CODE || '200', // Use from .env or default
        TaxType: process.env.XERO_DEFAULT_TAX_TYPE || 'NONE', // Use from .env or default
        // LineAmount: (p.quantity || 1) * (p.item_price || 0) // Xero calculates this
    }));

    const quotePayload = {
        Contact: { ContactID: xeroContact.ContactID },
        LineItems: lineItems,
        Date: new Date().toISOString().split('T')[0], // Today's date
        // ExpiryDate: ... // Optional: Add logic for expiry date if needed
        Status: 'DRAFT',
        // Reference: `Deal: ${deal.title}` // Optional: Add a reference
    };

    try {
        const response = await axios.put(
            `https://api.xero.com/api.xro/2.0/Quotes`,
            { Quotes: [quotePayload] }, // Send as an array with one quote object
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Xero-Tenant-Id': tenantId,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Idempotency-Key': idempotencyKey // Add idempotency key
                },
            }
        );
        console.log('Xero quote created successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error creating Xero quote:', error.response ? error.response.data : error.message);
        throw new Error('Unable to create quote in Xero');
    }
};
