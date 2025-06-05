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
import logger from '../lib/logger.js';

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
 * Updates the status of a Xero quote
 * 
 * @param {string} accessToken - Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} quoteId - Quote ID to update
 * @param {string} status - New status (e.g., 'ACCEPTED', 'DECLINED')
 * @returns {Promise<Object>} Updated quote object
 */
export const updateQuoteStatus = async (accessToken, tenantId, quoteId, status) => {
  try {
    logger.system('Updating Xero quote status', {
      quoteId,
      status,
      operation: 'quote_status_update'
    });

    // Get current quote details
    const getCurrentQuoteUrl = `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`;
    const currentQuote = await axios.get(getCurrentQuoteUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Accept': 'application/json'
      }
    });

    const currentQuoteData = currentQuote.data?.Quotes?.[0];
    if (!currentQuoteData) {
      throw new Error('Quote not found or invalid response from Xero API');
    }

    const currentStatus = currentQuoteData.Status;
    
    // Check if quote is already in the desired state
    if (currentStatus === status) {
      logger.system('Quote already has target status', { quoteId, status });
      return currentQuoteData;
    }

    // Validate status transition
    if (currentStatus === 'ACCEPTED' && status !== 'ACCEPTED') {
      throw new Error(`Cannot change quote status from ACCEPTED to ${status}. Accepted quotes cannot be modified.`);
    }

    // Prepare update payload with required fields
    const updatePayload = {
      Quotes: [{
        QuoteID: quoteId,
        Status: status,
        // Include required fields from current quote
        Contact: currentQuoteData.Contact,
        Date: currentQuoteData.Date,
        LineItems: currentQuoteData.LineItems,
        Title: currentQuoteData.Title || '',
        Summary: currentQuoteData.Summary || '',
        Terms: currentQuoteData.Terms || ''
      }]
    };

    // Send update request
    const updateUrl = `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`;
    const response = await axios.post(updateUrl, updatePayload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    logger.system('Quote status update completed', {
      quoteId,
      oldStatus: currentStatus,
      newStatus: response.data?.Quotes?.[0]?.Status,
      operation: 'quote_status_update'
    });

    if (!response.data || !response.data.Quotes || !response.data.Quotes[0]) {
      throw new Error('Invalid response format from Xero API');
    }
    
    return response.data.Quotes[0];
  } catch (error) {
    logger.error(error, null, 'Xero quote status update', {
      quoteId,
      status,
      errorType: error.constructor.name,
      statusCode: error.response?.status
    });
    
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
    console.log('Sending project creation request to Xero:', {
      url: 'https://api.xero.com/projects.xro/2.0/projects',
      payload: projectPayload,
      headers: {
        Authorization: 'Bearer [REDACTED]',
        'Xero-Tenant-Id': tenantId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }
    });

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
    
    console.log('Xero project creation response status:', response.status);
    console.log('Xero project creation response data type:', typeof response.data);
    console.log('Xero project creation response data keys:', response.data ? Object.keys(response.data) : 'null');
    console.log('Xero API response:', response.data);

    if (!response.data) {
      throw new Error('No data received from Xero API');
    }

    // Ensure we have a consistent project ID in the response
    const project = response.data;
    if (!project) {
      throw new Error('Invalid project data received from Xero API');
    }

    // Log the raw project data for debugging
    console.log('Raw project data:', project);
    console.log('Project data type:', typeof project);
    console.log('Project data keys:', Object.keys(project));

    // Check for project ID in various possible locations
    if (project.ProjectID) {
      project.projectId = project.ProjectID;
      console.log('Found ProjectID:', project.ProjectID);
    } else if (project.projectId) {
      project.ProjectID = project.projectId;
      console.log('Found projectId:', project.projectId);
    } else if (project.id) {
      project.ProjectID = project.id;
      project.projectId = project.id;
      console.log('Found id:', project.id);
    } else if (project.projectNumber) {
      project.ProjectID = project.projectNumber;
      project.projectId = project.projectNumber;
      console.log('Found projectNumber:', project.projectNumber);
    } else {
      console.error('Project response missing ID. Available fields:', Object.keys(project));
      console.error('Full project object:', project);
      throw new Error('Project ID not found in Xero API response');
    }
    
    console.log('Processed project data with ID:', {
      ProjectID: project.ProjectID,
      projectId: project.projectId,
      Name: project.Name
    });
    return project;
  } catch (error) {
    console.error('Error in createXeroProject:', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    if (error.response) {
      console.error('Xero API Error:', error.response.status, error.response.data);
      throw {
        message: "Xero API error while creating project",
        details: error.response.data,
        status: error.response.status
      };
    } else if (error.request) {
      console.error('Network Error: No response received from Xero API');
      throw {
        message: "Network error while creating project",
        details: "No response received from Xero API"
      };
    } else {
      console.error('Request Setup Error:', error.message);
      throw {
        message: "Error setting up project creation request",
        details: error.message
      };
    }
  }
};

/**
 * Creates a task in a Xero project
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} projectId - Project ID to create task in
 * @param {string} name - Task name
 * @returns {Promise<Object>} Created task object
 * @throws {Error} When task creation fails
 */
