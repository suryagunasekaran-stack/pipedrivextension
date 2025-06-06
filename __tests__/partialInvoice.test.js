import { jest } from '@jest/globals';
import { validateSelectedLineItems } from '../utils/partialInvoiceBusinessRules.js';

describe('Partial Invoice Creation', () => {
  let xeroController;

  beforeAll(async () => {
    // Import the controller
    xeroController = await import('../controllers/xeroController.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateSelectedLineItems', () => {
    const mockOriginalLineItems = [
      { LineItemID: '1', Quantity: 10, Description: 'Item 1' },
      { LineItemID: '2', Quantity: 5, Description: 'Item 2' }
    ];

    test('should validate valid line items', () => {
      const selectedItems = [
        { lineItemId: '1', quantity: 5 },
        { lineItemId: '2', quantity: 3 }
      ];

      const result = validateSelectedLineItems(selectedItems, mockOriginalLineItems);
      expect(result.isValid).toBe(true);
    });

    test('should reject empty line items array', () => {
      const result = validateSelectedLineItems([], mockOriginalLineItems);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('At least one line item must be selected for partial invoicing.');
    });

    test('should reject missing line item ID', () => {
      const selectedItems = [
        { quantity: 5 },
        { lineItemId: '2', quantity: 3 }
      ];

      const result = validateSelectedLineItems(selectedItems, mockOriginalLineItems);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Line item ID is required.');
    });

    test('should reject non-existent line item', () => {
      const selectedItems = [
        { lineItemId: '999', quantity: 5 }
      ];

      const result = validateSelectedLineItems(selectedItems, mockOriginalLineItems);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Line item 999 not found in original quote.');
    });

    test('should reject missing quantity', () => {
      const selectedItems = [
        { lineItemId: '1' },
        { lineItemId: '2', quantity: 3 }
      ];

      const result = validateSelectedLineItems(selectedItems, mockOriginalLineItems);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Quantity is required for line item 1.');
    });

    test('should reject invalid quantity', () => {
      const selectedItems = [
        { lineItemId: '1', quantity: -5 },
        { lineItemId: '2', quantity: 3 }
      ];

      const result = validateSelectedLineItems(selectedItems, mockOriginalLineItems);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid quantity for line item 1. Quantity must be greater than 0.');
    });

    test('should reject quantity exceeding original', () => {
      const selectedItems = [
        { lineItemId: '1', quantity: 15 },
        { lineItemId: '2', quantity: 3 }
      ];

      const result = validateSelectedLineItems(selectedItems, mockOriginalLineItems);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Quantity for line item 1 exceeds original quote quantity.');
    });
  });

  describe('createPartialInvoiceFromQuote controller', () => {
    const mockRequest = {
      body: {
        dealId: 'test-deal-123',
        pipedriveCompanyId: 'pipedrive-company-456',
        selectedLineItems: [
          { lineItemId: '1', quantity: 5 },
          { lineItemId: '2', quantity: 3 }
        ]
      },
      pipedriveAuth: {
        accessToken: 'pd-access-token',
        apiDomain: 'test-company.pipedrive.com'
      },
      xeroAuth: {
        accessToken: 'xero-access-token',
        tenantId: 'xero-tenant-123'
      }
    };

    const mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    test('should return 400 for missing required parameters', async () => {
      const invalidRequest = {
        ...mockRequest,
        body: { dealId: 'test-deal-123' }
      };

      await xeroController.createPartialInvoiceFromQuote(invalidRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Deal ID, Pipedrive Company ID, and selected line items are required.'
      });
    });

    // Note: Additional integration tests would require proper mocking setup
    // For now, we're testing the basic validation logic and business rules
    // Full integration tests would require a more complex setup with service mocks
  });
}); 