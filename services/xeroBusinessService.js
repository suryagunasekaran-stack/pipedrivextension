/**
 * Xero Business Service
 * 
 * This service consolidates all Xero-related business logic that was previously
 * duplicated between controllers and helpers. It provides a single source of truth
 * for complex Xero workflows including quote management, contact handling, and
 * project creation.
 * 
 * @module services/xeroBusinessService
 */

import * as xeroApiService from './xeroApiService.js';
import * as pipedriveApiService from './pipedriveApiService.js';
import * as tokenService from './secureTokenService.js';
import logger from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Finds or creates a Xero contact based on deal information
 * Consolidates logic from both xeroController and projectHelpers
 * 
 * @param {Object} auth - Authentication details {xeroAccessToken, xeroTenantId}
 * @param {Object} dealDetails - Pipedrive deal details
 * @param {Object} pipedriveAuth - Pipedrive authentication {apiDomain, accessToken}
 * @returns {Promise<string>} Xero contact ID
 * @throws {Error} When contact creation fails
 */
export async function findOrCreateXeroContact(auth, dealDetails, pipedriveAuth) {
    logger.info('Finding or creating Xero contact', {
        dealId: dealDetails.id,
        hasOrgId: !!(dealDetails.org_id?.value),
        hasPersonId: !!(dealDetails.person_id?.value)
    });

    // Validate organization association
    if (!dealDetails.org_id?.value) {
        throw new Error('Deal must be associated with an organization for Xero contact creation');
    }

    // Fetch organization details
    const orgDetails = await pipedriveApiService.getOrganizationDetails(
        pipedriveAuth.apiDomain,
        pipedriveAuth.accessToken,
        dealDetails.org_id.value
    );

    if (!orgDetails || !orgDetails.name) {
        throw new Error('Organization must have a name for Xero contact creation');
    }

    const contactName = orgDetails.name;

    // Check if contact exists
    let existingContact = await xeroApiService.findXeroContactByName(
        auth.xeroAccessToken,
        auth.xeroTenantId,
        contactName
    );

    if (existingContact) {
        logger.info('Found existing Xero contact', {
            contactId: existingContact.ContactID,
            contactName: existingContact.Name
        });
        return existingContact.ContactID;
    }

    // Get contact email if available
    let contactEmail = null;
    if (dealDetails.person_id?.value) {
        const personDetails = await pipedriveApiService.getPersonDetails(
            pipedriveAuth.apiDomain,
            pipedriveAuth.accessToken,
            dealDetails.person_id.value
        );
        
        if (personDetails?.email?.length > 0) {
            const primaryEmail = personDetails.email.find(e => e.primary);
            contactEmail = primaryEmail ? primaryEmail.value : personDetails.email[0].value;
        }
    }

    // Create new contact
    logger.info('Creating new Xero contact', {
        contactName,
        hasEmail: !!contactEmail,
        hasAddress: !!orgDetails.address
    });

    const contactPayload = {
        Name: contactName,
        ...(contactEmail && { EmailAddress: contactEmail }),
        ...(orgDetails.address && { 
            Addresses: [{
                AddressType: 'POBOX',
                AddressLine1: orgDetails.address,
                City: orgDetails.address_locality || '',
                PostalCode: orgDetails.address_postal_code || '',
                Country: orgDetails.address_country || ''
            }]
        })
    };

    const newContact = await xeroApiService.createXeroContact(
        auth.xeroAccessToken,
        auth.xeroTenantId,
        contactPayload
    );

    logger.info('Xero contact created successfully', {
        contactId: newContact.ContactID,
        contactName: newContact.Name
    });

    return newContact.ContactID;
}

/**
 * Accepts a Xero quote with comprehensive business logic
 * Handles DRAFT → SENT → ACCEPTED progression automatically
 * 
 * @param {Object} auth - Authentication details {xeroAccessToken, xeroTenantId}
 * @param {string} quoteId - Xero quote ID to accept
 * @param {Object} context - Additional context {dealId, companyId} for logging
 * @returns {Promise<Object>} Acceptance result with quote details
 */
