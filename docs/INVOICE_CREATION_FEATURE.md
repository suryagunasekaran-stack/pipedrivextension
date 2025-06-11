# Invoice Creation from Quote Feature

## Overview

The Invoice Creation feature allows users to create invoices in Xero from existing quotes that are linked to Pipedrive deals. This feature provides a complete workflow from quote validation to invoice creation with proper error handling and Pipedrive integration.

## Features

- **Quote Validation**: Validates that the quote exists and is in ACCEPTED status before creating invoice
- **Deal Integration**: Seamlessly integrates with Pipedrive deals and custom fields
- **Error Handling**: Comprehensive validation and error handling for various failure scenarios
- **Pipedrive Updates**: Automatically updates Pipedrive deal with invoice number and ID
- **Special Quote ID Support**: Supports using specific quote ID from environment variable

## API Endpoints

### 1. Initial Invoice Preparation (Pipedrive Action)

**GET** `/pipedrive-action?uiAction=createInvoice`

This endpoint handles the initial redirect from Pipedrive app extensions.

**Query Parameters:**
- `selectedIds` - Deal ID from Pipedrive
- `companyId` - Pipedrive company ID
- `uiAction` - Should be "createInvoice"
- `resource` - Should be "deal"

**Response:** Redirects to frontend create-invoice-page

### 2. Get Invoice Preparation Data

**POST** `/api/pipedrive/create-invoice`

Validates the deal and returns necessary data for invoice creation.

#### Request Body

```json
{
  "dealId": "string",
  "companyId": "string"
}
```

#### Response

```json
{
  "message": "Invoice creation initiated. Deal details and quote information retrieved.",
  "deal": {
    // Full deal object with custom fields
    "id": "deal-123",
    "title": "Test Deal",
    "value": 1000,
    "xero_quote_number": "Q-001",
    "xero_quote_id": "639901ad...",
    "existing_invoice_number": null
  },
  "xeroQuoteNumber": "Q-001",
  "xeroQuoteId": "639901ad29bc8ae8c8fe6db44b80e64712d077ae",
  "canCreateInvoice": true,
  "hasExistingInvoice": false
}
```

### 3. Create Invoice from Deal

**POST** `/api/xero/create-invoice-from-deal`

Creates an invoice from the quote associated with a Pipedrive deal.

#### Authentication Required
- Pipedrive OAuth token
- Xero OAuth token

#### Request Body

```json
{
  "dealId": "string",
  "pipedriveCompanyId": "string"
}
```

### 4. Create Invoice from Deal with Document Upload

**POST** `/api/xero/create-invoice-with-documents`

Creates an invoice from the quote associated with a Pipedrive deal and optionally uploads documents as attachments.

#### Authentication Required
- Pipedrive OAuth token
- Xero OAuth token

#### Request Format
This endpoint accepts multipart/form-data to support file uploads.

#### Form Data Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dealId` | string | Yes | Pipedrive deal ID |
| `pipedriveCompanyId` | string | Yes | Pipedrive company ID |
| `documents` | file(s) | No | Documents to attach to invoice (max 5 files, 10MB each) |

#### Supported File Types
- Images: JPEG, JPG, PNG, GIF
- Documents: PDF, DOC, DOCX, XLS, XLSX, TXT, CSV

#### Example Frontend Usage

```javascript
const formData = new FormData();
formData.append('dealId', 'deal-123');
formData.append('pipedriveCompanyId', 'company-456');

// Add multiple files
for (let i = 0; i < files.length; i++) {
    formData.append('documents', files[i]);
}

const response = await fetch('/api/xero/create-invoice-with-documents', {
    method: 'POST',
    body: formData,
    headers: {
        // Don't set Content-Type header - let browser set it with boundary
        'Authorization': 'Bearer your-token'
    }
});
```

#### Success Response with Documents (200)

```json
{
  "success": true,
  "invoice": {
    "invoiceId": "inv-789",
    "invoiceNumber": "INV-001",
    "status": "DRAFT",
    "total": 1200.00,
    "dueDate": "2024-02-01",
    "date": "2024-01-01",
    "contactId": "contact-123"
  },
  "quote": {
    "quoteId": "quote-456",
    "quoteNumber": "Q-001",
    "status": "ACCEPTED"
  },
  "pipedrive": {
    "dealId": "deal-123",
    "dealTitle": "Test Deal",
    "updates": {
      "invoiceNumberUpdated": true,
      "invoiceIdUpdated": true,
      "warnings": []
    }
  },
  "attachments": {
    "message": "2 of 2 documents uploaded successfully",
    "totalCount": 2,
    "successCount": 2,
    "failureCount": 0,
    "successful": [
      {
        "fileName": "contract.pdf",
        "attachmentId": "att-123"
      },
      {
        "fileName": "receipt.jpg", 
        "attachmentId": "att-456"
      }
    ]
  },
  "message": "Invoice INV-001 created successfully from quote Q-001"
}
```

#### Success Response (200)

