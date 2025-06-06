/**
 * Update Quotation on Xero - Business Logic
 * 
 * This module contains the core business logic for updating Xero quotations
 * with Pipedrive deal data. It follows TDD principles where tests are written
 * first and then the implementation follows.
 * 
 * @module utils/updateQuotationBusinessLogic
 */

import * as pipedriveApiService from '../services/pipedriveApiService.js';
import * as xeroApiService from '../services/xeroApiService.js';
import logger from '../lib/logger.js';

/**
 * Updates a quotation on Xero using Pipedrive deal data
 * 
 * @param {string} pipedriveApiDomain - Pipedrive API domain
 * @param {string} pipedriveAccessToken - Pipedrive access token
 * @param {string} xeroAccessToken - Xero access token
 * @param {string} xeroTenantId - Xero tenant ID
 * @param {number|string} dealId - Pipedrive deal ID
 * @returns {Promise<Object>} Result object with success status and details
 * @throws {Error} When validation fails or API calls fail
 */
export async function updateQuotationOnXero(pipedriveApiDomain, pipedriveAccessToken, xeroAccessToken, xeroTenantId, dealId) {
    // Input validation
    validateInputParameters(pipedriveApiDomain, pipedriveAccessToken, xeroAccessToken, xeroTenantId, dealId);
    
    try {
        // Step 1: Fetch deal details from Pipedrive
        logger.info('Fetching deal details from Pipedrive', { dealId });
        const dealData = await pipedriveApiService.getDealDetails(pipedriveApiDomain, pipedriveAccessToken, dealId);
        
        // Step 2: Extract quotation number from deal custom fields
        const quotationNumber = extractQuotationNumber(dealData);
        logger.info('Extracted quotation number from deal', { dealId, quotationNumber });
        
        // Step 3: Fetch deal products from Pipedrive
        logger.info('Fetching deal products from Pipedrive', { dealId });
        const dealProducts = await pipedriveApiService.getDealProducts(pipedriveApiDomain, pipedriveAccessToken, dealId);
        
        // Step 4: Find the quotation in Xero
        logger.info('Finding quotation in Xero', { quotationNumber });
        const xeroQuote = await xeroApiService.findXeroQuoteByNumber(xeroAccessToken, xeroTenantId, quotationNumber);
        
        if (!xeroQuote) {
            throw new Error(`Quotation ${quotationNumber} not found in Xero`);
        }
        
        // Step 5: Validate quotation status (must be DRAFT)
        validateQuotationStatus(xeroQuote, quotationNumber);
        
        // Step 6: Transform Pipedrive products to Xero line items
        const lineItems = transformProductsToLineItems(dealProducts);
        logger.info('Transformed products to line items', { productCount: dealProducts.length, lineItemCount: lineItems.length });
        
        // Step 7: Update the quotation in Xero
        logger.info('Updating quotation in Xero', { quoteId: xeroQuote.QuoteID });
        const updatedQuote = await updateXeroQuote(xeroAccessToken, xeroTenantId, xeroQuote.QuoteID, lineItems);
        
        // Step 8: Return success result
        const totalAmount = calculateTotalAmount(lineItems);
        
        return {
            success: true,
            message: lineItems.length === 0 ? 'Quotation updated successfully (no products)' : 'Quotation updated successfully',
            quoteId: xeroQuote.QuoteID,
            quoteNumber: quotationNumber,
            updatedLineItems: lineItems.length,
            totalAmount: totalAmount
        };
        
    } catch (error) {
        logger.error('Error updating quotation on Xero', { dealId, error: error.message });
        throw error;
    }
}

/**
 * Validates input parameters for the updateQuotationOnXero function
 * 
 * @param {string} pipedriveApiDomain - Pipedrive API domain
 * @param {string} pipedriveAccessToken - Pipedrive access token
 * @param {string} xeroAccessToken - Xero access token
 * @param {string} xeroTenantId - Xero tenant ID
 * @param {number|string} dealId - Pipedrive deal ID
 * @throws {Error} When any parameter is invalid
 */
