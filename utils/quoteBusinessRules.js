import { validateLineItem, formatLineItem } from './quoteLineItemUtils.js';

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
 * @param {Object} options - Optional configuration {defaultTaxType, defaultAccountCode}
 * @returns {Array} - Array of formatted Xero line items
 * @throws {Error} - If product data is invalid
 */
export function mapProductsToLineItems(products, options = {}) {
  if (!products) {
    throw new Error('Products array is required');
  }
  
  if (!Array.isArray(products)) {
    throw new Error('Products must be an array');
  }

  const {
    defaultTaxType = process.env.XERO_DEFAULT_TAX_TYPE || 'NONE',
    defaultAccountCode = process.env.XERO_DEFAULT_ACCOUNT_CODE || '200'
  } = options;

  return products.map(product => {
    // Validate required fields
    if (!product || !product.name || product.quantity === undefined || product.item_price === undefined) {
      throw new Error('Invalid product data');
    }
    // Support special_price override
    const unitAmount = product.special_price !== undefined ? product.special_price : product.item_price;
    // Support discount_rate (legacy field)
    const discountRate = product.discount_rate !== undefined ? product.discount_rate : product.discountRate;
    
    // Enhanced tax type determination with robust fallbacks
    let taxType = defaultTaxType;
    let taxRate = 0; // Default tax rate to 0 for safety
    
    if (product.tax !== undefined && product.tax !== null) {
      const productTaxRate = parseFloat(product.tax);
      
      // Validate tax rate is a number
      if (!isNaN(productTaxRate)) {
        taxRate = productTaxRate;
        
        // If tax is 0 or negative, use tax-free type
        if (productTaxRate <= 0) {
          taxType = 'NONE'; // Most compatible tax-free option
          taxRate = 0;
        } else {
          // Map positive tax rates to Xero tax types with fallback
          const mappedTaxType = mapTaxRateToXeroType(productTaxRate);
          if (mappedTaxType) {
            taxType = mappedTaxType;
          } else {
            // Fallback: use NONE for unknown tax rates and log warning
            console.warn(`Unknown tax rate ${productTaxRate}% for product ${product.name}, using NONE`);
            taxType = 'NONE';
            taxRate = 0; // Reset to 0 when falling back to NONE
          }
        }
      } else {
        // Invalid tax value, use safe defaults
        console.warn(`Invalid tax value '${product.tax}' for product ${product.name}, using 0%`);
        taxType = 'NONE';
        taxRate = 0;
      }
    }
    
    // Build line item for formatting
    const lineItem = {
      description: product.name,
      quantity: product.quantity,
      unitAmount,
      accountCode: product.account_code || defaultAccountCode,
      taxType: taxType,
      taxRate: taxRate // Explicitly include tax rate for clarity
    };
    
    // Add optional fields
    if (discountRate !== undefined && !isNaN(parseFloat(discountRate))) {
      lineItem.discountRate = parseFloat(discountRate);
    }
    if (product.discountAmount !== undefined && !isNaN(parseFloat(product.discountAmount))) {
      lineItem.discountAmount = parseFloat(product.discountAmount);
    }
    if (product.unit) lineItem.unit = product.unit;
    
    // Add tracking for product ID and other metadata
    const tracking = [];
    if (product.product_id) {
      tracking.push({
        Name: 'ProductID',
        Option: String(product.product_id)
      });
    }
    if (product.product_code) {
      lineItem.itemCode = product.product_code;
    }
    
    if (tracking.length > 0) {
      lineItem.tracking = tracking;
    }
    
    return formatLineItem(lineItem);
  });
}

/**
 * Maps tax rate percentage to Xero tax type
 * This should be customized based on your Xero configuration
 * @param {number} taxRate - Tax rate percentage
 * @returns {string|null} - Xero tax type or null
 */
function mapTaxRateToXeroType(taxRate) {
  // Ensure we're working with a number
  const rate = parseFloat(taxRate);
  if (isNaN(rate)) {
    return null;
  }
  
  // Round to nearest 0.1 to handle minor floating point differences
  const roundedRate = Math.round(rate * 10) / 10;
  
  // Comprehensive tax mappings - adjust based on your Xero configuration
  const taxMappings = {
    // Common GST rates
    '0': 'NONE',           // No tax
    '5': 'OUTPUT',         // 5% GST
    '7.5': 'OUTPUT',       // 7.5% GST
    '10': 'OUTPUT',        // 10% GST (Australia, New Zealand)
    '12.5': 'OUTPUT',      // 12.5% GST
    '15': 'OUTPUT',        // 15% GST (New Zealand, South Africa)
    
    // Common VAT rates
    '16': 'OUTPUT',        // 16% VAT
    '17.5': 'OUTPUT',      // 17.5% VAT (UK historical)
    '18': 'OUTPUT',        // 18% VAT
    '19': 'OUTPUT',        // 19% VAT (Germany)
    '20': 'OUTPUT',        // 20% VAT (UK, EU)
    '21': 'OUTPUT',        // 21% VAT (Netherlands, Belgium)
    '22': 'OUTPUT',        // 22% VAT
    '23': 'OUTPUT',        // 23% VAT (Ireland)
    '24': 'OUTPUT',        // 24% VAT
    '25': 'OUTPUT',        // 25% VAT (Sweden, Denmark)
    '27': 'OUTPUT',        // 27% VAT (Hungary)
    
    // Reduced rates
    '3': 'OUTPUT',         // 3% reduced rate
    '6': 'OUTPUT',         // 6% reduced rate
    '9': 'OUTPUT',         // 9% reduced rate
    '13': 'OUTPUT',        // 13% reduced rate
    '14': 'OUTPUT',        // 14% reduced rate
  };
  
  // First try exact match
  const exactMatch = taxMappings[String(roundedRate)];
  if (exactMatch) {
    return exactMatch;
  }
  
  // If no exact match, try to find closest standard rate
  const standardRates = [0, 5, 7.5, 10, 12.5, 15, 16, 17.5, 18, 19, 20, 21, 22, 23, 24, 25, 27];
  let closestRate = standardRates.reduce((prev, curr) => 
    Math.abs(curr - roundedRate) < Math.abs(prev - roundedRate) ? curr : prev
  );
  
  // Only use closest rate if it's within 1% difference
  if (Math.abs(closestRate - roundedRate) <= 1) {
    const closestMatch = taxMappings[String(closestRate)];
    if (closestMatch) {
      console.warn(`Tax rate ${roundedRate}% mapped to closest standard rate ${closestRate}% (${closestMatch})`);
      return closestMatch;
    }
  }
  
  // If all else fails, return null to trigger fallback to NONE
  console.warn(`No suitable tax mapping found for rate ${roundedRate}%, will use NONE`);
  return null;
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