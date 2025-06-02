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

export const updateQuoteStatus = async (accessToken, tenantId, quoteId, status) => {
  if (!quoteId || !status) {
    throw new Error('Quote ID and status are required for updating quote status.');
  }

  const validStatuses = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'INVOICED'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  try {
    const response = await axios.post(
      `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`,
      {
        Quotes: [{
          QuoteID: quoteId,
          Status: status
        }]
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );
    
    console.log(`Xero quote ${quoteId} status updated to ${status} successfully:`, response.data);
    return response.data.Quotes[0];
  } catch (error) {
    console.error(
      `Error updating Xero quote ${quoteId} status to ${status}:`,
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
    
    if (error.response && error.response.data && error.response.data.Elements) {
      throw {
        message: `Xero API validation error while updating quote ${quoteId} status.`,
        details: error.response.data.Elements,
        status: error.response.status
      };
    }
    throw error;
  }
};

export const createXeroProject = async (accessToken, tenantId, projectData, quoteId = null, dealId = null, pipedriveCompanyId = null) => {
  console.log('=== DEBUG: createXeroProject function called ===');
  console.log('accessToken (first 20 chars):', accessToken ? accessToken.substring(0, 20) + '...' : 'MISSING');
  console.log('tenantId:', tenantId);
  console.log('projectData (full object):', JSON.stringify(projectData, null, 2));
  console.log('quoteId:', quoteId);
  console.log('dealId:', dealId);
  console.log('pipedriveCompanyId:', pipedriveCompanyId);
  
  const { contactId, name, estimateAmount, deadline } = projectData;
  
  console.log('=== DEBUG: After destructuring ===');
  console.log('contactId:', contactId);
  console.log('name:', name);
  console.log('estimateAmount:', estimateAmount);
  console.log('deadline:', deadline);

  if (!contactId || !name) {
    console.error('=== VALIDATION ERROR ===');
    console.error('contactId is missing:', !contactId);
    console.error('name is missing:', !name);
    throw new Error('Contact ID and project name are required for creating a Xero project.');
  }

  // Xero Projects API expects specific field names in Pascal case
  const projectPayload = {
    ContactId: contactId,
    Name: name,
    ...(estimateAmount && { EstimateAmount: parseFloat(estimateAmount) }),
    ...(deadline && { Deadline: deadline }) // Format should be YYYY-MM-DD
  };

  // Add reference to link back to Pipedrive deal if provided
  if (dealId && pipedriveCompanyId) {
    projectPayload.Reference = `Pipedrive Deal ID: ${dealId} (Company: ${pipedriveCompanyId})`;
  }
  if (quoteId) {
    projectPayload.Reference = projectPayload.Reference 
      ? `${projectPayload.Reference}, Xero Quote: ${quoteId}`
      : `Xero Quote ID: ${quoteId}`;
  }

  try {
    console.log('=== XERO PROJECT CREATION ATTEMPT ===');
    console.log('Final projectPayload object:', JSON.stringify(projectPayload, null, 2));
    console.log('ContactId value:', JSON.stringify(projectPayload.ContactId));
    console.log('Name value:', JSON.stringify(projectPayload.Name));
    console.log('Endpoint:', 'https://api.xero.com/projects.xro/2.0/projects');
    
    // Double-check the payload structure
    console.log('=== FINAL PAYLOAD VALIDATION ===');
    console.log('Is ContactId present?', !!projectPayload.ContactId);
    console.log('Is Name present?', !!projectPayload.Name);
    console.log('ContactId type:', typeof projectPayload.ContactId);
    console.log('Name type:', typeof projectPayload.Name);
    
    const response = await axios.post(
      'https://api.xero.com/projects.xro/2.0/projects',
      projectPayload, // Send payload directly, not wrapped in array
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );
    
    console.log('Xero project created successfully:', response.data);
    return response.data; // Return the project data directly
  } catch (error) {
    console.error('=== XERO PROJECT CREATION ERROR ===');
    console.error('Error type:', typeof error);
    console.error('Error message:', error.message);
    
    if (error.response) {
      console.error('HTTP Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Response Headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
      
      // Check for specific error types
      if (error.response.status === 401) {
        console.error('AUTHENTICATION ERROR: Token may be invalid or expired');
      } else if (error.response.status === 403) {
        console.error('AUTHORIZATION ERROR: Missing permissions or scopes');
      } else if (error.response.status === 404) {
        console.error('ENDPOINT ERROR: API endpoint not found - check URL');
      } else if (error.response.status === 400) {
        console.error('BAD REQUEST ERROR: Invalid data sent to API');
      }
    } else if (error.request) {
      console.error('NO RESPONSE ERROR: Request was made but no response received');
      console.error('Request details:', error.request);
    } else {
      console.error('REQUEST SETUP ERROR:', error.message);
    }
    
    console.error('=== END ERROR DETAILS ===');
    
    if (error.response && error.response.data && error.response.data.Elements) {
      throw {
        message: "Xero API validation error while creating project.",
        details: error.response.data.Elements,
        status: error.response.status
      };
    }
    throw error;
  }
};
