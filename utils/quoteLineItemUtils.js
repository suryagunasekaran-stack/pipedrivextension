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
  const formatted = {
    Description: lineItem.description || 'N/A',
    Quantity: lineItem.quantity,
    UnitAmount: lineItem.unitAmount,
    LineAmount: calculateLineItemTotal(lineItem),
    AccountCode: lineItem.accountCode || process.env.XERO_DEFAULT_ACCOUNT_CODE || '200',
    TaxType: lineItem.taxType || process.env.XERO_DEFAULT_TAX_TYPE || 'NONE'
  };
  if (lineItem.discountRate !== undefined) formatted.DiscountRate = lineItem.discountRate;
  if (lineItem.discountAmount !== undefined) formatted.DiscountAmount = lineItem.discountAmount;
  if (lineItem.tracking) formatted.Tracking = lineItem.tracking;
  return formatted;
} 