# Partial Invoice Creation Feature

## Overview

The Partial Invoice Creation feature allows users to create invoices from Xero quotes using only selected line items with specified quantities. This is useful when you want to invoice for partial delivery of goods or services from a larger quote.

## Features

- **Selective Line Items**: Choose specific line items from a quote
- **Quantity Control**: Specify custom quantities for each selected line item (cannot exceed original quote quantities)
- **Business Logic Validation**: Comprehensive validation ensures data integrity
- **Error Handling**: Detailed error messages for various failure scenarios
- **Integration**: Seamlessly integrates with existing Pipedrive and Xero workflows

## API Endpoint

### Create Partial Invoice from Quote

**POST** `/api/xero/create-partial-invoice-from-quote`

#### Authentication Required
- Pipedrive OAuth token
- Xero OAuth token

#### Request Body

```json
{
  "dealId": "string",
  "pipedriveCompanyId": "string", 
  "selectedLineItems": [
    {
      "lineItemId": "string",
      "quantity": number
    }
  ]
}
```

#### Example Request

```json
{
  "dealId": "123",
  "pipedriveCompanyId": "company-456",
  "selectedLineItems": [
    {
      "lineItemId": "line-item-1",
      "quantity": 5
    },
    {
      "lineItemId": "line-item-3", 
      "quantity": 2
    }
  ]
}
```

#### Success Response (200)

```json
{
  "success": true,
  "invoice": {
    "InvoiceID": "invoice-789",
    "InvoiceNumber": "INV-001", 
    "Status": "DRAFT",
    "Total": 1200.00
  },
  "quoteNumber": "Q-456",
  "invoiceNumber": "INV-001",
  "message": "Partial invoice created successfully from quote Q-456",
  "selectedLineItems": [
    {
      "lineItemId": "line-item-1",
      "quantity": 5
    },
    {
      "lineItemId": "line-item-3",
      "quantity": 2  
    }
  ]
}
```

#### Error Responses

##### 400 - Bad Request
```json
{
  "error": "Deal ID, Pipedrive Company ID, and selected line items are required."
}
```

```json
{
  "error": "At least one line item must be selected for partial invoicing."
}
```

```json
{
  "error": "Quantity for line item line-item-1 exceeds original quote quantity."
}
```

```json
{
  "error": "Quote Q-456 must be accepted before creating an invoice. Current status: DRAFT"
}
```

##### 404 - Not Found
```json
{
  "error": "Deal with ID 123 not found."
}
```

```json
{
  "error": "Quote Q-456 not found in Xero."
}
```

##### 500 - Internal Server Error
```json
{
  "error": "Failed to create partial invoice from quote: [specific error message]"
}
```

## Business Rules

### Prerequisites
1. **Deal must exist** in Pipedrive
2. **Quote must exist** in Xero and be associated with the deal
3. **Quote must be ACCEPTED** in Xero before invoice creation
4. **Deal must not already have an invoice** (if invoice custom field is configured)

### Line Item Validation
1. **At least one line item** must be selected
2. **Line item IDs must exist** in the original quote
3. **Quantities must be positive numbers**
4. **Quantities cannot exceed** original quote quantities
5. **All selected line items must have quantities** specified

### Invoice Creation Rules
1. **Invoice type**: ACCREC (Accounts Receivable)
2. **Invoice status**: DRAFT
3. **Contact**: Inherited from original quote
4. **Currency**: Inherited from original quote (if specified)
5. **Due date**: 30 days from creation date
6. **Reference**: "Partial Invoice from Quote: [QuoteNumber]"

## Implementation Details

### Files Created/Modified

#### Business Logic
- `utils/partialInvoiceBusinessRules.js` - Validation and business rules
- `controllers/xeroController.js` - Added `createPartialInvoiceFromQuote` function
- `services/xeroApiService.js` - Added `createInvoice` function
- `routes/xeroRoutes.js` - Added new route endpoint

#### Tests
- `__tests__/partialInvoice.test.js` - Business rules and validation tests
- `__tests__/partialInvoiceIntegration.test.js` - Integration tests

### Key Functions

