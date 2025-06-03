/**
 * Unit tests for project helper functions
 * Tests individual helper functions in isolation
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock external services using unstable_mockModule for ES modules
jest.unstable_mockModule('../../services/tokenService.js', () => ({
  allCompanyTokens: {},
  allXeroTokens: {},
  refreshPipedriveToken: jest.fn(),
  refreshXeroToken: jest.fn()
}));

jest.unstable_mockModule('../../services/pipedriveApiService.js', () => ({
  getDealDetails: jest.fn(),
  getPersonDetails: jest.fn(),
  getOrganizationDetails: jest.fn(),
  getDealProducts: jest.fn(),
  updateDealWithProjectNumber: jest.fn()
}));

jest.unstable_mockModule('../../services/xeroApiService.js', () => ({
  findXeroContactByName: jest.fn(),
  createXeroContact: jest.fn(),
  createXeroProject: jest.fn()
}));

jest.unstable_mockModule('../../models/projectSequenceModel.js', () => ({
  getNextProjectNumber: jest.fn()
}));

// Import the modules after mocking
const {
  validateProjectCreationRequest,
  validateAndRefreshPipedriveTokens,
  fetchAndValidateDeal,
  generateProjectNumber,
  handleXeroIntegration,
  fetchDealRelatedData,
  updateDealWithProjectNumber,
  createEnhancedDealObject
} = await import('../projectHelpers.js');

const {
  PipedriveMock,
  XeroMock,
  mockAuth,
  mockData,
  createMockRequest,
  cleanupMocks
} = await import('../../__tests__/testUtils.js');

describe('Project Helpers Unit Tests', () => {
  let req;
  let pipedriveMock;
  let xeroMock;

  beforeEach(() => {
    req = createMockRequest();
    pipedriveMock = new PipedriveMock();
    xeroMock = new XeroMock();
  });

  afterEach(() => {
    cleanupMocks();
    jest.clearAllMocks();
  });

  describe('validateProjectCreationRequest', () => {
    test('should validate valid request body', () => {
      const body = {
        pipedriveDealId: '12345',
        pipedriveCompanyId: 'test-company'
      };

      const result = validateProjectCreationRequest(body, req);

      expect(result).toEqual({
        dealId: '12345',
        companyId: 'test-company',
        existingProjectNumberToLink: undefined
      });
    });

    test('should validate request with existing project number', () => {
      const body = {
        pipedriveDealId: '12345',
        pipedriveCompanyId: 'test-company',
        existingProjectNumberToLink: 'PROJ-001'
      };

      const result = validateProjectCreationRequest(body, req);

      expect(result).toEqual({
        dealId: '12345',
        companyId: 'test-company',
        existingProjectNumberToLink: 'PROJ-001'
      });
    });

    test('should throw error for missing fields', () => {
      const body = { pipedriveCompanyId: 'test-company' };

      expect(() => validateProjectCreationRequest(body, req)).toThrow('Deal ID and Company ID are required');
    });

    test('should throw error for missing pipedriveCompanyId', () => {
      const body = { pipedriveDealId: '12345' };

      expect(() => validateProjectCreationRequest(body, req)).toThrow('Deal ID and Company ID are required');
    });
  });

  describe('validateAndRefreshPipedriveTokens', () => {
    test('should return valid tokens when not expired', async () => {
      const tokenService = await import('../../services/tokenService.js');
      tokenService.allCompanyTokens['test-company'] = mockAuth.validPipedriveAuth;

      const result = await validateAndRefreshPipedriveTokens('test-company', req);

      expect(result).toEqual(mockAuth.validPipedriveAuth);
    });

    test('should refresh expired tokens', async () => {
      const tokenService = await import('../../services/tokenService.js');
      tokenService.allCompanyTokens['test-company'] = mockAuth.expiredPipedriveAuth;
      tokenService.refreshPipedriveToken.mockResolvedValue(mockAuth.validPipedriveAuth);

      const result = await validateAndRefreshPipedriveTokens('test-company', req);

      expect(tokenService.refreshPipedriveToken).toHaveBeenCalledWith('test-company');
      expect(result).toEqual(mockAuth.validPipedriveAuth);
    });

    test('should throw error when no tokens exist', async () => {
      const tokenService = await import('../../services/tokenService.js');
      tokenService.allCompanyTokens['test-company'] = undefined;

      await expect(validateAndRefreshPipedriveTokens('test-company', req))
        .rejects.toThrow('Pipedrive not authenticated');
    });
  });

  describe('fetchAndValidateDeal', () => {
    test('should fetch and validate deal successfully', async () => {
      const mockDeal = mockData.pipedriveDeal('12345');
      const pipedriveService = await import('../../services/pipedriveApiService.js');
      pipedriveService.getDealDetails.mockResolvedValue(mockDeal);
      
      // Mock the environment variable
      process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT = 'custom_fields';

      const result = await fetchAndValidateDeal(
        'api.pipedrive.com',
        'valid-token',
        '12345',
        req
      );

      expect(result.dealDetails).toEqual(mockDeal);
    });

    test('should throw error for missing deal', async () => {
      const pipedriveService = await import('../../services/pipedriveApiService.js');
      pipedriveService.getDealDetails.mockResolvedValue(null);

      await expect(fetchAndValidateDeal(
        'api.pipedrive.com',
        'valid-token',
        '12345',
        req
      )).rejects.toThrow('Deal with ID 12345 not found');
    });
  });

  describe('generateProjectNumber', () => {
    test('should generate new project number', async () => {
      const projectModel = await import('../../models/projectSequenceModel.js');
      projectModel.getNextProjectNumber.mockResolvedValue('ENG-001');

      const result = await generateProjectNumber('12345', 'Engineering', null, req);

      expect(result).toBe('ENG-001');
      expect(projectModel.getNextProjectNumber).toHaveBeenCalled();
    });

    test('should return existing project number when linking', async () => {
      const projectModel = await import('../../models/projectSequenceModel.js');
      projectModel.getNextProjectNumber.mockResolvedValue('EXISTING-001');

      const result = await generateProjectNumber('12345', 'Engineering', 'EXISTING-001', req);

      expect(result).toBe('EXISTING-001');
    });

    test('should handle project sequence generation error', async () => {
      const projectModel = await import('../../models/projectSequenceModel.js');
      projectModel.getNextProjectNumber.mockRejectedValue(new Error('Database error'));

      await expect(generateProjectNumber('12345', 'Engineering', null, req))
        .rejects.toThrow('Failed to generate project number');
    });
  });

  describe('handleXeroIntegration', () => {
    test('should handle missing Xero authentication', async () => {
      const tokenService = await import('../../services/tokenService.js');
      tokenService.allXeroTokens['test-company'] = undefined;

      const mockDeal = mockData.pipedriveDeal('12345');

      const result = await handleXeroIntegration(
        'test-company',
        mockDeal,
        'PROJ-001',
        '12345',
        'api.pipedrive.com',
        'valid-token',
        req
      );

      expect(result.projectCreated).toBe(false);
    });
  });

  describe('fetchDealRelatedData', () => {
    test('should fetch person, organization and products', async () => {
      const mockDeal = mockData.pipedriveDeal('12345');
      const mockPerson = mockData.pipedrivePerson('101');
      const mockOrg = mockData.pipedriveOrganization('201');
      const mockProducts = mockData.dealProducts('12345');

      const pipedriveService = await import('../../services/pipedriveApiService.js');
      pipedriveService.getPersonDetails.mockResolvedValue(mockPerson);
      pipedriveService.getOrganizationDetails.mockResolvedValue(mockOrg);
      pipedriveService.getDealProducts.mockResolvedValue(mockProducts);

      const result = await fetchDealRelatedData(
        'api.pipedrive.com',
        'valid-token',
        mockDeal,
        '12345',
        req
      );

      expect(result.personDetails).toEqual(mockPerson);
      expect(result.orgDetails).toEqual(mockOrg);
      expect(result.dealProducts).toEqual(mockProducts);
    });

    test('should handle missing person gracefully', async () => {
      const mockDeal = mockData.pipedriveDeal('12345', { person_id: null });
      const mockOrg = mockData.pipedriveOrganization('201');
      const mockProducts = mockData.dealProducts('12345');

      const pipedriveService = await import('../../services/pipedriveApiService.js');
      pipedriveService.getOrganizationDetails.mockResolvedValue(mockOrg);
      pipedriveService.getDealProducts.mockResolvedValue(mockProducts);

      const result = await fetchDealRelatedData(
        'api.pipedrive.com',
        'valid-token',
        mockDeal,
        '12345',
        req
      );

      expect(result.personDetails).toBeNull();
      expect(result.orgDetails).toEqual(mockOrg);
      expect(result.dealProducts).toEqual(mockProducts);
    });
  });

  describe('updateDealWithProjectNumber', () => {
    test('should update deal with project number', async () => {
      const pipedriveService = await import('../../services/pipedriveApiService.js');
      pipedriveService.updateDealWithProjectNumber.mockResolvedValue({ success: true });

      await updateDealWithProjectNumber(
        'api.pipedrive.com',
        'valid-token',
        '12345',
        'PROJ-001',
        req
      );

      expect(pipedriveService.updateDealWithProjectNumber).toHaveBeenCalledWith(
        'api.pipedrive.com',
        'valid-token',
        '12345',
        'PROJ-001'
      );
    });

    test('should handle update failure', async () => {
      const pipedriveService = await import('../../services/pipedriveApiService.js');
      pipedriveService.updateDealWithProjectNumber.mockRejectedValue(new Error('Update failed'));

      // This function doesn't throw - it just logs warnings
      await updateDealWithProjectNumber(
        'api.pipedrive.com',
        'valid-token',
        '12345',
        'PROJ-001',
        req
      );

      expect(pipedriveService.updateDealWithProjectNumber).toHaveBeenCalled();
    });
  });

  describe('createEnhancedDealObject', () => {
    test('should create enhanced deal object', () => {
      const mockDeal = mockData.pipedriveDeal('12345');
      
      const result = createEnhancedDealObject(mockDeal, 'Engineering', 'PROJ-001');

      expect(result).toEqual({
        ...mockDeal,
        department: 'Engineering',
        vessel_name: null,
        sales_in_charge: null,
        location: null,
        projectNumber: 'PROJ-001'
      });
    });

    test('should handle minimal deal data', () => {
      const minimalDeal = { id: '12345', title: 'Minimal Deal' };
      
      const result = createEnhancedDealObject(minimalDeal, 'Engineering', 'PROJ-001');

      expect(result).toEqual({
        id: '12345',
        title: 'Minimal Deal',
        department: 'Engineering',
        vessel_name: null,
        sales_in_charge: null,
        location: null,
        projectNumber: 'PROJ-001'
      });
    });
  });
});