export async function acceptQuoteWithBusinessRules(auth, quoteId, context = {}) {
    try {
        logger.info('Starting quote acceptance with business rules', {
            quoteId,
            dealId: context.dealId,
            companyId: context.companyId
        });

        // Use the API service to accept the quote
        const acceptedQuote = await xeroApiService.acceptXeroQuote(
            auth.xeroAccessToken,
            auth.xeroTenantId,
            quoteId
        );

        return {
            accepted: true,
            quoteId: acceptedQuote.QuoteID,
            quoteNumber: acceptedQuote.QuoteNumber,
            status: acceptedQuote.Status,
            error: null
        };

    } catch (error) {
        logger.error('Failed to accept quote with business rules', {
            quoteId,
            error: error.message,
            context
        });

        // Handle specific error cases
        if (error.message.includes('already accepted')) {
            return {
                accepted: true,
                alreadyAccepted: true,
                quoteId,
                error: null
            };
        }

        return {
            accepted: false,
            quoteId,
            error: error.message,
            details: error.response?.data,
            statusCode: error.response?.status
        };
    }
}

/**
 * Creates a Xero project from a Pipedrive deal with all related entities
 * Consolidates project creation, task creation, and quote acceptance
 * 
 * @param {Object} auth - Authentication details {xeroAccessToken, xeroTenantId}
 * @param {Object} dealDetails - Pipedrive deal details
 * @param {string} projectNumber - Generated project number
 * @param {Object} options - Additional options {dealId, companyId, pipedriveAuth}
 * @returns {Promise<Object>} Project creation result with tasks and quote status
 */
