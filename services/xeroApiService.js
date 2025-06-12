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

  // First create the quote as DRAFT (Xero's default behavior)
  const finalQuotePayload = {
    ...quotePayload,
    ...(pipedriveDealReference && { Reference: pipedriveDealReference })
    // Remove Status: 'SENT' - let Xero create as DRAFT first
  };

  try {
    // Step 1: Create quote as DRAFT
    logger.info('Creating Xero quote as DRAFT', {
      tenantId: tenantId.substring(0, 8) + '...',
      hasIdempotencyKey: !!idempotencyKey
    });

    const response = await axios.put(
      `https://api.xero.com/api.xro/2.0/Quotes`,
      { Quotes: [finalQuotePayload] },
      { headers }
    );

    const createdQuote = response.data.Quotes[0];
    
    if (!createdQuote || !createdQuote.QuoteID) {
      throw new Error('Failed to create quote - no quote ID returned');
    }

    logger.info('Quote created as DRAFT, now updating to SENT', {
      quoteId: createdQuote.QuoteID,
      quoteNumber: createdQuote.QuoteNumber,
      currentStatus: createdQuote.Status
    });

    // Step 2: Update quote status to SENT
    const updatePayload = {
      Quotes: [{
        QuoteNumber: createdQuote.QuoteNumber,
        Status: "SENT",
        Contact: {
          ContactID: createdQuote.Contact.ContactID
        },
        Date: createdQuote.Date
      }]
    };

    try {
      const updateResponse = await axios.post(
        `https://api.xero.com/api.xro/2.0/Quotes/${createdQuote.QuoteID}`,
        updatePayload,
        { headers }
      );

      const updatedQuote = updateResponse.data.Quotes[0];
      
      logger.info('Quote status updated to SENT', {
        quoteId: updatedQuote.QuoteID,
        quoteNumber: updatedQuote.QuoteNumber,
        finalStatus: updatedQuote.Status
      });

      return updatedQuote;
    } catch (updateError) {
      logger.error('Failed to update quote to SENT status, returning DRAFT quote', {
        quoteId: createdQuote.QuoteID,
        quoteNumber: createdQuote.QuoteNumber,
        updateError: updateError.response ? updateError.response.data : updateError.message,
        status: updateError.response?.status
      });
      
      // If update fails, return the original DRAFT quote rather than crashing
      logger.warn('Returning quote in DRAFT status due to update failure');
      return createdQuote;
    }
  } catch (error) {
    logger.error('Error creating Xero quote', {
      error: error.response ? error.response.data : error.message,
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
      payload: error.config?.data
    });
    
    if (error.response && error.response.data && error.response.data.Elements) {
        const validationErrors = error.response.data.Elements[0]?.ValidationErrors || [];
        const errorMessage = validationErrors.length > 0 
          ? validationErrors.map(v => v.Message).join(', ')
          : 'Quote validation failed';
        
        throw new Error(`Xero API validation error while creating quote: ${errorMessage}`);
    } else if (error.response?.status === 400) {
        throw new Error(`Xero API validation error (400): ${JSON.stringify(error.response.data)}`);
    } else if (error.response?.status === 401) {
        throw new Error('Xero authentication failed. Please check your access token.');
    } else if (error.response?.status === 403) {
        throw new Error('Access denied. Please check your Xero permissions.');
    }
    
    throw new Error(`Failed to create Xero quote: ${error.message}`);
  }
};

/**
 * Gets a single Xero quote by ID
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} quoteId - Xero quote ID
 * @returns {Promise<Object|null>} Quote object or null if not found
 * @throws {Error} When quote retrieval fails
 */
export const getXeroQuoteById = async (accessToken, tenantId, quoteId) => {
  try {
    logger.info('Retrieving Xero quote by ID', {
      quoteId,
      tenantId: tenantId.substring(0, 8) + '...'
    });

    const url = `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`;
    
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      Accept: 'application/json',
    };

    const response = await axios.get(url, { headers });
    
    logger.info('Xero quote retrieval response received', {
      quoteId,
      status: response.status,
      hasData: !!response.data,
      quotesInResponse: response.data?.Quotes?.length || 0
    });
    
    const quote = response.data?.Quotes?.[0] || null;
    
    if (quote) {
      logger.info('Quote retrieved successfully', {
        QuoteID: quote.QuoteID,
        QuoteNumber: quote.QuoteNumber,
        Status: quote.Status,
        ContactName: quote.Contact?.Name,
        Total: quote.Total
      });
    } else {
      logger.warn('Quote not found', { quoteId });
    }

    return quote;
  } catch (error) {
    logger.error('Error retrieving Xero quote by ID', {
      quoteId,
      error: error.response ? error.response.data : error.message,
      status: error.response?.status,
      url: error.config?.url
    });
    throw error;
  }
};

