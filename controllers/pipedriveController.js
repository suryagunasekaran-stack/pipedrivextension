/**
 * @fileoverview Pipedrive integration controller handling deal actions and data retrieval.
 * Manages authentication state, token refresh, and redirects to frontend applications
 * based on user actions within Pipedrive (createProject, createQuote).
 */

import 'dotenv/config';
import * as tokenService from '../services/secureTokenService.js';
import * as pipedriveApiService from '../services/pipedriveApiService.js';
import { logSuccess, logWarning, logProcessing } from '../middleware/routeLogger.js';
import { validateDealForProject } from '../utils/projectBusinessRules.js';

const pipedriveClientId = process.env.CLIENT_ID;
const pipedriveClientSecret = process.env.CLIENT_SECRET;

/**
 * Handles Pipedrive app actions by validating authentication and redirecting to the appropriate frontend.
 * Determines the UI action (createProject or createQuote) and constructs the redirect URL with parameters.
 * Now uses authentication middleware for token management.
 * 
 * @param {Object} req - Express request object with query parameters (selectedIds, companyId, uiAction, resource)
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Redirects to frontend application or returns error response
 * @throws {Error} Returns 400 for missing parameters, 500 for config errors
 */
export const handlePipedriveAction = async (req, res) => {
    const dealId = req.query.selectedIds;
    const companyId = req.query.companyId;
    const uiAction = req.query.uiAction;

    logProcessing(req, 'Validating input parameters', { 
        dealId, 
        companyId, 
        uiAction, 
        resource: req.query.resource 
    });

    if (!companyId) {
        logWarning(req, 'Company ID missing in Pipedrive request');
        return res.status(400).send('Company ID is missing in the request from Pipedrive.');
    }

    // Authentication is handled by middleware, tokens are available in req.pipedriveAuth
    const { apiDomain } = req.pipedriveAuth;
    
    logProcessing(req, 'Retrieved authentication data', { 
        hasApiDomain: !!apiDomain,
        authSource: 'middleware'
    });

    if (!dealId && req.query.resource === 'deal') {
        logWarning(req, 'Deal ID missing for deal resource', { resource: req.query.resource });
        return res.status(400).send('Deal ID (from selectedIds) is missing for a deal resource.');
    } else if (!dealId && req.query.resource) {
        logWarning(req, 'Required ID missing for resource', { resource: req.query.resource });
        return res.status(400).send('Required ID (selectedIds) is missing for the resource.');
    }

    if (!apiDomain) {
        logWarning(req, 'API domain configuration missing', { companyId });
        return res.status(500).send('API domain configuration missing for your company. Please re-authenticate.');
    }

    let frontendRedirectUrl;
    const baseFrontendUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:3001';

    if (uiAction === 'createProject') {
        frontendRedirectUrl = `${baseFrontendUrl}/create-project-page`;
    } else if (uiAction === 'updateQuotation') {
        frontendRedirectUrl = `${baseFrontendUrl}/update-quotation-page`;
    } else if (uiAction === 'createInvoice') {
        frontendRedirectUrl = `${baseFrontendUrl}/create-invoice-page`;
    } else {
        frontendRedirectUrl = `${baseFrontendUrl}/pipedrive-data-view`;
    }

    logProcessing(req, 'Determined redirect URL', { 
        uiAction, 
        baseFrontendUrl, 
        redirectUrl: frontendRedirectUrl 
    });

    if (dealId && companyId) {
        const redirectUrl = `${frontendRedirectUrl}?dealId=${dealId}&companyId=${companyId}&uiAction=${uiAction || 'createQuote'}`;
        logSuccess(req, 'Redirecting to frontend with deal and company', { 
            dealId, 
            companyId, 
            uiAction: uiAction || 'createQuote',
            finalRedirectUrl: redirectUrl
        });
        return res.redirect(redirectUrl);
    } else if (companyId) {
        const redirectUrl = `${frontendRedirectUrl}?companyId=${companyId}&uiAction=${uiAction || 'createQuote'}`;
        logSuccess(req, 'Redirecting to frontend with company only', { 
            companyId, 
            uiAction: uiAction || 'createQuote',
            finalRedirectUrl: redirectUrl
        });
        return res.redirect(redirectUrl);
    } else {
        logWarning(req, 'Cannot redirect - missing critical parameters');
        return res.status(400).send('Cannot redirect: Missing critical parameters (dealId or companyId).');
    }
};

