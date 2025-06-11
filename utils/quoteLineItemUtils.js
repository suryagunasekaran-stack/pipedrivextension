/**
 * Validates a line item object
 * @param {Object} lineItem - The line item to validate
 * @returns {boolean} - Whether the line item is valid
 */
export function validateLineItem(lineItem) {
  if (!lineItem || typeof lineItem !== 'object') return false;
  if (typeof lineItem.description !== 'string' || !lineItem.description.trim()) return false;
  if (typeof lineItem.quantity !== 'number' || typeof lineItem.unitAmount !== 'number') return false;
  if (lineItem.quantity <= 0 || lineItem.unitAmount < 0) return false;
  // Optional: check discount fields if present
  if (lineItem.discountRate !== undefined && (typeof lineItem.discountRate !== 'number' || lineItem.discountRate < 0 || lineItem.discountRate > 100)) return false;
  if (lineItem.discountAmount !== undefined && (typeof lineItem.discountAmount !== 'number' || lineItem.discountAmount < 0)) return false;
  return true;
}

/**
 * Calculates the total amount for a line item
 * @param {Object} lineItem - The line item to calculate total for
 * @returns {number} - The calculated total
 * @throws {Error} - If line item values are invalid
 */
export function calculateLineItemTotal(lineItem) {
  if (!validateLineItem(lineItem)) throw new Error('Invalid line item values');
  let total = lineItem.quantity * lineItem.unitAmount;
  if (typeof lineItem.discountRate === 'number') {
    total -= total * (lineItem.discountRate / 100);
  }
  if (typeof lineItem.discountAmount === 'number') {
    total -= lineItem.discountAmount;
  }
  return Number(total.toFixed(2));
}

/**
 * Formats a line item for the Xero API
 * @param {Object} lineItem - The line item to format
 * @returns {Object} - Formatted line item for Xero
 * @throws {Error} - If line item is invalid
 */
export function formatLineItem(lineItem) {
  if (!validateLineItem(lineItem)) throw new Error('Invalid line item values');
  
  // Build the base formatted line item
  const formatted = {
    Description: lineItem.description || 'N/A',
    Quantity: lineItem.quantity,
    UnitAmount: lineItem.unitAmount,
    LineAmount: calculateLineItemTotal(lineItem),
    AccountCode: lineItem.accountCode || process.env.XERO_DEFAULT_ACCOUNT_CODE || '200',
    TaxType: lineItem.taxType || process.env.XERO_DEFAULT_TAX_TYPE || 'NONE'
  };
  
  // Handle tax rate with validation and fallbacks
  if (lineItem.taxRate !== undefined && lineItem.taxRate !== null) {
    const taxRate = parseFloat(lineItem.taxRate);
    if (!isNaN(taxRate) && taxRate >= 0 && taxRate <= 100) {
      // Only include TaxRate if it's a valid number
      formatted.TaxRate = taxRate;
    } else {
      // If invalid tax rate, ensure we use NONE tax type
      console.warn(`Invalid tax rate ${lineItem.taxRate} for line item, using NONE tax type`);
      formatted.TaxType = 'NONE';
    }
  } else if (formatted.TaxType === 'NONE') {
    // Explicitly set TaxRate to 0 when using NONE tax type for clarity
    formatted.TaxRate = 0;
  }
  
  // Add optional fields with validation
  if (lineItem.discountRate !== undefined && !isNaN(parseFloat(lineItem.discountRate))) {
    const discountRate = parseFloat(lineItem.discountRate);
    if (discountRate >= 0 && discountRate <= 100) {
      formatted.DiscountRate = discountRate;
    }
  }
  
  if (lineItem.discountAmount !== undefined && !isNaN(parseFloat(lineItem.discountAmount))) {
    const discountAmount = parseFloat(lineItem.discountAmount);
    if (discountAmount >= 0) {
      formatted.DiscountAmount = discountAmount;
    }
  }
  
  // Add tracking information if available
  if (lineItem.tracking && Array.isArray(lineItem.tracking) && lineItem.tracking.length > 0) {
    formatted.Tracking = lineItem.tracking;
  }
  
  // Add item code if available
  if (lineItem.itemCode && typeof lineItem.itemCode === 'string') {
    formatted.ItemCode = lineItem.itemCode.trim();
  }
  
  return formatted;
} 