/**
 * Accepts a Xero quote by changing status to ACCEPTED using comprehensive field preservation
 * Handles automatic progression: DRAFT → SENT → ACCEPTED if needed
 * Preserves all existing quote data during status transitions
 * 
 * @param {string} accessToken - Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} quoteId - Quote ID to accept
 * @returns {Promise<Object>} Final accepted quote object
 */
export const acceptXeroQuote = async (accessToken, tenantId, quoteId) => {
  try {
    logger.info('Starting Xero quote acceptance process with comprehensive field preservation', {
      quoteId,
      operation: 'accept_quote_by_id'
    });

    // Get current quote details to preserve all existing data
    const currentQuote = await getXeroQuoteById(accessToken, tenantId, quoteId);
    
    if (!currentQuote) {
      throw new Error(`Quote with ID ${quoteId} not found in Xero`);
    }

    logger.info('Current quote status retrieved', {
      quoteId,
      currentStatus: currentQuote.Status,
      quoteNumber: currentQuote.QuoteNumber,
      contactId: currentQuote.Contact?.ContactID,
      hasCurrency: !!currentQuote.CurrencyCode,
      hasLineItems: !!(currentQuote.LineItems && currentQuote.LineItems.length > 0)
    });

    // If already accepted, log warning but return the quote
    if (currentQuote.Status === 'ACCEPTED') {
      logger.warn('Quote is already accepted, skipping update', { 
        quoteId,
        quoteNumber: currentQuote.QuoteNumber 
      });
      return currentQuote;
    }

    // Helper function to create comprehensive payload preserving all fields
    const createComprehensivePayload = (quote, newStatus) => {
      return {
        QuoteNumber: quote.QuoteNumber,
        Status: newStatus,
        Contact: {
          ContactID: quote.Contact.ContactID
        },
        Date: quote.Date,
        
        // Preserve all existing quote fields
        ...(quote.ExpiryDate && { ExpiryDate: quote.ExpiryDate }),
        ...(quote.CurrencyCode && { CurrencyCode: quote.CurrencyCode }),
        ...(quote.CurrencyRate && { CurrencyRate: quote.CurrencyRate }),
        ...(quote.SubTotal && { SubTotal: quote.SubTotal }),
        ...(quote.TotalTax && { TotalTax: quote.TotalTax }),
        ...(quote.Total && { Total: quote.Total }),
        ...(quote.Title && { Title: quote.Title }),
        ...(quote.Summary && { Summary: quote.Summary }),
        ...(quote.Terms && { Terms: quote.Terms }),
        ...(quote.Reference && { Reference: quote.Reference }),
        ...(quote.BrandingThemeID && { BrandingThemeID: quote.BrandingThemeID }),
        
        // Preserve line items with all their fields
        ...(quote.LineItems && { 
          LineItems: quote.LineItems.map(item => ({
            Description: item.Description,
            Quantity: item.Quantity,
            UnitAmount: item.UnitAmount,
            ...(item.LineAmount && { LineAmount: item.LineAmount }),
            ...(item.AccountCode && { AccountCode: item.AccountCode }),
            ...(item.TaxType && { TaxType: item.TaxType }),
            ...(item.DiscountRate && { DiscountRate: item.DiscountRate }),
            ...(item.DiscountAmount && { DiscountAmount: item.DiscountAmount }),
            ...(item.Tracking && { Tracking: item.Tracking }),
            ...(item.ItemCode && { ItemCode: item.ItemCode })
          }))
        })
      };
    };

    // Check if quote can be accepted (handle DRAFT → SENT → ACCEPTED flow)
    if (currentQuote.Status === 'DRAFT') {
      logger.info('Quote is in DRAFT status, will move to SENT first then ACCEPTED', {
        quoteId,
        quoteNumber: currentQuote.QuoteNumber,
        currentStatus: currentQuote.Status
      });
      
      // Step 2a: First move from DRAFT to SENT with comprehensive field preservation
      const sentPayload = {
        Quotes: [createComprehensivePayload(currentQuote, "SENT")]
      };

      logger.info('Moving quote from DRAFT to SENT with field preservation', {
        quoteId,
        quoteNumber: currentQuote.QuoteNumber,
        preservedFields: Object.keys(sentPayload.Quotes[0]).length
      });

      const sentResponse = await axios.post(
        `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`,
        sentPayload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      if (!sentResponse.data?.Quotes?.[0]) {
        throw new Error('Failed to update quote to SENT status');
      }

      const sentQuote = sentResponse.data.Quotes[0];
      logger.info('Quote successfully moved to SENT status', {
        quoteId,
        quoteNumber: sentQuote.QuoteNumber,
        status: sentQuote.Status,
        preservedCurrency: sentQuote.CurrencyCode,
        preservedLineItems: sentQuote.LineItems?.length || 0
      });

      // Update currentQuote reference for the acceptance step
      Object.assign(currentQuote, sentQuote);
      
    } else if (currentQuote.Status !== 'SENT') {
      throw new Error(`Cannot accept quote ${quoteId}. Quote must be in DRAFT or SENT status but is currently ${currentQuote.Status}`);
    }

    // Step 3: Move from SENT to ACCEPTED (final step) with comprehensive field preservation
    const acceptancePayload = {
      Quotes: [createComprehensivePayload(currentQuote, "ACCEPTED")]
    };

    logger.info('Sending final quote acceptance request (SENT → ACCEPTED) with field preservation', {
      quoteId,
      contactId: currentQuote.Contact.ContactID,
      currentStatus: currentQuote.Status,
      newStatus: 'ACCEPTED',
      preservedFields: Object.keys(acceptancePayload.Quotes[0]).length
    });

    // Send acceptance request to Xero
    const updateUrl = `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const response = await axios.post(updateUrl, acceptancePayload, { headers });
    
    if (!response.data?.Quotes?.[0]) {
      throw new Error('Failed to update quote to ACCEPTED status - invalid response from Xero');
    }
    
    const acceptedQuote = response.data.Quotes[0];
    
    logger.info('Quote acceptance completed successfully with field preservation', {
      quoteId,
      finalStatus: acceptedQuote.Status,
      quoteNumber: acceptedQuote.QuoteNumber,
      preservedCurrency: acceptedQuote.CurrencyCode,
      preservedLineItems: acceptedQuote.LineItems?.length || 0,
      preservedTotal: acceptedQuote.Total
    });

    return acceptedQuote;

  } catch (error) {
    logger.error('Error accepting Xero quote', {
      quoteId,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
      operation: 'accept_quote_by_id'
    });
    
    // Enhanced error messages
    if (error.response?.status === 404) {
      throw new Error(`Quote ${quoteId} not found in Xero. Please verify the quote ID exists.`);
    } else if (error.response?.status === 400 && error.response?.data?.Elements) {
      const validationErrors = error.response.data.Elements[0]?.ValidationErrors || [];
      const errorMessage = validationErrors.length > 0 
        ? validationErrors.map(v => v.Message).join(', ')
        : 'Quote validation failed';
      throw new Error(`Xero API validation error while accepting quote ${quoteId}: ${errorMessage}`);
    } else if (error.response?.status === 403) {
      throw new Error(`Access denied when trying to accept quote ${quoteId}. Please check Xero permissions.`);
    } else if (error.message.includes('not found')) {
      throw error; // Re-throw our custom "not found" messages
    } else if (error.message.includes('Cannot accept quote')) {
      throw error; // Re-throw our custom status validation messages
    }
    
    throw new Error(`Failed to accept Xero quote ${quoteId}: ${error.message}`);
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
    "chargeType": "FIXED",
    "estimateMinutes": 1
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
    logger.info('Retrieving Xero quotes', {
      tenantId,
      options
    });

    let url = 'https://api.xero.com/api.xro/2.0/Quotes';
    const queryParams = [];
    
    // Add query parameters if provided
    if (options.quoteNumber) {
      queryParams.push(`QuoteNumber=${encodeURIComponent(options.quoteNumber)}`);
    }
    if (options.page) {
      queryParams.push(`page=${options.page}`);
    }
    if (options.where) {
      queryParams.push(`where=${encodeURIComponent(options.where)}`);
    }
    
    if (queryParams.length > 0) {
      url += `?${queryParams.join('&')}`;
    }

    logger.info('Making Xero API request', {
      url,
      tenantId: tenantId.substring(0, 8) + '...'
    });

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      Accept: 'application/json',
    };

    const response = await axios.get(url, { headers });
    
    logger.info('Xero API response received', {
      status: response.status,
      hasData: !!response.data,
      quotesInResponse: response.data?.Quotes?.length || 0
    });
    
    const quotes = response.data.Quotes || [];
    
    logger.info('Retrieved Xero quotes', {
      quotesCount: quotes.length,
      quotesFound: quotes.map(q => ({
        QuoteNumber: q.QuoteNumber,
        Status: q.Status,
        QuoteID: q.QuoteID
      }))
    });

    return quotes;
  } catch (error) {
    logger.error('Error retrieving Xero quotes', {
      error: error.response ? error.response.data : error.message,
      status: error.response?.status,
      url: error.config?.url
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
    logger.info('Finding Xero quote by number', {
      quoteNumber,
      tenantId: tenantId.substring(0, 8) + '...'
    });

    // Use the correct Xero API query parameter format
    const quotes = await getXeroQuotes(accessToken, tenantId, {
      quoteNumber: quoteNumber
    });
    
    logger.info('Quote search completed', {
      quoteNumber,
      quotesFound: quotes.length,
      allQuoteNumbers: quotes.map(q => q.QuoteNumber)
    });

    const foundQuote = quotes.find(quote => quote.QuoteNumber === quoteNumber);
    
    if (foundQuote) {
      logger.info('Quote found', {
        QuoteNumber: foundQuote.QuoteNumber,
        QuoteID: foundQuote.QuoteID,
        Status: foundQuote.Status,
        ContactName: foundQuote.Contact?.Name,
        Total: foundQuote.Total
      });
    } else {
      logger.warn('Quote not found', { 
        quoteNumber,
        availableQuotes: quotes.map(q => q.QuoteNumber)
      });
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
 * Updates an existing quote in Xero with versioning support
 * Automatically increments the version (v2, v3, etc.) when updating
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
    logger.info('Updating Xero quote with versioning', {
      quoteId,
      updateFields: Object.keys(quotePayload),
      lineItemsCount: quotePayload.LineItems ? quotePayload.LineItems.length : 0
    });

    // Step 1: Get current quote details to preserve all existing data
    const currentQuote = await getXeroQuoteById(accessToken, tenantId, quoteId);
    
    if (!currentQuote) {
      throw new Error(`Quote with ID ${quoteId} not found`);
    }

    const currentQuoteNumber = currentQuote.QuoteNumber;
    logger.info('Current quote details retrieved', {
      quoteId,
      currentQuoteNumber,
      currentStatus: currentQuote.Status,
      hasCurrency: !!currentQuote.CurrencyCode,
      hasLineItems: !!(currentQuote.LineItems && currentQuote.LineItems.length > 0)
    });

    // Step 2: Generate versioned quote number
    const versionedQuoteNumber = generateVersionedQuoteNumber(currentQuoteNumber);
    
    logger.info('Generated versioned quote number', {
      originalNumber: currentQuoteNumber,
      versionedNumber: versionedQuoteNumber
    });

    // Step 3: Merge the current quote data with new payload
    // Start with all existing quote data to preserve everything
    const updatePayload = {
      // Core fields that must be present
      QuoteNumber: versionedQuoteNumber,
      Contact: {
        ContactID: currentQuote.Contact.ContactID
      },
      Date: currentQuote.Date,
      
      // Preserve all existing quote fields
      ...(currentQuote.ExpiryDate && { ExpiryDate: currentQuote.ExpiryDate }),
      ...(currentQuote.Status && { Status: currentQuote.Status }),
      ...(currentQuote.CurrencyCode && { CurrencyCode: currentQuote.CurrencyCode }),
      ...(currentQuote.CurrencyRate && { CurrencyRate: currentQuote.CurrencyRate }),
      ...(currentQuote.SubTotal && { SubTotal: currentQuote.SubTotal }),
      ...(currentQuote.TotalTax && { TotalTax: currentQuote.TotalTax }),
      ...(currentQuote.Total && { Total: currentQuote.Total }),
      ...(currentQuote.Title && { Title: currentQuote.Title }),
      ...(currentQuote.Summary && { Summary: currentQuote.Summary }),
      ...(currentQuote.Terms && { Terms: currentQuote.Terms }),
      ...(currentQuote.Reference && { Reference: currentQuote.Reference }),
      ...(currentQuote.BrandingThemeID && { BrandingThemeID: currentQuote.BrandingThemeID }),
      
      // Include LineItems from current quote if not being updated
      ...(currentQuote.LineItems && !quotePayload.LineItems && { LineItems: currentQuote.LineItems }),
      
      // Now override with any fields from the update payload
      ...quotePayload
    };

    logger.info('Merged update payload prepared', {
      preservedFields: Object.keys(updatePayload).filter(key => currentQuote[key] !== undefined),
      updatedFields: Object.keys(quotePayload),
      hasLineItems: !!updatePayload.LineItems,
      lineItemsCount: updatePayload.LineItems ? updatePayload.LineItems.length : 0
    });

    const response = await axios.post(
      `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`,
      { Quotes: [updatePayload] },
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
      logger.info('Successfully updated Xero quote with versioning', {
        QuoteID: updatedQuote.QuoteID,
        QuoteNumber: updatedQuote.QuoteNumber,
        Status: updatedQuote.Status,
        Total: updatedQuote.Total,
        CurrencyCode: updatedQuote.CurrencyCode,
        lineItemsCount: updatedQuote.LineItems ? updatedQuote.LineItems.length : 0,
        originalNumber: currentQuoteNumber,
        versionedNumber: updatedQuote.QuoteNumber
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

/**
 * Generates a versioned quote number by incrementing the version suffix
 * Examples: 
 * - "QU-0032" -> "QU-0032 v2"
 * - "QU-0032 v2" -> "QU-0032 v3" 
 * - "QU-0032 v5" -> "QU-0032 v6"
 * 
 * @param {string} currentQuoteNumber - Current quote number
 * @returns {string} Versioned quote number
 */
function generateVersionedQuoteNumber(currentQuoteNumber) {
  if (!currentQuoteNumber) {
    throw new Error('Current quote number is required for versioning');
  }

  // Check if the quote number already has a version suffix (e.g., " v2", " v3")
  const versionRegex = /^(.+)\s+v(\d+)$/;
  const match = currentQuoteNumber.match(versionRegex);
  
  if (match) {
    // Quote already has a version, increment it
    const baseNumber = match[1];        // e.g., "QU-0032"
    const currentVersion = parseInt(match[2], 10); // e.g., 2
    const nextVersion = currentVersion + 1;        // e.g., 3
    
    return `${baseNumber} v${nextVersion}`;       // e.g., "QU-0032 v3"
  } else {
    // Quote doesn't have a version, add v2
    return `${currentQuoteNumber} v2`;            // e.g., "QU-0032 v2"
  }
}

/**
 * Creates an invoice from an existing quote in Xero
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} quoteId - Xero quote ID to convert to invoice
 * @returns {Promise<Object>} Created invoice object
 * @throws {Error} When invoice creation fails or validation errors occur
 */
export const createInvoiceFromQuote = async (accessToken, tenantId, quoteId) => {
  try {
    logger.info('Creating invoice from Xero quote', {
      quoteId,
      tenantId
    });

    // First, get the quote details to extract the necessary information
    const quoteResponse = await axios.get(
      `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          Accept: 'application/json',
        },
      }
    );

    if (!quoteResponse.data.Quotes || quoteResponse.data.Quotes.length === 0) {
      throw new Error('Quote not found or inaccessible');
    }

    const quote = quoteResponse.data.Quotes[0];
    
    logger.debug('Retrieved quote details for invoice creation', {
      QuoteID: quote.QuoteID,
      QuoteNumber: quote.QuoteNumber,
      Status: quote.Status,
      ContactID: quote.Contact?.ContactID,
      LineItemsCount: quote.LineItems?.length || 0
    });

    // Create invoice payload based on the quote
    const invoicePayload = {
      Type: 'ACCREC', // Accounts Receivable (Sales Invoice)
      Contact: {
        ContactID: quote.Contact.ContactID
      },
      Date: new Date().toISOString().split('T')[0], // Today's date
      DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from today
      LineItems: quote.LineItems.map(item => ({
        Description: item.Description,
        Quantity: item.Quantity,
        UnitAmount: item.UnitAmount,
        AccountCode: item.AccountCode || '200', // Default sales account
        TaxType: item.TaxType || 'NONE',
        ...(item.Tracking && { Tracking: item.Tracking })
      })),
      Status: 'DRAFT',
      Reference: `Quote: ${quote.QuoteNumber}`, // Reference to the original quote
      ...(quote.CurrencyCode && { CurrencyCode: quote.CurrencyCode })
    };

    logger.debug('Prepared invoice payload', {
      Type: invoicePayload.Type,
      ContactID: invoicePayload.Contact.ContactID,
      LineItemsCount: invoicePayload.LineItems.length,
      Status: invoicePayload.Status,
      Reference: invoicePayload.Reference
    });

    // Create the invoice
    const response = await axios.put(
      'https://api.xero.com/api.xro/2.0/Invoices',
      { Invoices: [invoicePayload] },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    if (response.data.Invoices && response.data.Invoices.length > 0) {
      const createdInvoice = response.data.Invoices[0];
      
      logger.info('Successfully created invoice from quote', {
        InvoiceID: createdInvoice.InvoiceID,
        InvoiceNumber: createdInvoice.InvoiceNumber,
        Status: createdInvoice.Status,
        Total: createdInvoice.Total,
        OriginalQuoteID: quoteId,
        OriginalQuoteNumber: quote.QuoteNumber
      });
      
      return createdInvoice;
    } else {
      throw new Error('No invoice returned from Xero API');
    }
  } catch (error) {
    logger.error('Error creating invoice from quote', {
      quoteId,
      error: error.response ? error.response.data : error.message,
      status: error.response?.status
    });
    
    if (error.response && error.response.data && error.response.data.Elements) {
      const validationErrors = error.response.data.Elements[0].ValidationErrors;
      if (validationErrors && validationErrors.length > 0) {
        throw new Error(`Invoice creation validation failed: ${validationErrors.map(v => v.Message).join(', ')}`);
      }
    }
    
    throw error;
  }
};