/**
 * Creates a project by fetching deal details and custom fields from Pipedrive.
 * Extracts department, vessel name, location, and sales representative information
 * for project initialization. Now uses authentication middleware.
 * 
 * @param {Object} req - Express request object with body containing dealId and companyId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with deal details and custom fields or error response
 * @throws {Error} Returns 400 for missing params, 404 for deal not found, 500 for API errors
 */
export const createProject = async (req, res) => {
    const { dealId, companyId } = req.body;

    logProcessing(req, 'Validating required parameters', { 
        dealId: !!dealId, 
        companyId: !!companyId 
    });

    if (!dealId || !companyId) {
        logWarning(req, 'Missing required parameters', { dealId: !!dealId, companyId: !!companyId });
        return res.status(400).json({ error: 'Deal ID and Company ID are required in the request body.' });
    }

    // Authentication handled by middleware - tokens available in req.pipedriveAuth
    const { accessToken, apiDomain } = req.pipedriveAuth;
    
    logProcessing(req, 'Retrieved authentication tokens', { 
        hasAccessToken: !!accessToken,
        hasApiDomain: !!apiDomain 
    });
    
    const xeroQuoteCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
    const vesselNameKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME;
    const salesInChargeKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_SALES_IN_CHARGE;
    const locationKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_LOCATION;
    const departmentKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT;

    logProcessing(req, 'Environment configuration loaded', {
        hasXeroQuoteKey: !!xeroQuoteCustomFieldKey,
        hasVesselNameKey: !!vesselNameKey,
        hasSalesInChargeKey: !!salesInChargeKey,
        hasLocationKey: !!locationKey,
        hasDepartmentKey: !!departmentKey
    });

    if (!xeroQuoteCustomFieldKey) {
        logWarning(req, 'PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY not configured');
    }

    try {
        logProcessing(req, 'Fetching deal details from Pipedrive', { dealId, apiDomain });
        
        const dealDetails = await pipedriveApiService.getDealDetails(apiDomain, accessToken, dealId);

        if (!dealDetails) {
            logWarning(req, 'Deal not found', { dealId });
            return res.status(404).json({ error: `Deal with ID ${dealId} not found.` });
        }

        logProcessing(req, 'Deal details retrieved', {
            dealTitle: dealDetails.title,
            dealValue: dealDetails.value,
            hasPersonId: !!(dealDetails.person_id && dealDetails.person_id.value),
            hasOrgId: !!(dealDetails.org_id && dealDetails.org_id.value)
        });

        // Validate deal for project creation using business rules
        try {
            validateDealForProject(dealDetails);
        } catch (validationError) {
            logWarning(req, 'Deal validation failed', {
                dealId,
                error: validationError.message
            });
            return res.status(400).json({ 
                error: validationError.message,
                validationFailure: true
            });
        }

        const xeroQuoteNumber = xeroQuoteCustomFieldKey ? (dealDetails[xeroQuoteCustomFieldKey] || null) : null;

        const frontendDealObject = { ...dealDetails };

        // Add custom fields to the deal object
        const customFieldsAdded = {};
        if (departmentKey) {
            frontendDealObject.department = dealDetails[departmentKey] || null;
            customFieldsAdded.department = !!frontendDealObject.department;
        }
        if (vesselNameKey) {
            frontendDealObject.vessel_name = dealDetails[vesselNameKey] || null;
            customFieldsAdded.vesselName = !!frontendDealObject.vessel_name;
        }
        if (locationKey) {
            frontendDealObject.location = dealDetails[locationKey] || null;
            customFieldsAdded.location = !!frontendDealObject.location;
        }
        if (salesInChargeKey) {
            frontendDealObject.sales_in_charge = dealDetails[salesInChargeKey] || null;
            customFieldsAdded.salesInCharge = !!frontendDealObject.sales_in_charge;
        }

        logProcessing(req, 'Custom fields processed', customFieldsAdded);

        const responseData = {
            message: 'Project creation initiated (simulated). Fetched deal details and custom fields.',
            deal: frontendDealObject,
            xeroQuoteNumber: xeroQuoteNumber
        };

        logSuccess(req, 'Deal details and custom fields retrieved successfully', { 
            dealId,
            hasXeroQuote: !!xeroQuoteNumber,
            customFields: customFieldsAdded,
            responseSize: JSON.stringify(responseData).length
        });

        res.json(responseData);

    } catch (error) {
        // Error will be handled by the error middleware with proper logging
        throw new Error(`Failed to process project creation: ${error.message}`);
    }
};