#### `validateSelectedLineItems(selectedLineItems, originalLineItems)`
Validates that selected line items are valid and quantities don't exceed originals.

#### `createPartialInvoiceFromQuote(req, res)`
Main controller function that orchestrates the partial invoice creation process.

#### `createInvoice(accessToken, tenantId, invoicePayload)`
Xero API service function to create invoices with custom line items.

## Usage Examples

### Example 1: Partial Delivery Invoice

Original quote has:
- Item A: 10 units @ $100 each
- Item B: 5 units @ $200 each  
- Item C: 3 units @ $300 each

Customer receives partial delivery of:
- Item A: 6 units
- Item C: 2 units

Request:
```json
{
  "dealId": "deal-123",
  "pipedriveCompanyId": "company-456",
  "selectedLineItems": [
    {
      "lineItemId": "item-a-id",
      "quantity": 6
    },
    {
      "lineItemId": "item-c-id", 
      "quantity": 2
    }
  ]
}
```

This creates an invoice for $1,200 (6 × $100 + 2 × $300).

### Example 2: Service Milestone Invoice

Original quote for consulting services:
- Phase 1: Discovery (40 hours @ $150/hour)
- Phase 2: Development (80 hours @ $150/hour)
- Phase 3: Testing (20 hours @ $150/hour)

Invoice for completed Phase 1:
```json
{
  "dealId": "deal-456",
  "pipedriveCompanyId": "company-789",
  "selectedLineItems": [
    {
      "lineItemId": "phase-1-id",
      "quantity": 40
    }
  ]
}
```

This creates an invoice for $6,000 (40 × $150).

## Error Handling

The system provides comprehensive error handling for various scenarios:

1. **Input Validation**: Missing or invalid parameters
2. **Business Rule Violations**: Invalid quantities, non-existent items
3. **State Validation**: Unaccepted quotes, existing invoices
4. **API Errors**: Pipedrive/Xero API failures
5. **Network Issues**: Connection problems, timeouts

## Testing

### Unit Tests
- Business rule validation
- Input parameter validation
- Error condition handling

### Integration Tests  
- Controller function behavior
- API interaction validation
- End-to-end workflow testing

### Running Tests
```bash
# Run all partial invoice tests
npm test -- __tests__/partialInvoice.test.js __tests__/partialInvoiceIntegration.test.js

# Run business rules tests only
npm test -- __tests__/partialInvoice.test.js

# Run integration tests only  
npm test -- __tests__/partialInvoiceIntegration.test.js
```

## Configuration

### Environment Variables

The feature uses the same environment variables as the existing quote-to-invoice functionality:

- `PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY` - Custom field key for storing quote numbers in Pipedrive
- `PIPEDRIVE_INVOICE_CUSTOM_FIELD_KEY` - Custom field key for storing invoice numbers in Pipedrive
- `XERO_DEFAULT_ACCOUNT_CODE` - Default account code for line items (default: "200")
- `XERO_DEFAULT_TAX_TYPE` - Default tax type for line items (default: "NONE")

## Future Enhancements

### Potential Improvements
1. **Batch Partial Invoicing**: Create multiple partial invoices at once
2. **Remaining Items Tracking**: Track what items are left to invoice
3. **Invoice Scheduling**: Schedule partial invoices for future dates
4. **Custom Invoice Notes**: Add custom notes to partial invoices
5. **Email Notifications**: Notify stakeholders when partial invoices are created
6. **Audit Trail**: Track all partial invoicing activities

### Performance Optimizations
1. **Caching**: Cache quote data for multiple partial invoices
2. **Bulk Operations**: Support bulk partial invoice creation
3. **Async Processing**: Process large invoices asynchronously

## Support

For issues or questions regarding the Partial Invoice Creation feature:

1. Check the test files for usage examples
2. Review error messages for specific guidance
3. Consult the business rules section for validation requirements
4. Test with the provided examples before implementing

## Version History

- **v1.0.0**: Initial implementation with basic partial invoicing functionality
- **v1.0.1**: Added comprehensive validation and error handling
- **v1.0.2**: Enhanced test coverage and documentation 