export async function createProjectFromDeal(auth, dealDetails, projectNumber, options = {}) {
    const { dealId, companyId, pipedriveAuth } = options;

    logger.info('Creating Xero project from deal', {
        dealId,
        projectNumber,
        dealTitle: dealDetails.title
    });

    try {
        // Step 1: Find or create contact
        const contactId = await findOrCreateXeroContact(auth, dealDetails, pipedriveAuth);

        if (!contactId) {
            return {
                projectCreated: false,
                message: 'Could not create or find Xero contact for project creation'
            };
        }

        // Step 2: Get deal products for project
        const dealProducts = await pipedriveApiService.getDealProducts(
            pipedriveAuth.apiDomain,
            pipedriveAuth.accessToken,
            dealId
        );

        // Step 3: Create project
        const vesselNameKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME;
        const vesselName = vesselNameKey ? dealDetails[vesselNameKey] : 'Unknown Vessel';
        
        const projectData = {
            contactId: contactId,
            name: `${projectNumber} - ${vesselName}`,
            estimateAmount: dealDetails.value || null,
            deadline: dealDetails.expected_close_date || null
        };

        const xeroProject = await xeroApiService.createXeroProject(
            auth.xeroAccessToken,
            auth.xeroTenantId,
            projectData,
            null, // quoteId
            dealId,
            companyId
        );

        if (!xeroProject || (!xeroProject.ProjectID && !xeroProject.projectId)) {
            throw new Error('Failed to create Xero project - no project ID returned');
        }

        const projectId = xeroProject.ProjectID || xeroProject.projectId;

        // Step 4: Create default tasks
        const createdTasks = await createDefaultProjectTasks(auth, projectId);

        // Step 5: Handle quote acceptance if quote ID exists
        let quoteAcceptanceResult = await handleQuoteAcceptanceForProject(
            auth, 
            dealDetails, 
            dealId
        );

        return {
            projectCreated: true,
            projectId,
            projectName: projectData.name,
            tasks: createdTasks,
            quote: quoteAcceptanceResult
        };

    } catch (error) {
        logger.error('Error creating project from deal', {
            dealId,
            projectNumber,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Creates default tasks for a Xero project
 * 
 * @param {Object} auth - Authentication details
 * @param {string} projectId - Xero project ID
 * @returns {Promise<Array>} Array of created tasks
 */
async function createDefaultProjectTasks(auth, projectId) {
    const defaultTasks = [
        'Manhour',
        'Overtime',
        'Transport',
        'Supply Labour'
    ];

    logger.info('Starting parallel task creation for project', {
        projectId,
        taskCount: defaultTasks.length
    });

    // Create all tasks in parallel for better performance
    const taskPromises = defaultTasks.map(taskName => 
        xeroApiService.createXeroTask(
            auth.xeroAccessToken,
            auth.xeroTenantId,
            projectId,
            taskName
        )
        .then(task => {
            if (task && (task.TaskID || task.taskId)) {
                logger.info(`Task "${taskName}" created successfully`, {
                    taskId: task.TaskID || task.taskId
                });
                return task;
            }
            return null;
        })
        .catch(taskError => {
            logger.error(`Failed to create task "${taskName}"`, {
                projectId,
                taskName,
                error: taskError.message
            });
            return null;
        })
    );

    const taskResults = await Promise.all(taskPromises);
    const createdTasks = taskResults.filter(task => task !== null);

    logger.info('Task creation completed', {
        projectId,
        requestedTasks: defaultTasks.length,
        createdTasks: createdTasks.length,
        failedTasks: defaultTasks.length - createdTasks.length
    });

    return createdTasks;
}

/**
 * Handles quote acceptance for a project if quote ID exists in deal
 * 
 * @param {Object} auth - Authentication details
 * @param {Object} dealDetails - Deal details with custom fields
 * @param {string} dealId - Deal ID for context
 * @returns {Promise<Object>} Quote acceptance result
 */
async function handleQuoteAcceptanceForProject(auth, dealDetails, dealId) {
    const quoteIdCustomFieldKey = process.env.PIPEDRIVE_QUOTE_ID;
    
    if (!quoteIdCustomFieldKey) {
        logger.warn('PIPEDRIVE_QUOTE_ID not configured', { dealId });
        return {
            accepted: false,
            error: 'Quote ID custom field not configured'
        };
    }

    const xeroQuoteId = dealDetails[quoteIdCustomFieldKey];
    
    if (!xeroQuoteId) {
        logger.info('No Xero quote ID found in deal', {
            dealId,
            customFieldKey: quoteIdCustomFieldKey
        });
        return {
            accepted: false,
            error: 'No quote ID found in deal custom field'
        };
    }

    // Use the business service to accept the quote
    return await acceptQuoteWithBusinessRules(auth, xeroQuoteId, { dealId });
}

/**
 * Creates a quote with line items from deal products
 * 
 * @param {Object} auth - Authentication details
 * @param {Object} params - Quote parameters {dealDetails, contactId, lineItems, idempotencyKey}
 * @returns {Promise<Object>} Created quote
 */
export async function createQuoteFromDeal(auth, params) {
    const { dealDetails, contactId, lineItems, idempotencyKey, pipedriveDealReference } = params;

    logger.info('Creating quote from deal', {
        dealId: dealDetails.id,
        contactId,
        lineItemsCount: lineItems.length
    });

    // Build quote payload
    const quotePayload = {
        Contact: { ContactID: contactId },
        Date: new Date().toISOString().split('T')[0],
        ExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        LineItems: lineItems,
        Title: dealDetails.title || 'Quote',
        Status: 'SENT' // Will be created as DRAFT then updated to SENT
    };

    // Add custom fields if available
    const locationKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_LOCATION;
    const vesselNameKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME;
    
    if (locationKey && dealDetails[locationKey]) {
        quotePayload.Summary = `Location: ${dealDetails[locationKey]}`;
    }
    if (vesselNameKey && dealDetails[vesselNameKey]) {
        quotePayload.Summary = (quotePayload.Summary || '') + 
            `${quotePayload.Summary ? '\n' : ''}Vessel: ${dealDetails[vesselNameKey]}`;
    }

    // Create the quote
    const createdQuote = await xeroApiService.createQuote(
        auth.xeroAccessToken,
        auth.xeroTenantId,
        quotePayload,
        idempotencyKey,
        pipedriveDealReference
    );

    logger.info('Quote created successfully', {
        quoteId: createdQuote.QuoteID,
        quoteNumber: createdQuote.QuoteNumber,
        status: createdQuote.Status
    });

    return createdQuote;
}

/**
 * Updates a quote with versioning support
 * 
 * @param {Object} auth - Authentication details
 * @param {string} quoteId - Quote ID to update
 * @param {Object} updateData - Update payload
 * @param {Object} context - Additional context for logging
 * @returns {Promise<Object>} Updated quote with new version number
 */
export async function updateQuoteWithVersioning(auth, quoteId, updateData, context = {}) {
    logger.info('Updating quote with versioning', {
        quoteId,
        context
    });

    try {
        const updatedQuote = await xeroApiService.updateQuote(
            auth.xeroAccessToken,
            auth.xeroTenantId,
            quoteId,
            updateData
        );

        return {
            success: true,
            quote: updatedQuote,
            previousVersion: context.previousVersion,
            newVersion: updatedQuote.QuoteNumber
        };

    } catch (error) {
        logger.error('Failed to update quote with versioning', {
            quoteId,
            error: error.message,
            context
        });
        throw error;
    }
}

export default {
    findOrCreateXeroContact,
    acceptQuoteWithBusinessRules,
    createProjectFromDeal,
    createQuoteFromDeal,
    updateQuoteWithVersioning
}; 