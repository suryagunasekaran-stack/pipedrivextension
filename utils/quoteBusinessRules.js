import { validateLineItem, formatLineItem } from './quoteLineItemUtils';

/**
 * Validates if a quote can be created for a deal
 * @param {Object} deal - The Pipedrive deal object
 * @returns {boolean} - Whether quote creation is valid
 * @throws {Error} - If quote creation is not valid
 */
export function validateQuoteCreation(deal) {
  // Check for existing quote
  if (deal.custom_fields && 
      deal.custom_fields[process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY]) {
    throw new Error('Deal already has an associated quote');
  }

  // Check for products
  if (!deal.products || deal.products.length === 0) {
    throw new Error('Quote must have at least one product');
  }

  // Check for organization
  if (!deal.org_id || !deal.org_id.value) {
    throw new Error('Deal must be associated with an organization');
  }

  return true;
}

/**
 * Maps Pipedrive products to Xero line items
 * @param {Array} products - Array of Pipedrive products
 * @returns {Array} - Array of formatted Xero line items
 * @throws {Error} - If product data is invalid
 */
export function mapProductsToLineItems(products) {
  if (!products) {
    throw new Error('Products array is required');
  }
  
  if (!Array.isArray(products)) {
    throw new Error('Products must be an array');
  }

  return products.map(product => {
    // Validate required fields
    if (!product || !product.name || product.quantity === undefined || product.item_price === undefined) {
      throw new Error('Invalid product data');
    }
    // Support special_price override
    const unitAmount = product.special_price !== undefined ? product.special_price : product.item_price;
    // Support discount_rate (legacy field)
    const discountRate = product.discount_rate !== undefined ? product.discount_rate : product.discountRate;
    // Build line item for formatting
    const lineItem = {
      description: product.name,
      quantity: product.quantity,
      unitAmount,
      accountCode: '200',
      taxType: 'NONE',
    };
    if (discountRate !== undefined) lineItem.discountRate = discountRate;
    if (product.discountAmount !== undefined) lineItem.discountAmount = product.discountAmount;
    if (product.product_id) {
      lineItem.tracking = [
        {
          Name: 'ProductID',
          Option: String(product.product_id)
        }
      ];
    }
    return formatLineItem(lineItem);
  });
}

/**
 * Validates a quote number format and uniqueness
 * @param {string} quoteNumber - The quote number to validate
 * @param {Array} existingQuoteNumbers - Array of existing quote numbers
 * @returns {boolean} - Whether the quote number is valid
 * @throws {Error} - If quote number is invalid or duplicate
 */
export function validateQuoteNumber(quoteNumber, existingQuoteNumbers = []) {
  if (!quoteNumber) {
    throw new Error('Quote number is required');
  }

  if (typeof quoteNumber !== 'string') {
    throw new Error('Quote number must be a string');
  }

  // Validate format: Q-YYYY-NNN
  const quoteNumberRegex = /^Q-\d{4}-\d{3}$/;
  
  if (!quoteNumberRegex.test(quoteNumber)) {
    throw new Error('Invalid quote number format');
  }

  // Check for duplicates if existing numbers provided
  if (existingQuoteNumbers && existingQuoteNumbers.includes(quoteNumber)) {
    throw new Error('Quote number already exists');
  }

  return true;
} 