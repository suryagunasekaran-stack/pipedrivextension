/**
 * Partial Invoice Business Rules
 * 
 * This module contains business logic for creating partial invoices from quotes.
 * It handles validation of line items, quantities, and ensures the partial invoice
 * creation follows business rules.
 * 
 * @module utils/partialInvoiceBusinessRules
 */

/**
 * Validates the selected line items for partial invoicing
 * @param {Array} selectedLineItems - Array of selected line items with quantities
 * @param {Array} originalLineItems - Array of original quote line items
 * @returns {Object} Validation result with isValid flag and error message if invalid
 */
export function validateSelectedLineItems(selectedLineItems, originalLineItems) {
    if (!selectedLineItems || !Array.isArray(selectedLineItems) || selectedLineItems.length === 0) {
        return {
            isValid: false,
            error: 'At least one line item must be selected for partial invoicing.'
        };
    }

    // Create a map of original line items for quick lookup
    const originalItemsMap = new Map(
        originalLineItems.map(item => [item.LineItemID, item])
    );

    for (const selectedItem of selectedLineItems) {
        // Validate line item ID exists
        if (!selectedItem.lineItemId) {
            return {
                isValid: false,
                error: 'Line item ID is required.'
            };
        }

        // Check if line item exists in original quote
        const originalItem = originalItemsMap.get(selectedItem.lineItemId);
        if (!originalItem) {
            return {
                isValid: false,
                error: `Line item ${selectedItem.lineItemId} not found in original quote.`
            };
        }

        // Validate quantity
        if (selectedItem.quantity === undefined || selectedItem.quantity === null) {
            return {
                isValid: false,
                error: `Quantity is required for line item ${selectedItem.lineItemId}.`
            };
        }

        if (typeof selectedItem.quantity !== 'number' || selectedItem.quantity <= 0) {
            return {
                isValid: false,
                error: `Invalid quantity for line item ${selectedItem.lineItemId}. Quantity must be greater than 0.`
            };
        }

        // Check if quantity exceeds original
        if (selectedItem.quantity > originalItem.Quantity) {
            return {
                isValid: false,
                error: `Quantity for line item ${selectedItem.lineItemId} exceeds original quote quantity.`
            };
        }
    }

    return { isValid: true };
}

/**
 * Creates a new invoice with selected line items from the original quote
 * @param {Object} quote - Original quote object
 * @param {Array} selectedLineItems - Array of selected line items with quantities
 * @returns {Object} New invoice object with selected line items
 */
export function createPartialInvoiceFromQuote(quote, selectedLineItems) {
    // Create a map of selected items for quick lookup
    const selectedItemsMap = new Map(
        selectedLineItems.map(item => [item.lineItemId, item.quantity])
    );

    // Filter and transform line items
    const newLineItems = quote.LineItems
        .filter(item => selectedItemsMap.has(item.LineItemID))
        .map(item => ({
            ...item,
            Quantity: selectedItemsMap.get(item.LineItemID),
            LineAmount: item.UnitAmount * selectedItemsMap.get(item.LineItemID)
        }));

    // Calculate new totals
    const subtotal = newLineItems.reduce((sum, item) => sum + item.LineAmount, 0);
    const taxRate = quote.TaxRate || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    return {
        ...quote,
        LineItems: newLineItems,
        SubTotal: subtotal,
        TotalTax: taxAmount,
        Total: total,
        Status: 'DRAFT',
        Type: 'ACCPAY',
        QuoteID: quote.QuoteID,
        QuoteNumber: quote.QuoteNumber
    };
}

/**
 * Validates the request body for partial invoice creation
 * @param {Object} body - Request body
 * @returns {Object} Validation result with isValid flag and error message if invalid
 */
export function validatePartialInvoiceRequest(body) {
    if (!body.dealId || !body.pipedriveCompanyId || !body.selectedLineItems) {
        return {
            isValid: false,
            error: 'Deal ID, Pipedrive Company ID, and selected line items are required.'
        };
    }

    return { isValid: true };
} 