/**
 * Creates a new invoice in Xero
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {Object} invoicePayload - Invoice data to create
 * @returns {Promise<Object>} Created invoice object
 * @throws {Error} When invoice creation fails or validation errors occur
 */
export const createInvoice = async (accessToken, tenantId, invoicePayload) => {
  try {
    logger.info('Creating Xero invoice', {
      contactId: invoicePayload.Contact?.ContactID,
      lineItemsCount: invoicePayload.LineItems?.length || 0
    });

    const response = await axios.put(
      'https://api.xero.com/api.xro/2.0/Invoices',
      { Invoices: [invoicePayload] },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    if (response.data.Invoices && response.data.Invoices.length > 0) {
      const createdInvoice = response.data.Invoices[0];
      
      logger.info('Successfully created Xero invoice', {
        InvoiceID: createdInvoice.InvoiceID,
        InvoiceNumber: createdInvoice.InvoiceNumber,
        Status: createdInvoice.Status,
        Total: createdInvoice.Total,
        lineItemsCount: createdInvoice.LineItems?.length || 0
      });
      
      return createdInvoice;
    } else {
      throw new Error('No invoice returned from Xero API');
    }
  } catch (error) {
    logger.error('Error creating Xero invoice', {
      error: error.response ? error.response.data : error.message,
      status: error.response?.status
    });
    
    if (error.response && error.response.data && error.response.data.Elements) {
      const validationErrors = error.response.data.Elements[0].ValidationErrors;
      if (validationErrors && validationErrors.length > 0) {
        throw new Error(`Invoice creation validation failed: ${validationErrors.map(v => v.Message).join(', ')}`);
      }
    }
    
    throw error;
  }
};

/**
 * Uploads an attachment to a Xero invoice
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} invoiceId - Xero invoice ID to attach the file to
 * @param {Object} fileData - File information including path, originalname, and mimetype
 * @returns {Promise<Object>} Attachment response from Xero
 * @throws {Error} When attachment upload fails
 */
export const uploadInvoiceAttachment = async (accessToken, tenantId, invoiceId, fileData) => {
  try {
    const fs = await import('fs');
    
    logger.info('Uploading attachment to Xero invoice', {
      invoiceId,
      fileName: fileData.originalname,
      fileSize: fileData.size,
      mimeType: fileData.mimetype
    });

    // Read file as buffer
    const fileBuffer = fs.readFileSync(fileData.path);
    
    // Prepare form data
    const FormData = await import('form-data');
    const formData = new FormData.default();
    
    formData.append('File', fileBuffer, {
      filename: fileData.originalname,
      contentType: fileData.mimetype
    });

    const response = await axios.post(
      `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}/Attachments/${encodeURIComponent(fileData.originalname)}`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
        },
      }
    );

    logger.info('Successfully uploaded attachment to Xero invoice', {
      invoiceId,
      fileName: fileData.originalname,
      attachmentId: response.data?.Attachments?.[0]?.AttachmentID
    });

    return response.data;
  } catch (error) {
    logger.error('Error uploading attachment to Xero invoice', {
      invoiceId,
      fileName: fileData?.originalname,
      error: error.response ? error.response.data : error.message,
      status: error.response?.status
    });
    
    throw error;
  }
};

