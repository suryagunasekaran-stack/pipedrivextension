/**
 * Xero API Integration Service
 * 
 * This module provides a comprehensive interface to the Xero accounting API,
 * handling contact management, quote creation and updates, project management,
 * and tenant connections. All functions include proper error handling and
 * validation for reliable integration with the Xero platform.
 * 
 * Key features:
 * - Tenant connection management
 * - Contact search by email and name with validation
 * - Contact creation with proper error handling
 * - Quote creation with idempotency support
 * - Quote status management with validation
 * - Project creation and management
 * 
 * @module services/xeroApiService
 */

import axios from 'axios';

/**
 * Retrieves all Xero tenant connections for the authenticated user
 * 
 * @param {string} accessToken - Valid Xero access token
 * @returns {Promise<Array>} Array of tenant connection objects
 * @throws {Error} When no tenants are found for the user
 */
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
    return response.data;
}

/**
 * Finds a Xero contact by email address
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} email - Email address to search for
 * @returns {Promise<Object|null>} Contact object or null if not found
 */
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
      return response.data.Contacts[0];
    }
    return null;
  } catch (error) {
    console.error('Error finding Xero contact by email:', error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 400 && error.response.data && error.response.data.Message && error.response.data.Message.includes("validation error")) {
        console.warn("Validation error in email format for Xero query:", email);
        return null;
    }
    return null;
  }
};

/**
 * Finds a Xero contact by name
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} name - Contact name to search for
 * @returns {Promise<Object|null>} Contact object or null if not found
 */
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
          where: `Name=="${name.replace(/"/g, '\\"')}"` // Escape quotes in name
        },
      }
    );
    if (response.data.Contacts && response.data.Contacts.length > 0) {
      return response.data.Contacts[0];
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

/**
 * Creates a new contact in Xero
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {Object} contactPayload - Contact data to create
 * @returns {Promise<Object>} Created contact object
 * @throws {Error} When contact creation fails
 */
export const createXeroContact = async (accessToken, tenantId, contactPayload) => {
  try {
    const response = await axios.put(
      'https://api.xero.com/api.xro/2.0/Contacts',
      { Contacts: [contactPayload] },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );
    return response.data.Contacts[0];
  } catch (error) {
    console.error(
      'Error creating Xero contact:',
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
    throw error;
  }
};


/**
 * Creates a new quote in Xero with idempotency support
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {Object} quotePayload - Quote data to create
 * @param {string} [idempotencyKey] - Optional idempotency key for duplicate prevention
 * @param {string} [pipedriveDealReference] - Optional Pipedrive deal reference
 * @returns {Promise<Object>} Created quote object
 * @throws {Error} When quote creation fails or validation errors occur
 */
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

  const finalQuotePayload = {
    ...quotePayload,
    ...(pipedriveDealReference && { Reference: pipedriveDealReference })
  };

  try {
    const response = await axios.put(
      `https://api.xero.com/api.xro/2.0/Quotes`,
      { Quotes: [finalQuotePayload] },
      { headers }
    );
    return response.data.Quotes[0];
  } catch (error) {
    console.error(
      'Error creating Xero quote:',
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
    if (error.response && error.response.data && error.response.data.Elements) {
        throw {
            message: "Xero API validation error while creating quote.",
            details: error.response.data.Elements,
            status: error.response.status
        };
    }
    throw error;
  }
};

/**
 * Updates the status of an existing Xero quote
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} quoteId - Quote ID to update
 * @param {string} status - New status (DRAFT, SENT, ACCEPTED, DECLINED, INVOICED)
 * @returns {Promise<Object>} Updated quote object
 * @throws {Error} When quote ID/status missing or validation fails
 */
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

/**
 * Creates a new project in Xero with optional quote and deal references
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {Object} projectData - Project data including contactId, name, estimateAmount, deadline
 * @param {string} [quoteId] - Optional Xero quote ID for linking
 * @param {string} [dealId] - Optional Pipedrive deal ID for reference
 * @param {string} [pipedriveCompanyId] - Optional Pipedrive company ID for reference
 * @returns {Promise<Object>} Created project object
 * @throws {Error} When required fields missing or project creation fails
 */
export const createXeroProject = async (accessToken, tenantId, projectData, quoteId = null, dealId = null, pipedriveCompanyId = null) => {
  const { contactId, name, estimateAmount, deadline } = projectData;

  if (!contactId || !name) {
    throw new Error('Contact ID and project name are required for creating a Xero project.');
  }

  const projectPayload = {
    ContactId: contactId,
    Name: name,
    ...(estimateAmount && { EstimateAmount: parseFloat(estimateAmount) }),
    ...(deadline && { Deadline: deadline })
  };

  if (dealId && pipedriveCompanyId) {
    projectPayload.Reference = `Pipedrive Deal ID: ${dealId} (Company: ${pipedriveCompanyId})`;
  }
  if (quoteId) {
    projectPayload.Reference = projectPayload.Reference 
      ? `${projectPayload.Reference}, Xero Quote: ${quoteId}`
      : `Xero Quote ID: ${quoteId}`;
  }

  try {
    const response = await axios.post(
      'https://api.xero.com/projects.xro/2.0/projects',
      projectPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );
    
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Xero API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('Network Error: No response received from Xero API');
    } else {
      console.error('Request Setup Error:', error.message);
    }
    
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