export const createXeroTask = async (accessToken, tenantId, projectId, name) => {
  if (!projectId || !name) {
    throw new Error('Project ID and task name are required for creating a Xero task.');
  }

  try {
    logger.info('Creating Xero task', {
      projectId,
      name,
      tenantId
    });

    const taskPayload = {
      Name: name,
      ChargeType: "FIXED",
      RateValue: 0,
      EstimateMinutes: 0,
      Amount: 0,
      Status: "ACTIVE"
    };

    logger.debug('Task creation payload', taskPayload);

    const url = `https://api.xero.com/projects.xro/2.0/projects/${projectId}/tasks`;
    logger.debug('Task creation URL', { url });

    const response = await axios.post(
      url,
      taskPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );
    
    logger.info('Task creation response received', {
      projectId,
      name,
      responseStatus: response.status,
      hasData: !!response.data,
      responseKeys: response.data ? Object.keys(response.data) : []
    });

    if (!response.data) {
      throw new Error('No data received from Xero API');
    }

    logger.debug('Task creation successful', {
      projectId,
      name,
      taskData: response.data
    });

    return response.data;
  } catch (error) {
    logger.error(error, {
      projectId,
      name,
      action: 'create_task',
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      } : 'No response object',
      request: error.config ? {
        method: error.config.method,
        url: error.config.url,
        headers: error.config.headers
      } : 'No config object'
    }, 'Error creating Xero task');
    
    // Provide more specific error messages
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      if (status === 404) {
        throw new Error(`Project ${projectId} not found in Xero. Please verify the project exists.`);
      } else if (status === 400) {
        throw new Error(`Invalid task data provided: ${errorData?.message || 'Bad request'}`);
      } else if (status === 401) {
        throw new Error('Unauthorized: Access token may be expired or invalid');
      } else if (status === 403) {
        throw new Error('Forbidden: Insufficient permissions to create tasks');
      } else {
        throw new Error(`Xero API error (${status}): ${errorData?.message || error.message}`);
      }
    } else if (error.request) {
      throw new Error('Network error: Unable to connect to Xero API');
    } else {
      throw error;
    }
  }
};

/**
 * Retrieves all quotes from Xero
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @returns {Promise<Array>} Array of quote objects
 * @throws {Error} When quote retrieval fails
 */
export const getXeroQuotes = async (accessToken, tenantId) => {
  try {
    console.log('=== DEBUG: Retrieving all Xero quotes ===');
    console.log('Request parameters:', {
      tenantId,
      accessTokenLength: accessToken ? accessToken.length : 0
    });

    const url = 'https://api.xero.com/api.xro/2.0/Quotes';
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      Accept: 'application/json',
    };

    console.log('Request details:', {
      method: 'GET',
      url,
      headers: {
        ...headers,
        Authorization: `Bearer ${accessToken.substring(0, 10)}...`
      }
    });

    const response = await axios.get(url, { headers });
    


    const quotes = response.data.Quotes || [];

    
    return quotes;
  } catch (error) {

    console.error('Error retrieving Xero quotes:', error.response ? error.response.data : error.message);
    throw error;
  }
};

/**
 * Finds a Xero quote by quote number
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} quoteNumber - Quote number to search for
 * @returns {Promise<Object|null>} Quote object or null if not found
 * @throws {Error} When quote search fails
 */
export const findXeroQuoteByNumber = async (accessToken, tenantId, quoteNumber) => {
  try {
    console.log('=== DEBUG: Finding Xero quote by number ===');
    console.log('Search parameters:', {
      quoteNumber,
      tenantId,
      accessTokenLength: accessToken ? accessToken.length : 0
    });

    const quotes = await getXeroQuotes(accessToken, tenantId);
    
    console.log('=== DEBUG: Retrieved quotes from Xero ===');
    console.log('Total quotes found:', quotes.length);
    console.log('Quote numbers in system:', quotes.map(q => q.QuoteNumber));
    console.log('Looking for quote number:', quoteNumber);
    
    // Log detailed info about each quote for debugging
    quotes.forEach((quote, index) => {
      console.log(`Quote ${index + 1}:`, {
        QuoteNumber: quote.QuoteNumber,
        QuoteID: quote.QuoteID,
        Status: quote.Status,
        Reference: quote.Reference,
        Contact: quote.Contact ? quote.Contact.Name : 'No contact'
      });
    });

    const foundQuote = quotes.find(quote => {
      const match = quote.QuoteNumber === quoteNumber;
      console.log(`Comparing "${quote.QuoteNumber}" === "${quoteNumber}": ${match}`);
      return match;
    });
    
    console.log('=== DEBUG: Quote search result ===');
    console.log('Found quote:', foundQuote ? {
      QuoteNumber: foundQuote.QuoteNumber,
      QuoteID: foundQuote.QuoteID,
      Status: foundQuote.Status,
      Reference: foundQuote.Reference
    } : 'null');

    return foundQuote || null;
  } catch (error) {
    console.log('=== DEBUG: Error finding quote by number ===');
    console.log('Error message:', error.message);
    console.log('Error response:', error.response?.data);
    console.error('Error finding Xero quote by number:', error.response ? error.response.data : error.message);
    throw error;
  }
};

/**
 * Retrieves all projects from Xero
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @returns {Promise<Array>} Array of project objects
 * @throws {Error} When project retrieval fails
 */
export const getXeroProjects = async (accessToken, tenantId) => {
  try {
    const response = await axios.get(
      'https://api.xero.com/projects.xro/2.0/projects',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          Accept: 'application/json',
        },
      }
    );
    
    return response.data.Items || [];
  } catch (error) {
    console.error('Error retrieving Xero projects:', error.response ? error.response.data : error.message);
    throw error;
  }
};