```json
{
  "success": true,
  "invoice": {
    "invoiceId": "inv-789",
    "invoiceNumber": "INV-001",
    "status": "DRAFT",
    "total": 1200.00,
    "dueDate": "2024-02-01",
    "date": "2024-01-01",
    "contactId": "contact-123"
  },
  "quote": {
    "quoteId": "quote-456",
    "quoteNumber": "Q-001",
    "status": "ACCEPTED"
  },
  "pipedrive": {
    "dealId": "deal-123",
    "dealTitle": "Test Deal",
    "updates": {
      "invoiceNumberUpdated": true,
      "invoiceIdUpdated": true,
      "warnings": []
    }
  },
  "message": "Invoice INV-001 created successfully from quote Q-001"
}
```

#### Error Responses

##### 400 - Bad Request
```json
{
  "error": "Deal does not have an associated quote. Please create a quote first."
}
```

```json
{
  "error": "Deal already has an associated invoice: INV-001"
}
```

```json
{
  "error": "Quote Q-001 must be accepted before creating an invoice. Current status: DRAFT"
}
```

##### 404 - Not Found
```json
{
  "error": "Deal with ID deal-123 not found."
}
```

```json
{
  "error": "Quote not found in Xero. Quote Number: Q-001, Quote ID: 639901ad..."
}
```

## Environment Variables

The following environment variables need to be configured:

```bash
# Pipedrive Custom Field Keys
PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY=your_quote_number_field_key
PIPEDRIVE_QUOTE_ID=639901ad29bc8ae8c8fe6db44b80e64712d077ae
PIPEDRIVE_INVOICENUMBER=your_invoice_number_field_key
PIPEDRIVE_INVOICEID=your_invoice_id_field_key
PIPEDRIVE_PENDING=your_pending_status_field_key

# Frontend URL
FRONTEND_BASE_URL=http://localhost:3001
```

### Environment Variable Descriptions

- **PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY**: Custom field key in Pipedrive for storing quote numbers
- **PIPEDRIVE_QUOTE_ID**: Specific quote ID to be used (from your requirement: 639901ad29bc8ae8c8fe6db44b80e64712d077ae)
- **PIPEDRIVE_INVOICENUMBER**: Custom field key in Pipedrive for storing invoice numbers
- **PIPEDRIVE_INVOICEID**: Custom field key in Pipedrive for storing Xero invoice IDs
- **PIPEDRIVE_PENDING**: Custom field key for invoice payment status (single select: "Pending", "Waiting For Payment", "Paid")
- **FRONTEND_BASE_URL**: Base URL for frontend redirects

## Business Logic

### Validation Flow

1. **Deal Validation**
   - Deal must exist in Pipedrive
   - Deal must have an associated quote (either quote number or quote ID)
   - Deal must not already have an invoice

2. **Quote Validation**
   - Quote must exist in Xero
   - Quote must have line items
   - Quote status must be "ACCEPTED"

3. **Data Comparison**
   - Compares Pipedrive deal products with Xero quote line items (for validation)
   - Ensures data consistency between systems

### Invoice Creation Process

1. **Retrieve Quote**: Gets the quote from Xero using quote ID or quote number
2. **Validate Quote**: Ensures quote is in correct status and has line items
3. **Create Invoice**: Creates DRAFT invoice with type ACCREC (Accounts Receivable)
4. **Update Pipedrive**: Updates deal with invoice number and invoice ID
5. **Return Response**: Returns comprehensive response with invoice, quote, and update status

## Frontend Integration

### Frontend Route
Your frontend should implement the route: `/create-invoice-page`

### Expected URL Parameters
```
/create-invoice-page?dealId={dealId}&companyId={companyId}&uiAction=createInvoice
```

### Frontend Workflow

1. **Initial Load**: Call `/api/pipedrive/create-invoice` to get deal and quote information
2. **Validation Display**: Show user the quote details and validation status
3. **Invoice Creation**: Call `/api/xero/create-invoice-from-deal` to create the invoice
4. **Result Display**: Show success/error message with invoice details

### Example Frontend Implementation

```javascript
// 1. Get invoice preparation data
const getInvoiceData = async (dealId, companyId) => {
  const response = await fetch('/api/pipedrive/create-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealId, companyId })
  });
  return response.json();
};

// 2. Create invoice from deal
const createInvoice = async (dealId, pipedriveCompanyId) => {
  const response = await fetch('/api/xero/create-invoice-from-deal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealId, pipedriveCompanyId })
  });
  return response.json();
};
```

## Error Handling

The feature includes comprehensive error handling for:

- Missing or invalid request parameters
- Deal not found in Pipedrive
- Quote not found in Xero
- Quote not in accepted status
- Quote with no line items
- Existing invoice already created
- Xero API failures
- Pipedrive update failures

All errors include detailed messages to help users understand what went wrong and how to resolve the issue.

## Testing

Tests are included in `__tests__/createInvoiceFromDeal.test.js` covering:

- Input validation
- Basic error handling
- Controller function structure

For more comprehensive testing, additional integration tests can be added with proper service mocking.

## Special Features

### Specific Quote ID Support

The feature supports using the specific quote ID provided in your requirements:
`PIPEDRIVE_QUOTE_ID=639901ad29bc8ae8c8fe6db44b80e64712d077ae`

When this environment variable is set and matches the quote ID from a deal, the system will use this specific quote for invoice creation.

### Graceful Pipedrive Updates

If Pipedrive custom field updates fail, the invoice creation still succeeds, but warnings are included in the response. This ensures that Xero invoice creation is not blocked by Pipedrive issues. 