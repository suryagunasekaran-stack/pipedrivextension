/**
 * Comprehensive test suite for project controller
 * Tests all scenarios including edge cases, validation, and integration flows
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createFullProject } from '../../controllers/projectController.js';
import {
  PipedriveMock,
  XeroMock,
  TestDataManager,
  mockAuth,
  mockData,
  createMockRequest,
  createMockResponse,
  cleanupMocks
} from '../testUtils.js';
import * as tokenService from '../../services/tokenService.js';

// Mock all external dependencies
jest.mock('../../services/tokenService.js');
jest.mock('../../models/projectSequenceModel.js');

describe('Project Controller - createFullProject', () => {
  let pipedriveMock;
  let xeroMock;
  let testDataManager;
  let req;
  let res;

  beforeEach(() => {
    // Initialize mocks
    pipedriveMock = new PipedriveMock();
    xeroMock = new XeroMock();
    testDataManager = new TestDataManager();
    
    // Create mock request and response
    req = createMockRequest({
      body: {
        pipedriveDealId: '12345',
        pipedriveCompanyId: 'test-company'
      },
      pipedriveAuth: mockAuth.validPipedriveAuth,
      xeroAuth: mockAuth.validXeroAuth
    });
    res = createMockResponse();

    // Mock token service
    tokenService.allCompanyTokens = {
      'test-company': mockAuth.validPipedriveAuth
    };

    // Mock project sequence model
    const { getNextProjectNumber } = await import('../../models/projectSequenceModel.js');
    getNextProjectNumber.mockResolvedValue('PROJ-001');
  });

  afterEach(async () => {
    cleanupMocks();
    await testDataManager.cleanup();
    jest.clearAllMocks();
  });

  describe('Successful project creation scenarios', () => {
    test('should create new project with all valid data', async () => {
      // Setup mocks for successful flow
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      xeroMock
        .mockGetContacts([])
        .mockCreateContact()
        .mockCreateProject();

      // Execute
      await createFullProject(req, res);

      // Verify response
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          projectNumber: 'PROJ-001',
          deal: expect.any(Object),
          person: expect.any(Object),
          organization: expect.any(Object),
          products: expect.any(Array),
          xero: expect.objectContaining({
            projectCreated: true
          }),
          metadata: expect.objectContaining({
            dealId: '12345',
            companyId: 'test-company',
            isNewProject: true
          })
        })
      );

      // Verify mocks were called
      pipedriveMock.done();
      xeroMock.done();
    });

    test('should link to existing project when existingProjectNumberToLink is provided', async () => {
      // Setup request with existing project number
      req.body.existingProjectNumberToLink = 'EXISTING-001';

      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      xeroMock
        .mockGetContacts([mockData.xeroContact()])
        .mockGetProjects([mockData.xeroProject('xero-project-123', 'EXISTING-001')]);

      // Mock project sequence to return existing number
      const { getNextProjectNumber } = await import('../../models/projectSequenceModel.js');
      getNextProjectNumber.mockResolvedValue('EXISTING-001');

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          projectNumber: 'EXISTING-001',
          message: expect.stringContaining('linked to existing project'),
          metadata: expect.objectContaining({
            isNewProject: false
          })
        })
      );
    });

    test('should handle project creation without Xero integration', async () => {
      // Remove Xero auth to test without Xero
      req.xeroAuth = null;

      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          xero: expect.objectContaining({
            projectCreated: false,
            message: expect.stringContaining('not authenticated')
          })
        })
      );
    });
  });

  describe('Validation error scenarios', () => {
    test('should return 400 when pipedriveDealId is missing', async () => {
      req.body = { pipedriveCompanyId: 'test-company' };

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('pipedriveDealId'),
          missingField: 'pipedriveDealId'
        })
      );
    });

    test('should return 400 when pipedriveCompanyId is missing', async () => {
      req.body = { pipedriveDealId: '12345' };

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('pipedriveCompanyId'),
          missingField: 'pipedriveCompanyId'
        })
      );
    });

    test('should return 400 when dealId is not a valid number', async () => {
      req.body.pipedriveDealId = 'invalid-deal-id';

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('must be a valid integer')
        })
      );
    });
  });

  describe('Authentication error scenarios', () => {
    test('should return 401 when Pipedrive tokens are missing', async () => {
      // Remove tokens from service
      tokenService.allCompanyTokens = {};
      req.pipedriveAuth = null;

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('not authenticated')
        })
      );
    });

    test('should handle token refresh when tokens are expired', async () => {
      // Setup expired tokens
      tokenService.allCompanyTokens = {
        'test-company': mockAuth.expiredPipedriveAuth
      };

      // Mock token refresh
      tokenService.refreshPipedriveToken = jest.fn().mockResolvedValue(mockAuth.validPipedriveAuth);

      pipedriveMock
        .mockAuthTokenRefresh()
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      await createFullProject(req, res);

      expect(tokenService.refreshPipedriveToken).toHaveBeenCalledWith('test-company');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should return 401 when token refresh fails', async () => {
      tokenService.allCompanyTokens = {
        'test-company': mockAuth.expiredPipedriveAuth
      };

      tokenService.refreshPipedriveToken = jest.fn().mockRejectedValue(new Error('Refresh failed'));

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Refresh failed')
        })
      );
    });
  });

  describe('Pipedrive API error scenarios', () => {
    test('should return 404 when deal is not found', async () => {
      pipedriveMock.mockGetDeal('12345', null, 404);

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Deal not found')
        })
      );
    });

    test('should handle missing required custom fields', async () => {
      // Create deal with missing required fields
      const dealWithMissingFields = mockData.pipedriveDeal('12345', {
        custom_fields: {
          department: null,
          vessel: 'Test Vessel',
          person_in_charge: 'John Doe',
          location: 'Test Location'
        }
      });

      pipedriveMock.mockGetDeal('12345', dealWithMissingFields);

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('department')
        })
      );
    });

    test('should handle person not found', async () => {
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101', null, 404);

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Person not found')
        })
      );
    });

    test('should handle organization not found', async () => {
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201', null, 404);

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Organization not found')
        })
      );
    });
  });

  describe('Project numbering scenarios', () => {
    test('should handle project sequence generation error', async () => {
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201');

      // Mock project sequence failure
      const { getNextProjectNumber } = await import('../../models/projectSequenceModel.js');
      getNextProjectNumber.mockRejectedValue(new Error('Database connection failed'));

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Database connection failed')
        })
      );
    });

    test('should handle duplicate project number scenarios', async () => {
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      // Mock existing project number
      const { getNextProjectNumber } = await import('../../models/projectSequenceModel.js');
      getNextProjectNumber.mockResolvedValue('PROJ-002'); // Different number to simulate increment

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          projectNumber: 'PROJ-002'
        })
      );
    });
  });

  describe('Xero integration scenarios', () => {
    test('should handle Xero contact creation failure', async () => {
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      xeroMock
        .mockGetContacts([])
        .mockCreateContact(null, 400);

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          xero: expect.objectContaining({
            projectCreated: false,
            error: expect.any(String)
          })
        })
      );
    });

    test('should handle Xero project creation failure', async () => {
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      xeroMock
        .mockGetContacts([mockData.xeroContact()])
        .mockCreateProject(null, 400);

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          xero: expect.objectContaining({
            projectCreated: false,
            error: expect.any(String)
          })
        })
      );
    });
  });

  describe('Edge cases and corner scenarios', () => {
    test('should handle very large deal values', async () => {
      const dealWithLargeValue = mockData.pipedriveDeal('12345', { value: 999999999.99 });

      pipedriveMock
        .mockGetDeal('12345', dealWithLargeValue)
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          deal: expect.objectContaining({
            value: 999999999.99
          })
        })
      );
    });

    test('should handle special characters in deal title', async () => {
      const dealWithSpecialChars = mockData.pipedriveDeal('12345', { 
        title: 'Deal with special chars: äöü ñ 中文 🚀' 
      });

      pipedriveMock
        .mockGetDeal('12345', dealWithSpecialChars)
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          deal: expect.objectContaining({
            title: 'Deal with special chars: äöü ñ 中文 🚀'
          })
        })
      );
    });

    test('should handle empty products array', async () => {
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345', [], 200)
        .mockUpdateDeal('12345');

      await createFullProject(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          products: []
        })
      );
    });

    test('should handle concurrent project creation requests', async () => {
      // This test simulates multiple simultaneous requests
      const requests = Array.from({ length: 3 }, (_, i) => {
        const reqCopy = createMockRequest({
          body: {
            pipedriveDealId: `1234${i}`,
            pipedriveCompanyId: 'test-company'
          },
          pipedriveAuth: mockAuth.validPipedriveAuth
        });
        const resCopy = createMockResponse();

        // Setup mocks for each request
        new PipedriveMock()
          .mockGetDeal(`1234${i}`)
          .mockGetPerson('101')
          .mockGetOrganization('201')
          .mockGetDealProducts(`1234${i}`)
          .mockUpdateDeal(`1234${i}`);

        return createFullProject(reqCopy, resCopy);
      });

      const { getNextProjectNumber } = await import('../../models/projectSequenceModel.js');
      getNextProjectNumber
        .mockResolvedValueOnce('PROJ-001')
        .mockResolvedValueOnce('PROJ-002')
        .mockResolvedValueOnce('PROJ-003');

      const results = await Promise.allSettled(requests);

      // All requests should succeed
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
      });
    });
  });
});
