import { jest } from '@jest/globals';

describe('Partial Invoice Integration Tests', () => {
  let xeroController;

  beforeAll(async () => {
    // Import the controller
    xeroController = await import('../controllers/xeroController.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPartialInvoiceFromQuote controller - Integration', () => {
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

    test('should return 400 for empty selectedLineItems array', async () => {
      const invalidRequest = {
        ...mockRequest,
        body: { 
          dealId: 'test-deal-123',
          pipedriveCompanyId: 'pipedrive-company-456',
          selectedLineItems: []
        }
      };

      await xeroController.createPartialInvoiceFromQuote(invalidRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'At least one line item must be selected for partial invoicing.'
      });
    });

    test('should return 400 for null selectedLineItems', async () => {
      const invalidRequest = {
        ...mockRequest,
        body: { 
          dealId: 'test-deal-123',
          pipedriveCompanyId: 'pipedrive-company-456',
          selectedLineItems: null
        }
      };

      await xeroController.createPartialInvoiceFromQuote(invalidRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Deal ID, Pipedrive Company ID, and selected line items are required.'
      });
    });

    // Note: More comprehensive tests would require proper service mocking
    // which is complex with the current ES module setup. 
    // The current tests validate the basic input validation logic
    // Full integration testing would be better done with a proper test environment
  });
}); 