/**
 * Prepares invoice creation by fetching deal details and quote information from Pipedrive.
 * Validates deal has associated quote and returns necessary data for invoice creation.
 * Now uses authentication middleware.
 * 
 * @param {Object} req - Express request object with body containing dealId and companyId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with deal details, quote info, and validation status
 * @throws {Error} Returns 400 for missing params, 404 for deal not found, 500 for API errors
 */
export const createInvoice = async (req, res) => {
    const { dealId, companyId } = req.body;

    logProcessing(req, 'Validating required parameters for invoice creation', { 
        dealId: !!dealId, 
        companyId: !!companyId 
    });

    if (!dealId || !companyId) {
        logWarning(req, 'Missing required parameters', { dealId: !!dealId, companyId: !!companyId });
        return res.status(400).json({ error: 'Deal ID and Company ID are required in the request body.' });
    }

    // Authentication handled by middleware - tokens available in req.pipedriveAuth
    const { accessToken, apiDomain } = req.pipedriveAuth;
    
    logProcessing(req, 'Retrieved authentication tokens', { 
        hasAccessToken: !!accessToken,
        hasApiDomain: !!apiDomain 
    });
    
    const xeroQuoteCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
    const invoiceCustomFieldKey = process.env.PIPEDRIVE_INVOICENUMBER;
    const xeroQuoteIdKey = process.env.PIPEDRIVE_QUOTE_ID;

    logProcessing(req, 'Environment configuration loaded', {
        hasXeroQuoteKey: !!xeroQuoteCustomFieldKey,
        hasInvoiceCustomFieldKey: !!invoiceCustomFieldKey,
        hasXeroQuoteIdKey: !!xeroQuoteIdKey
    });

    if (!xeroQuoteCustomFieldKey) {
        logWarning(req, 'PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY not configured');
    }

    try {
        logProcessing(req, 'Fetching deal details from Pipedrive', { dealId, apiDomain });
        
        const dealDetails = await pipedriveApiService.getDealDetails(apiDomain, accessToken, dealId);

        if (!dealDetails) {
            logWarning(req, 'Deal not found', { dealId });
            return res.status(404).json({ error: `Deal with ID ${dealId} not found.` });
        }

        logProcessing(req, 'Deal details retrieved', {
            dealTitle: dealDetails.title,
            dealValue: dealDetails.value,
            hasPersonId: !!(dealDetails.person_id && dealDetails.person_id.value),
            hasOrgId: !!(dealDetails.org_id && dealDetails.org_id.value)
        });

        // Get quote information
        const xeroQuoteNumber = xeroQuoteCustomFieldKey ? (dealDetails[xeroQuoteCustomFieldKey] || null) : null;
        const xeroQuoteId = xeroQuoteIdKey ? (dealDetails[xeroQuoteIdKey] || null) : null;
        const existingInvoiceNumber = invoiceCustomFieldKey ? (dealDetails[invoiceCustomFieldKey] || null) : null;

        // Validate deal has quote
        if (!xeroQuoteNumber && !xeroQuoteId) {
            logWarning(req, 'Deal has no associated quote', { dealId });
            return res.status(400).json({ 
                error: 'Deal does not have an associated quote. Please create a quote first.',
                validationFailure: true
            });
        }

        // Check if invoice already exists
        if (existingInvoiceNumber) {
            logWarning(req, 'Deal already has an invoice', { dealId, existingInvoiceNumber });
            return res.status(400).json({ 
                error: `Deal already has an associated invoice: ${existingInvoiceNumber}`,
                validationFailure: true
            });
        }

        const frontendDealObject = { ...dealDetails };

        // Add quote and invoice information
        frontendDealObject.xero_quote_number = xeroQuoteNumber;
        frontendDealObject.xero_quote_id = xeroQuoteId;
        frontendDealObject.existing_invoice_number = existingInvoiceNumber;

        const responseData = {
            message: 'Invoice creation initiated. Deal details and quote information retrieved.',
            deal: frontendDealObject,
            xeroQuoteNumber: xeroQuoteNumber,
            xeroQuoteId: xeroQuoteId,
            canCreateInvoice: !!xeroQuoteNumber || !!xeroQuoteId,
            hasExistingInvoice: !!existingInvoiceNumber
        };

        logSuccess(req, 'Deal details and quote information retrieved successfully', { 
            dealId,
            hasXeroQuoteNumber: !!xeroQuoteNumber,
            hasXeroQuoteId: !!xeroQuoteId,
            hasExistingInvoice: !!existingInvoiceNumber,
            canCreateInvoice: responseData.canCreateInvoice,
            responseSize: JSON.stringify(responseData).length
        });

        res.json(responseData);

    } catch (error) {
        // Error will be handled by the error middleware with proper logging
        throw new Error(`Failed to process invoice creation preparation: ${error.message}`);
    }
};