function validateInputParameters(pipedriveApiDomain, pipedriveAccessToken, xeroAccessToken, xeroTenantId, dealId) {
    if (!pipedriveApiDomain) {
        throw new Error('Pipedrive API domain is required');
    }
    
    if (!pipedriveAccessToken) {
        throw new Error('Pipedrive access token is required');
    }
    
    if (!xeroAccessToken) {
        throw new Error('Xero access token is required');
    }
    
    if (!xeroTenantId) {
        throw new Error('Xero tenant ID is required');
    }
    
    if (dealId === null || dealId === undefined || dealId === '') {
        throw new Error('Deal ID is required');
    }
    
    // Validate deal ID format
    const dealIdNumber = Number(dealId);
    if (isNaN(dealIdNumber)) {
        throw new Error('Deal ID must be a valid number');
    }
    
    if (dealIdNumber <= 0) {
        throw new Error('Deal ID must be a positive number');
    }
}

/**
 * Extracts quotation number from Pipedrive deal custom fields
 * 
 * @param {Object} dealData - Pipedrive deal data
 * @returns {string} Quotation number
 * @throws {Error} When quotation number is not found
 */
function extractQuotationNumber(dealData) {
    const quotationCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY || 'quotation_number';
    
    if (!dealData.custom_fields || !dealData.custom_fields[quotationCustomFieldKey]) {
        throw new Error('No quotation number found in deal custom fields');
    }
    
    const quotationNumber = dealData.custom_fields[quotationCustomFieldKey];
    
    if (!quotationNumber || typeof quotationNumber !== 'string' || quotationNumber.trim() === '') {
        throw new Error('Invalid quotation number in deal custom fields');
    }
    
    return quotationNumber.trim();
}

/**
 * Validates that the quotation is in DRAFT status and can be updated
 * 
 * @param {Object} xeroQuote - Xero quote object
 * @param {string} quotationNumber - Quotation number for error messages
 * @throws {Error} When quotation is not in DRAFT status
 */
function validateQuotationStatus(xeroQuote, quotationNumber) {
    if (xeroQuote.Status !== 'DRAFT') {
        throw new Error(`Quotation ${quotationNumber} is not in DRAFT status and cannot be updated`);
    }
}

/**
 * Transforms Pipedrive products to Xero line items
 * 
 * @param {Array} dealProducts - Array of Pipedrive products
 * @returns {Array} Array of Xero line items
 */
function transformProductsToLineItems(dealProducts) {
    if (!Array.isArray(dealProducts)) {
        return [];
    }
    
    return dealProducts
        .filter(product => {
            // Filter out products with zero or negative quantity
            return product && 
                   typeof product.quantity === 'number' && 
                   product.quantity > 0 &&
                   typeof product.unit_price === 'number' &&
                   product.name && 
                   product.name.trim() !== '';
        })
        .map(product => ({
            Description: product.name.trim(),
            Quantity: product.quantity,
            UnitAmount: Math.abs(product.unit_price), // Ensure positive unit amount
            LineAmount: product.quantity * Math.abs(product.unit_price),
            AccountCode: '200', // Default sales account
            TaxType: 'NONE'
        }));
}

/**
 * Updates a quote in Xero (wrapper function that may need to be implemented)
 * 
 * @param {string} xeroAccessToken - Xero access token
 * @param {string} xeroTenantId - Xero tenant ID
 * @param {string} quoteId - Xero quote ID
 * @param {Array} lineItems - Array of line items
 * @returns {Promise<Object>} Updated quote object
 */
async function updateXeroQuote(xeroAccessToken, xeroTenantId, quoteId, lineItems) {
    // Check if updateQuote function exists in xeroApiService
    if (typeof xeroApiService.updateQuote === 'function') {
        return await xeroApiService.updateQuote(xeroAccessToken, xeroTenantId, quoteId, { LineItems: lineItems });
    } else {
        // If updateQuote doesn't exist, we'll need to create it
        // For now, throw an error to indicate this needs to be implemented
        throw new Error('updateQuote function not implemented in xeroApiService');
    }
}

/**
 * Calculates total amount from line items
 * 
 * @param {Array} lineItems - Array of line items
 * @returns {number} Total amount
 */
function calculateTotalAmount(lineItems) {
    if (!Array.isArray(lineItems)) {
        return 0;
    }
    
    return lineItems.reduce((total, item) => {
        return total + (item.LineAmount || 0);
    }, 0);
}

/**
 * Validates quotation number format (utility function)
 * 
 * @param {string} quotationNumber - Quotation number to validate
 * @returns {boolean} True if valid format
 */
export function validateQuotationNumberFormat(quotationNumber) {
    if (!quotationNumber || typeof quotationNumber !== 'string') {
        return false;
    }
    
    // Basic format validation - you can adjust this regex based on your requirements
    const quotationNumberRegex = /^Q-\d{4}-\d{3}$/;
    return quotationNumberRegex.test(quotationNumber);
} 