/**
 * Uploads multiple attachments to a Xero invoice
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} invoiceId - Xero invoice ID to attach the files to
 * @param {Array} filesData - Array of file information objects
 * @returns {Promise<Array>} Array of attachment responses from Xero
 * @throws {Error} When any attachment upload fails
 */
export const uploadMultipleInvoiceAttachments = async (accessToken, tenantId, invoiceId, filesData) => {
  try {
    logger.info('Uploading multiple attachments to Xero invoice', {
      invoiceId,
      fileCount: filesData.length,
      fileNames: filesData.map(f => f.originalname)
    });

    const uploadPromises = filesData.map(fileData => 
      uploadInvoiceAttachment(accessToken, tenantId, invoiceId, fileData)
    );

    const results = await Promise.allSettled(uploadPromises);
    
    const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed = results.filter(r => r.status === 'rejected').map(r => r.reason);

    if (failed.length > 0) {
      logger.warning('Some attachments failed to upload', {
        invoiceId,
        successfulCount: successful.length,
        failedCount: failed.length,
        failedReasons: failed.map(f => f.message)
      });
    }

    logger.info('Completed multiple attachment upload', {
      invoiceId,
      successfulCount: successful.length,
      failedCount: failed.length
    });

    return {
      successful,
      failed,
      totalCount: filesData.length,
      successCount: successful.length,
      failureCount: failed.length
    };
  } catch (error) {
    logger.error('Error uploading multiple attachments to Xero invoice', {
      invoiceId,
      fileCount: filesData?.length,
      error: error.message
    });
    
    throw error;
  }
};