/**
 * Retrieves comprehensive Pipedrive data for a specific deal including deal details,
 * associated person, organization, and products.
 * Now uses authentication middleware.
 * 
 * @param {Object} req - Express request object with query parameters (dealId, companyId)
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with deal, person, organization, and products data
 * @throws {Error} Returns 400 for missing params, 500 for API errors
 */
export const getPipedriveData = async (req, res) => {
    const { dealId, companyId } = req.query;

    logProcessing(req, 'Validating query parameters', { 
        dealId: !!dealId, 
        companyId: !!companyId 
    });

    if (!dealId || !companyId) {
        logWarning(req, 'Missing required query parameters', { dealId: !!dealId, companyId: !!companyId });
        return res.status(400).json({ error: 'Deal ID and Company ID are required.' });
    }

    // Authentication handled by middleware - tokens available in req.pipedriveAuth
    const { accessToken, apiDomain } = req.pipedriveAuth;

    logProcessing(req, 'Starting comprehensive Pipedrive data retrieval', { dealId, apiDomain });

    try {
        // Fetch deal details
        logProcessing(req, 'Fetching deal details', { dealId });
        const dealDetails = await pipedriveApiService.getDealDetails(apiDomain, accessToken, dealId);
        
        logProcessing(req, 'Deal details retrieved', {
            dealTitle: dealDetails.title,
            hasPersonId: !!(dealDetails.person_id && dealDetails.person_id.value),
            hasOrgId: !!(dealDetails.org_id && dealDetails.org_id.value)
        });
        
        // Fetch person details if available
        let personDetails = null;
        if (dealDetails.person_id && dealDetails.person_id.value) {
            try {
                logProcessing(req, 'Fetching person details', { personId: dealDetails.person_id.value });
                personDetails = await pipedriveApiService.getPersonDetails(apiDomain, accessToken, dealDetails.person_id.value);
                logProcessing(req, 'Person details retrieved', { 
                    personName: personDetails?.name,
                    hasEmail: !!(personDetails?.email && personDetails.email.length > 0)
                });
            } catch (error) {
                logWarning(req, 'Could not fetch person details', { 
                    personId: dealDetails.person_id.value,
                    error: error.message 
                });
            }
        }
        
        // Fetch organization details if available
        let orgDetails = null;
        if (dealDetails.org_id && dealDetails.org_id.value) {
            try {
                logProcessing(req, 'Fetching organization details', { orgId: dealDetails.org_id.value });
                orgDetails = await pipedriveApiService.getOrganizationDetails(apiDomain, accessToken, dealDetails.org_id.value);
                logProcessing(req, 'Organization details retrieved', { 
                    orgName: orgDetails?.name,
                    hasAddress: !!orgDetails?.address
                });
            } catch (error) {
                logWarning(req, 'Could not fetch organization details', { 
                    orgId: dealDetails.org_id.value,
                    error: error.message 
                });
            }
        }
        
        // Fetch deal products
        let dealProducts = [];
        try {
            logProcessing(req, 'Fetching deal products', { dealId });
            dealProducts = await pipedriveApiService.getDealProducts(apiDomain, accessToken, dealId);
            logProcessing(req, 'Deal products retrieved', { 
                productsCount: dealProducts.length,
                totalValue: dealProducts.reduce((sum, p) => sum + (p.item_price * p.quantity || 0), 0)
            });
        } catch (error) {
            logWarning(req, 'Could not fetch deal products', { 
                dealId,
                error: error.message 
            });
        }

        const responseData = {
            deal: dealDetails,
            person: personDetails,
            organization: orgDetails,
            products: dealProducts
        };

        logSuccess(req, 'Comprehensive Pipedrive data retrieved successfully', { 
            dealId,
            hasPerson: !!personDetails,
            hasOrganization: !!orgDetails,
            productsCount: dealProducts.length,
            responseSize: JSON.stringify(responseData).length
        });

        res.json(responseData);
    } catch (error) {
        // Error will be handled by the error middleware with proper logging
        throw new Error(`Failed to fetch Pipedrive data: ${error.message}`);
    }
};

