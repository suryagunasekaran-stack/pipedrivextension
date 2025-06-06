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
import crypto from 'crypto';

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
    logger.error('Error finding Xero contact by email', {
      email,
      error: error.response ? error.response.data : error.message
    });
    if (error.message && error.message.includes('email')) {
      logger.warn('Validation error in email format for Xero query', { email });
    }
    throw error;
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
    logger.error('Error finding Xero contact by name', {
      name,
      error: error.response ? error.response.data : error.message
    });
    if (error.message && error.message.includes('name')) {
      logger.warn('Validation error likely in name format for Xero query', { name });
    }
    throw error;
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
    logger.error('Error creating Xero contact', {
      error: error.response ? error.response.data : error.message,
      status: error.response?.status
    });
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
    logger.error('Error creating Xero quote', {
      error: error.response ? error.response.data : error.message,
      status: error.response?.status
    });
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
 * Accepts a Xero quote by following the proper status workflow
 * DRAFT -> SENT -> ACCEPTED
 * 
 * @param {string} accessToken - Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} quoteId - Quote ID to accept
 * @returns {Promise<Object>} Final accepted quote object
 */
export const acceptXeroQuote = async (accessToken, tenantId, quoteId) => {
  try {
    logger.info('Starting Xero quote acceptance process', {
      quoteId,
      operation: 'accept_quote'
    });

    // Get current quote to check status and get minimal required fields
    const getCurrentQuoteUrl = `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`;
    const currentQuoteResponse = await axios.get(getCurrentQuoteUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Accept': 'application/json'
      }
    });

    const currentQuote = currentQuoteResponse.data?.Quotes?.[0];
    if (!currentQuote) {
      throw new Error('Quote not found');
    }

    logger.info('Current quote status', {
      quoteId,
      currentStatus: currentQuote.Status,
      quoteNumber: currentQuote.QuoteNumber
    });

    // If already accepted, return as is
    if (currentQuote.Status === 'ACCEPTED') {
      logger.info('Quote is already accepted', { quoteId });
      return currentQuote;
    }

    // Prepare the update payload using the full current quote data
    // This helps prevent Xero from creating a new quote version (and number)
    // when only the status is being changed.
    const createUpdatePayload = (status) => {
      const payload = { ...currentQuote }; // Start with all current quote data
      delete payload.UpdatedDateUTC; // Remove fields that might cause issues or are read-only
      delete payload.Summary; 
      // Ensure LineItems are in the correct format if they exist
      if (payload.LineItems && Array.isArray(payload.LineItems)) {
        payload.LineItems = payload.LineItems.map(item => {
          const { LineItemID, LineAmount, TaxAmount, TaxType, AccountCode, Tracking, Quantity, UnitAmount, ItemCode, Description, DiscountRate, ...restOfItem } = item;
          // Return a minimal but valid line item, or expand as necessary based on API requirements
          // It's crucial that LineAmount, TaxAmount etc. are correctly calculated if not directly copied
          // For status updates, preserving existing validated line items is key.
          return { 
            Description: Description, // Essential
            Quantity: Quantity, // Essential
            UnitAmount: UnitAmount, // Essential
            AccountCode: AccountCode, // Often required
            TaxType: TaxType, // Often required
            LineAmount: LineAmount, // If provided, Xero might use it, otherwise it calculates
            ItemCode: ItemCode, // Optional
            DiscountRate: DiscountRate, // Optional
            // Potentially include LineItemID IF the API uses it to match/update existing lines
            // LineItemID: LineItemID 
          };
        });
      } else {
        // If no line items on currentQuote, ensure it's an empty array or handle as per API spec
        payload.LineItems = [];
      }
      payload.Status = status; // Set the new status
      return { Quotes: [payload] };
    };
    
    const updateUrl = `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`; // Using quoteId for specific quote update
    // const updateUrl = `https://api.xero.com/api.xro/2.0/Quotes`; // Using general endpoint for creating/updating quotes

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    let finalQuote = currentQuote;

    // Step 1: If DRAFT, change to SENT first
    if (currentQuote.Status === 'DRAFT') {
      logger.info('Changing quote status from DRAFT to SENT', { quoteId });
      
      const sentPayload = createUpdatePayload('SENT');

      const sentResponse = await axios.post(updateUrl, sentPayload, { headers });
      
      if (!sentResponse.data?.Quotes?.[0]) {
        throw new Error('Failed to update quote to SENT status');
      }
      
      finalQuote = sentResponse.data.Quotes[0];
      logger.info('Quote status updated to SENT', {
        quoteId,
        newStatus: finalQuote.Status,
        quoteNumber: finalQuote.QuoteNumber
      });
    }

    // Step 2: Change to ACCEPTED
    logger.info('Changing quote status to ACCEPTED', { quoteId });
    
    const acceptedPayload = createUpdatePayload('ACCEPTED');

    const acceptedResponse = await axios.post(updateUrl, acceptedPayload, { headers });
    
    if (!acceptedResponse.data?.Quotes?.[0]) {
      throw new Error('Failed to update quote to ACCEPTED status');
    }
    
    finalQuote = acceptedResponse.data.Quotes[0];
    
    logger.info('Quote acceptance completed', {
      quoteId,
      finalStatus: finalQuote.Status,
      quoteNumber: finalQuote.QuoteNumber
    });

    return finalQuote;

  } catch (error) {
    logger.error('Error accepting Xero quote', {
      quoteId,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    if (error.response?.data?.Elements) {
      throw {
        message: `Xero API validation error while accepting quote ${quoteId}.`,
        details: error.response.data.Elements,
        status: error.response.status
      };
    }
    throw error;
  }
};

/**
 * Updates the status of a Xero quote (legacy function - use acceptXeroQuote for accepting quotes)
 * 
 * @param {string} accessToken - Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} quoteId - Quote ID to update
 * @param {string} status - New status
 * @returns {Promise<Object>} Updated quote object
 * @deprecated Use acceptXeroQuote for quote acceptance
 */
export const updateQuoteStatus = async (accessToken, tenantId, quoteId, status) => {
  if (status === 'ACCEPTED') {
    logger.warn('Using legacy updateQuoteStatus for acceptance. Consider using acceptXeroQuote instead.', { quoteId });
    return await acceptXeroQuote(accessToken, tenantId, quoteId);
  }

  try {
    logger.info('Updating Xero quote status', {
      quoteId,
      status,
      operation: 'quote_status_update'
    });

    // Get current quote for minimal required fields
    const getCurrentQuoteUrl = `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`;
    const currentQuoteResponse = await axios.get(getCurrentQuoteUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Accept': 'application/json'
      }
    });

    const currentQuote = currentQuoteResponse.data?.Quotes?.[0];
    if (!currentQuote) {
      throw new Error('Quote not found');
    }

    // Check if already in desired state
    if (currentQuote.Status === status) {
      logger.info('Quote already has target status', { quoteId, status });
      return currentQuote;
    }

    // Simple update with minimal payload
    const updatePayload = {
      Quotes: [{
        QuoteID: quoteId,
        Contact: {
          ContactID: currentQuote.Contact.ContactID
        },
        Date: currentQuote.Date,
        LineItems: currentQuote.LineItems.map(item => ({
          Description: item.Description
        })),
        Status: status
      }]
    };

    const response = await axios.post(`https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`, updatePayload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    const updatedQuote = response.data?.Quotes?.[0];
    if (!updatedQuote) {
      throw new Error('Invalid response format from Xero API');
    }
    
    logger.info('Quote status update completed', {
      quoteId,
      oldStatus: currentQuote.Status,
      newStatus: updatedQuote.Status
    });

    return updatedQuote;
  } catch (error) {
    logger.error('Error updating Xero quote status', {
      quoteId,
      status,
      error: error.message,
      response: error.response?.data
    });
    
    if (error.response?.data?.Elements) {
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
    logger.info('Creating Xero project', {
      projectName: projectPayload.Name,
      contactId: projectPayload.ContactId,
      estimateAmount: projectPayload.EstimateAmount,
      tenantId
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
    
    logger.info('Xero project creation response received', {
      status: response.status,
      hasData: !!response.data
    });

    if (!response.data) {
      throw new Error('No data received from Xero API');
    }

    // Ensure we have a consistent project ID in the response
    const project = response.data;
    if (!project) {
      throw new Error('Invalid project data received from Xero API');
    }

    logger.debug('Processing project data', {
      projectKeys: Object.keys(project),
      hasProjectID: !!project.ProjectID,
      hasProjectId: !!project.projectId,
      hasId: !!project.id
    });

    // Check for project ID in various possible locations
    if (project.ProjectID) {
      project.projectId = project.ProjectID;
    } else if (project.projectId) {
      project.ProjectID = project.projectId;
    } else if (project.id) {
      project.ProjectID = project.id;
      project.projectId = project.id;
    } else if (project.projectNumber) {
      project.ProjectID = project.projectNumber;
      project.projectId = project.projectNumber;
    } else {
      logger.error('Project response missing ID', {
        availableFields: Object.keys(project),
        projectData: project
      });
      throw new Error('Project ID not found in Xero API response');
    }
    
    logger.info('Xero project created successfully', {
      ProjectID: project.ProjectID,
      Name: project.Name
    });
    
    return project;
  } catch (error) {
    logger.error('Error creating Xero project', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    if (error.response) {
      throw {
        message: "Xero API error while creating project",
        details: error.response.data,
        status: error.response.status
      };
    } else if (error.request) {
      throw {
        message: "Network error while creating project",
        details: "No response received from Xero API"
      };
    } else {
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
    throw new Error('Project ID and task name are required.');
  }

  // Minimal JSON payload (using USD as the currency)
  const sanitizedName = name.trim().replace(/[^\w\s-]/g, '');
  if (!sanitizedName) {
    throw new Error('Task name is empty after sanitization.');
  }

  const taskPayload = {
    "name": sanitizedName,
    "rate": {
      "currency": "USD",
      "value": 1.00
    },
    "chargeType": "TIME",
    "estimateMinutes": 60
  };

  console.log("payload", taskPayload);

  const url = `https://api.xero.com/projects.xro/2.0/Projects/${projectId}/Tasks`;

  try {
    const response = await axios.post(
      url,
      taskPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    // If Xero returns a 400 with modelState, extract the first error message
    if (error.response?.data?.modelState) {
      const key = Object.keys(error.response.data.modelState)[0];
      const msgArray = error.response.data.modelState[key] || [];
      throw new Error(`Xero validation error: ${key} – ${msgArray.join(', ')}`);
    }

    // Other HTTP errors
    if (error.response) {
      const { status, data } = error.response;
      throw new Error(`Xero API error (${status}): ${JSON.stringify(data)}`);
    }

    // Network or unexpected errors
    throw new Error(`Unexpected error: ${error.message}`);
  }
};


/**
 * Retrieves all quotes from Xero
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {Object} options - Query options for filtering quotes
 * @returns {Promise<Array>} Array of quote objects
 * @throws {Error} When quote retrieval fails
 */
export const getXeroQuotes = async (accessToken, tenantId, options = {}) => {
  try {
    logger.debug('Retrieving Xero quotes', {
      tenantId,
      options
    });

    let url = 'https://api.xero.com/api.xro/2.0/Quotes';
    
    // Add query parameters if provided
    if (options.where) {
      url += `?where=${encodeURIComponent(options.where)}`;
    }
    if (options.page) {
      url += `${options.where ? '&' : '?'}page=${options.page}`;
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      Accept: 'application/json',
    };

    const response = await axios.get(url, { headers });
    
    const quotes = response.data.Quotes || [];
    
    logger.debug('Retrieved Xero quotes', {
      quotesCount: quotes.length,
      quotesFound: quotes.map(q => q.QuoteNumber)
    });

    return quotes;
  } catch (error) {
    logger.error('Error retrieving Xero quotes', {
      error: error.response ? error.response.data : error.message,
      status: error.response?.status
    });
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
    logger.debug('Finding Xero quote by number', {
      quoteNumber,
      tenantId
    });

    const quotes = await getXeroQuotes(accessToken, tenantId, {
      where: `QuoteNumber="${quoteNumber}"`
    });
    
    logger.debug('Quote search completed', {
      quoteNumber,
      quotesFound: quotes.length
    });

    const foundQuote = quotes.find(quote => quote.QuoteNumber === quoteNumber);
    
    if (foundQuote) {
      logger.debug('Quote found', {
        QuoteNumber: foundQuote.QuoteNumber,
        QuoteID: foundQuote.QuoteID,
        Status: foundQuote.Status
      });
    } else {
      logger.debug('Quote not found', { quoteNumber });
    }

    return foundQuote || null;
  } catch (error) {
    logger.error('Error finding Xero quote by number', {
      quoteNumber,
      error: error.message,
      response: error.response?.data
    });
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
    logger.error('Error retrieving Xero projects', {
      error: error.response ? error.response.data : error.message,
      status: error.response?.status
    });
    throw error;
  }
};

/**
 * Updates an existing quote in Xero
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} quoteId - Xero quote ID to update
 * @param {Object} quotePayload - Quote data to update
 * @returns {Promise<Object>} Updated quote object
 * @throws {Error} When quote update fails or validation errors occur
 */
export const updateQuote = async (accessToken, tenantId, quoteId, quotePayload) => {
  try {
    logger.info('Updating Xero quote', {
      quoteId,
      lineItemsCount: quotePayload.LineItems ? quotePayload.LineItems.length : 0
    });

    const response = await axios.post(
      `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`,
      { Quotes: [quotePayload] },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );
    
    if (response.data.Quotes && response.data.Quotes.length > 0) {
      const updatedQuote = response.data.Quotes[0];
      logger.info('Successfully updated Xero quote', {
        QuoteID: updatedQuote.QuoteID,
        QuoteNumber: updatedQuote.QuoteNumber,
        Status: updatedQuote.Status,
        Total: updatedQuote.Total,
        lineItemsCount: updatedQuote.LineItems ? updatedQuote.LineItems.length : 0
      });
      return updatedQuote;
    } else {
      throw new Error('No quote returned from Xero API');
    }
  } catch (error) {
    logger.error('Error updating Xero quote', {
      quoteId,
      error: error.response ? error.response.data : error.message,
      status: error.response?.status
    });
    
    if (error.response && error.response.data && error.response.data.Elements) {
      const validationErrors = error.response.data.Elements[0].ValidationErrors;
      if (validationErrors && validationErrors.length > 0) {
        throw new Error(`Quote validation failed: ${validationErrors.map(v => v.Message).join(', ')}`);
      }
    }
    
    throw error;
  }
};