/**
 * Deletes a Xero quote (for testing cleanup)
 * 
 * @param {string} accessToken - Valid Xero access token
 * @param {string} tenantId - Xero tenant ID
 * @param {string} quoteId - Xero quote ID to delete
 * @returns {Promise<Object>} Deleted quote object
 * @throws {Error} When quote deletion fails
 */
export const deleteXeroQuote = async (accessToken, tenantId, quoteId) => {
  try {
    logger.info('Deleting Xero quote for testing cleanup', {
      quoteId,
      tenantId: tenantId.substring(0, 8) + '...'
    });

    // First get the quote to return its details
    const quoteToDelete = await getXeroQuoteById(accessToken, tenantId, quoteId);
    
    if (!quoteToDelete) {
      throw new Error(`Quote with ID ${quoteId} not found`);
    }

    // Note: Xero API doesn't have a direct DELETE endpoint for quotes
    // Instead, we'll update the quote status to DELETED
    const deletePayload = {
      Quotes: [{
        QuoteNumber: quoteToDelete.QuoteNumber,
        Status: 'DELETED',
        Contact: {
          ContactID: quoteToDelete.Contact.ContactID
        },
        Date: quoteToDelete.Date
      }]
    };

    const response = await axios.post(
      `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`,
      deletePayload,
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
      const deletedQuote = response.data.Quotes[0];
      
      logger.info('Quote deleted successfully for testing cleanup', {
        QuoteID: deletedQuote.QuoteID,
        QuoteNumber: deletedQuote.QuoteNumber,
        Status: deletedQuote.Status,
        originalQuoteNumber: quoteToDelete.QuoteNumber
      });
      
      return deletedQuote;
    } else {
      throw new Error('No quote returned from Xero API after deletion');
    }
  } catch (error) {
    logger.error('Error deleting Xero quote', {
      quoteId,
      error: error.response ? error.response.data : error.message,
      status: error.response?.status
    });
    
    if (error.response && error.response.data && error.response.data.Elements) {
      const validationErrors = error.response.data.Elements[0]?.ValidationErrors || [];
      if (validationErrors.length > 0) {
        throw new Error(`Quote deletion failed: ${validationErrors.map(v => v.Message).join(', ')}`);
      }
    }
    
    throw error;
  }
};
