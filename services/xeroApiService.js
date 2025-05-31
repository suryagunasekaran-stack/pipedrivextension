import axios from 'axios'; // Ensure axios is imported

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

export const findXeroContactByEmail = async (accessToken, tenantId, email) => {
  if (!email) return null;
  try {
    const response = await axios.get(
      'https://api.xero.com/api.xro/2.0/Contacts',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          Accept: 'application/json',
        },
        params: {
          where: `EmailAddress=="${email}"`,
        },
      }
    );
    if (response.data.Contacts && response.data.Contacts.length > 0) {
      return response.data.Contacts[0]; // Return the first match
    }
    return null;
  } catch (error) {
    console.error('Error finding Xero contact by email:', error.response ? error.response.data : error.message);
    // If it's a 404 or similar, it's not an "error" in the sense of "contact not found"
    if (error.response && error.response.status === 400 && error.response.data && error.response.data.Message && error.response.data.Message.includes("validation error")) {
        // This can happen if the email is badly formatted for the query
        console.warn("Validation error likely in email format for Xero query:", email);
        return null;
    }
    // For other errors, rethrow or handle as appropriate
    // For now, let's not throw, just return null, as "not found" is a valid outcome.
    return null;
  }
};

export const findXeroContactByName = async (accessToken, tenantId, name) => {
  if (!name) return null;
  try {
    const response = await axios.get(
      'https://api.xero.com/api.xro/2.0/Contacts',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          Accept: 'application/json',
        },
        params: {
          // Ensure the name is properly escaped for the query string if it contains special characters.
          // For simplicity, direct string interpolation is used here. Consider a robust escaping mechanism if names are complex.
          where: `Name=="${name.replace(/"/g, '\\"')}"` // Basic escaping for double quotes in name
        },
      }
    );
    if (response.data.Contacts && response.data.Contacts.length > 0) {
      // Xero's name filter can be broad. You might want to add more checks
      // if multiple contacts can have similar names.
      return response.data.Contacts[0]; // Return the first match
    }
    return null;
  } catch (error) {
    console.error('Error finding Xero contact by name:', error.response ? error.response.data : error.message);
     if (error.response && error.response.status === 400 && error.response.data && error.response.data.Message && error.response.data.Message.includes("validation error")) {
        console.warn("Validation error likely in name format for Xero query:", name);
        return null;
    }
    return null;
  }
};

export const createXeroContact = async (accessToken, tenantId, contactPayload) => {
  try {
    const response = await axios.put( // Using PUT to create one or more contacts
      'https://api.xero.com/api.xro/2.0/Contacts',
      { Contacts: [contactPayload] }, // Xero API expects an array of contacts
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );
    console.log('Xero contact created/updated successfully:', response.data.Contacts[0]);
    return response.data.Contacts[0]; // Return the first created/updated contact object
  } catch (error) {
    console.error(
      'Error creating Xero contact:',
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
    throw error; // Re-throw the error to be handled by the controller
  }
};

// Assuming createQuote and getXeroTenantId are defined elsewhere in this file or imported
// Make sure getXeroTenantId is exported if it's in this file and used by other services/controllers directly.
// export const getXeroTenantId = async (accessToken) => { ... };

export const createQuote = async (accessToken, tenantId, quotePayload, idempotencyKey, pipedriveDealReference) => {
  // Ensure it uses the idempotencyKey if provided
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Xero-Tenant-Id': tenantId,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  // Add Pipedrive deal reference to the quote payload
  const finalQuotePayload = {
    ...quotePayload,
    ...(pipedriveDealReference && { Reference: pipedriveDealReference })
  };

  try {
    const response = await axios.put(
      `https://api.xero.com/api.xro/2.0/Quotes`,
      { Quotes: [finalQuotePayload] }, // Use the payload with the reference
      { headers }
    );
    console.log('Xero quote created successfully:', response.data);
    // Assuming response.data.Quotes[0] is the created quote
    return response.data.Quotes[0]; 
  } catch (error) {
    console.error(
      'Error creating Xero quote:',
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
    // Add more specific error handling if needed based on Xero's error responses
    if (error.response && error.response.data && error.response.data.Elements) {
        // Handle validation errors specifically
        throw {
            message: "Xero API validation error while creating quote.",
            details: error.response.data.Elements,
            status: error.response.status
        };
    }
    throw error; // Re-throw for controller to handle
  }
};