/**
 * Gets quotation data for updating by fetching deal details, existing quotation information,
 * and Xero quotation data for comparison. Extracts quotation number from custom fields and 
 * provides comprehensive data needed for frontend comparison and updates.
 * Uses both Pipedrive and Xero authentication middleware.
 * 
 * @param {Object} req - Express request object with body containing dealId and companyId
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with deal details, quotation info, Xero data, and comparison metadata
 * @throws {Error} Returns 400 for missing params, 404 for deal not found, 500 for API errors
 */
export const getQuotationData = async (req, res) => {
    const { dealId, companyId } = req.body;

    logProcessing(req, 'Validating required parameters for quotation data', { 
        dealId: !!dealId, 
        companyId: !!companyId 
    });

    if (!dealId || !companyId) {
        logWarning(req, 'Missing required parameters', { dealId: !!dealId, companyId: !!companyId });
        return res.status(400).json({ error: 'Deal ID and Company ID are required in the request body.' });
    }

    // Authentication handled by middleware - tokens available in req.pipedriveAuth and req.xeroAuth
    const { accessToken, apiDomain } = req.pipedriveAuth;
    const { accessToken: xeroAccessToken, tenantId: xeroTenantId } = req.xeroAuth;
    
    logProcessing(req, 'Retrieved authentication tokens for quotation data', { 
        hasAccessToken: !!accessToken,
        hasApiDomain: !!apiDomain,
        hasXeroAccessToken: !!xeroAccessToken,
        hasXeroTenantId: !!xeroTenantId
    });
    
    const xeroQuoteCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
    const vesselNameKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME;
    const salesInChargeKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_SALES_IN_CHARGE;
    const locationKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_LOCATION;
    const departmentKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT;

    logProcessing(req, 'Environment configuration loaded for quotation', {
        hasXeroQuoteKey: !!xeroQuoteCustomFieldKey,
        hasVesselNameKey: !!vesselNameKey,
        hasSalesInChargeKey: !!salesInChargeKey,
        hasLocationKey: !!locationKey,
        hasDepartmentKey: !!departmentKey
    });

    if (!xeroQuoteCustomFieldKey) {
        logWarning(req, 'PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY not configured');
    }

    try {
        logProcessing(req, 'Fetching deal details for quotation update', { dealId, apiDomain });
        
        const dealDetails = await pipedriveApiService.getDealDetails(apiDomain, accessToken, dealId);

        if (!dealDetails) {
            logWarning(req, 'Deal not found for quotation update', { dealId });
            return res.status(404).json({ error: `Deal with ID ${dealId} not found.` });
        }

        logProcessing(req, 'Deal details retrieved for quotation', {
            dealTitle: dealDetails.title,
            dealValue: dealDetails.value,
            hasPersonId: !!(dealDetails.person_id && dealDetails.person_id.value),
            hasOrgId: !!(dealDetails.org_id && dealDetails.org_id.value)
        });

        const xeroQuoteNumber = xeroQuoteCustomFieldKey ? (dealDetails[xeroQuoteCustomFieldKey] || null) : null;

        const frontendDealObject = { ...dealDetails };

        // Add custom fields to the deal object
        const customFieldsAdded = {};
        
        if (vesselNameKey && dealDetails[vesselNameKey]) {
            frontendDealObject.vesselName = dealDetails[vesselNameKey];
            customFieldsAdded.vesselName = dealDetails[vesselNameKey];
        }
        
        if (salesInChargeKey && dealDetails[salesInChargeKey]) {
            frontendDealObject.salesInCharge = dealDetails[salesInChargeKey];
            customFieldsAdded.salesInCharge = dealDetails[salesInChargeKey];
        }
        
        if (locationKey && dealDetails[locationKey]) {
            frontendDealObject.location = dealDetails[locationKey];
            customFieldsAdded.location = dealDetails[locationKey];
        }
        
        if (departmentKey && dealDetails[departmentKey]) {
            frontendDealObject.department = dealDetails[departmentKey];
            customFieldsAdded.department = dealDetails[departmentKey];
        }

        // Add quotation-specific information
        if (xeroQuoteNumber) {
            frontendDealObject.quotationNumber = xeroQuoteNumber;
            customFieldsAdded.quotationNumber = xeroQuoteNumber;
        }

        logProcessing(req, 'Custom fields added to deal object for quotation', customFieldsAdded);

        // Fetch additional data for quotation context
        let personDetails = null;
        let organizationDetails = null;
        let dealProducts = [];

        // Fetch person details if available
        if (dealDetails.person_id && dealDetails.person_id.value) {
            try {
                logProcessing(req, 'Fetching person details for quotation', { personId: dealDetails.person_id.value });
                personDetails = await pipedriveApiService.getPersonDetails(apiDomain, accessToken, dealDetails.person_id.value);
            } catch (personError) {
                logWarning(req, 'Could not fetch person details for quotation', { 
                    personId: dealDetails.person_id.value, 
                    error: personError.message 
                });
            }
        }

        // Fetch organization details if available
        if (dealDetails.org_id && dealDetails.org_id.value) {
            try {
                logProcessing(req, 'Fetching organization details for quotation', { orgId: dealDetails.org_id.value });
                organizationDetails = await pipedriveApiService.getOrganizationDetails(apiDomain, accessToken, dealDetails.org_id.value);
            } catch (orgError) {
                logWarning(req, 'Could not fetch organization details for quotation', { 
                    orgId: dealDetails.org_id.value, 
                    error: orgError.message 
                });
            }
        }

        // Fetch deal products for quotation line items
        try {
            logProcessing(req, 'Fetching deal products for quotation', { dealId });
            dealProducts = await pipedriveApiService.getDealProducts(apiDomain, accessToken, dealId);
            logProcessing(req, 'Deal products retrieved for quotation', { productsCount: dealProducts.length });
        } catch (productsError) {
            logWarning(req, 'Could not fetch deal products for quotation', { 
                dealId, 
                error: productsError.message 
            });
        }

        // Fetch existing Xero quotation if quotation number exists
        let xeroQuotation = null;
        let comparisonData = null;
        
        if (xeroQuoteNumber) {
            try {
                logProcessing(req, 'Fetching existing Xero quotation', { quotationNumber: xeroQuoteNumber });
                
                // Import xeroApiService to fetch the quotation
                const xeroApiService = await import('../services/xeroApiService.js');
                const xeroQuote = await xeroApiService.findXeroQuoteByNumber(xeroAccessToken, xeroTenantId, xeroQuoteNumber);
                
                if (xeroQuote) {
                    xeroQuotation = {
                        quoteId: xeroQuote.QuoteID,
                        quoteNumber: xeroQuote.QuoteNumber,
                        status: xeroQuote.Status,
                        lineItems: xeroQuote.LineItems || [],
                        subTotal: xeroQuote.SubTotal || 0,
                        totalTax: xeroQuote.TotalTax || 0,
                        total: xeroQuote.Total || 0,
                        contact: xeroQuote.Contact || null,
                        date: xeroQuote.Date || null
                    };
                    
                    // Prepare comparison data
                    comparisonData = {
                        canUpdate: xeroQuote.Status === 'DRAFT',
                        pipedriveProductCount: dealProducts.length,
                        xeroLineItemCount: xeroQuote.LineItems ? xeroQuote.LineItems.length : 0,
                        statusWarning: xeroQuote.Status !== 'DRAFT' ? `Quote is in ${xeroQuote.Status} status and cannot be updated` : null
                    };
                    
                    logProcessing(req, 'Xero quotation retrieved successfully', {
                        quoteId: xeroQuote.QuoteID,
                        status: xeroQuote.Status,
                        lineItemsCount: xeroQuote.LineItems ? xeroQuote.LineItems.length : 0,
                        canUpdate: comparisonData.canUpdate
                    });
                } else {
                    logWarning(req, 'Xero quotation not found', { quotationNumber: xeroQuoteNumber });
                    comparisonData = {
                        canUpdate: false,
                        pipedriveProductCount: dealProducts.length,
                        xeroLineItemCount: 0,
                        statusWarning: `Quotation ${xeroQuoteNumber} not found in Xero`
                    };
                }
            } catch (xeroError) {
                logWarning(req, 'Error fetching Xero quotation', {
                    quotationNumber: xeroQuoteNumber,
                    error: xeroError.message
                });
                comparisonData = {
                    canUpdate: false,
                    pipedriveProductCount: dealProducts.length,
                    xeroLineItemCount: 0,
                    statusWarning: `Error fetching quotation from Xero: ${xeroError.message}`
                };
            }
        } else {
            comparisonData = {
                canUpdate: false,
                pipedriveProductCount: dealProducts.length,
                xeroLineItemCount: 0,
                statusWarning: 'No quotation number found in deal'
            };
        }

        const responseData = {
            deal: frontendDealObject,
            quotationNumber: xeroQuoteNumber,
            person: personDetails,
            organization: organizationDetails,
            products: dealProducts,
            xeroQuotation: xeroQuotation,
            comparison: comparisonData,
            metadata: {
                dealId: dealId,
                companyId: companyId,
                customFieldsExtracted: Object.keys(customFieldsAdded),
                hasQuotationNumber: !!xeroQuoteNumber,
                hasXeroQuotation: !!xeroQuotation,
                productsCount: dealProducts.length,
                canUpdate: comparisonData ? comparisonData.canUpdate : false
            }
        };

        logSuccess(req, 'Quotation data prepared successfully', {
            dealId,
            dealTitle: dealDetails.title,
            hasQuotationNumber: !!xeroQuoteNumber,
            quotationNumber: xeroQuoteNumber,
            hasPersonDetails: !!personDetails,
            hasOrgDetails: !!organizationDetails,
            productsCount: dealProducts.length,
            hasXeroQuotation: !!xeroQuotation,
            xeroQuotationStatus: xeroQuotation ? xeroQuotation.status : null,
            canUpdate: comparisonData ? comparisonData.canUpdate : false
        });

        res.json(responseData);

    } catch (error) {
        logWarning(req, 'Error fetching quotation data', {
            dealId,
            error: error.message,
            stack: error.stack
        });

        if (error.response && error.response.status === 404) {
            return res.status(404).json({ error: `Deal with ID ${dealId} not found in Pipedrive.` });
        }

        res.status(500).json({ 
            error: 'Failed to fetch quotation data from Pipedrive',
            details: error.message
        });
    }
};
