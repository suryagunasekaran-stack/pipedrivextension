/**
 * Unit tests for project helper functions
 * Tests individual helper functions in isolation
 */

const {
  validateProjectCreationRequest,
  validateAndRefreshPipedriveTokens,
  fetchAndValidateDeal,
  generateProjectNumber,
  handleXeroIntegration,
  fetchDealRelatedData,
  updateDealWithProjectNumber,
  createEnhancedDealObject
} = require('../projectHelpers.js');
const {
  PipedriveMock,
  XeroMock,
  mockAuth,
  mockData,
  createMockRequest,
  cleanupMocks
} = require('../../__tests__/testUtils.js');

// Mock external services - simplified for basic testing

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

    test('should throw error for missing pipedriveDealId', () => {
      const body = { pipedriveCompanyId: 'test-company' };

      expect(() => validateProjectCreationRequest(body, req)).toThrow('pipedriveDealId is required');
    });

    test('should throw error for invalid dealId format', () => {
      const body = {
        pipedriveDealId: 'invalid-id',
        pipedriveCompanyId: 'test-company'
      };

      expect(() => validateProjectCreationRequest(body, req)).toThrow('must be a valid integer');
    });

    test('should throw error for missing pipedriveCompanyId', () => {
      const body = { pipedriveDealId: '12345' };

      expect(() => validateProjectCreationRequest(body, req)).toThrow('pipedriveCompanyId is required');
    });
  });

  describe('validateAndRefreshPipedriveTokens', () => {
    test('should return valid tokens when not expired', async () => {
      const { allCompanyTokens } = await import('../../services/tokenService.js');
      allCompanyTokens['test-company'] = mockAuth.validPipedriveAuth;

      const result = await validateAndRefreshPipedriveTokens('test-company', req);

      expect(result).toEqual(mockAuth.validPipedriveAuth);
    });

    test('should refresh expired tokens', async () => {
      const { allCompanyTokens, refreshPipedriveToken } = await import('../../services/tokenService.js');
      allCompanyTokens['test-company'] = mockAuth.expiredPipedriveAuth;
      refreshPipedriveToken.mockResolvedValue(mockAuth.validPipedriveAuth);

      const result = await validateAndRefreshPipedriveTokens('test-company', req);

      expect(refreshPipedriveToken).toHaveBeenCalledWith('test-company');
      expect(result).toEqual(mockAuth.validPipedriveAuth);
    });

    test('should throw error when no tokens exist', async () => {
      const { allCompanyTokens } = await import('../../services/tokenService.js');
      allCompanyTokens['test-company'] = undefined;

      await expect(validateAndRefreshPipedriveTokens('test-company', req))
        .rejects.toThrow('Pipedrive not authenticated');
    });
  });

  describe('fetchAndValidateDeal', () => {
    test('should fetch and validate deal successfully', async () => {
      const mockDeal = mockData.pipedriveDeal('12345');
      pipedriveMock.mockGetDeal('12345', mockDeal);

      const { getDeal } = await import('../../services/pipedriveApiService.js');
      getDeal.mockResolvedValue(mockDeal);

      const result = await fetchAndValidateDeal(
        'api.pipedrive.com',
        'valid-token',
        '12345',
        req
      );

      expect(result.dealDetails).toEqual(mockDeal);
      expect(result.departmentName).toBe('Engineering');
    });

    test('should throw error for missing department', async () => {
      const mockDeal = mockData.pipedriveDeal('12345', {
        custom_fields: { department: null }
      });

      const { getDeal } = await import('../../services/pipedriveApiService.js');
      getDeal.mockResolvedValue(mockDeal);

      await expect(fetchAndValidateDeal(
        'api.pipedrive.com',
        'valid-token',
        '12345',
        req
      )).rejects.toThrow('department is required');
    });
  });

  describe('generateProjectNumber', () => {
    test('should generate new project number', async () => {
      const { getNextProjectNumber } = await import('../../models/projectSequenceModel.js');
      getNextProjectNumber.mockResolvedValue('ENG-001');

      const result = await generateProjectNumber('12345', 'Engineering', null, req);

      expect(result).toBe('ENG-001');
      expect(getNextProjectNumber).toHaveBeenCalledWith('Engineering');
    });

    test('should return existing project number when linking', async () => {
      const result = await generateProjectNumber('12345', 'Engineering', 'EXISTING-001', req);

      expect(result).toBe('EXISTING-001');
    });

    test('should handle project sequence generation error', async () => {
      const { getNextProjectNumber } = await import('../../models/projectSequenceModel.js');
      getNextProjectNumber.mockRejectedValue(new Error('Database error'));

      await expect(generateProjectNumber('12345', 'Engineering', null, req))
        .rejects.toThrow('Database error');
    });
  });

  describe('handleXeroIntegration', () => {
    test('should create Xero contact and project successfully', async () => {
      const mockDeal = mockData.pipedriveDeal('12345');
      const mockContact = mockData.xeroContact();
      const mockProject = mockData.xeroProject();

      const { 
        getXeroContacts, 
        createXeroContact, 
        createXeroProject 
      } = await import('../../services/xeroApiService.js');

      getXeroContacts.mockResolvedValue([]);
      createXeroContact.mockResolvedValue(mockContact);
      createXeroProject.mockResolvedValue(mockProject);

      const result = await handleXeroIntegration(
        'test-company',
        mockDeal,
        'PROJ-001',
        '12345',
        'api.pipedrive.com',
        'valid-token',
        req
      );

      expect(result.projectCreated).toBe(true);
      expect(result.contact).toEqual(mockContact);
      expect(result.project).toEqual(mockProject);
    });

    test('should handle missing Xero authentication', async () => {
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
      expect(result.message).toContain('not authenticated');
    });
  });

  describe('fetchDealRelatedData', () => {
    test('should fetch person, organization and products', async () => {
      const mockDeal = mockData.pipedriveDeal('12345');
      const mockPerson = mockData.pipedrivePerson('101');
      const mockOrg = mockData.pipedriveOrganization('201');
      const mockProducts = mockData.dealProducts('12345');

      const { 
        getPerson, 
        getOrganization, 
        getDealProducts 
      } = await import('../../services/pipedriveApiService.js');

      getPerson.mockResolvedValue(mockPerson);
      getOrganization.mockResolvedValue(mockOrg);
      getDealProducts.mockResolvedValue(mockProducts);

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

      const { 
        getOrganization, 
        getDealProducts 
      } = await import('../../services/pipedriveApiService.js');

      getOrganization.mockResolvedValue(mockOrg);
      getDealProducts.mockResolvedValue(mockProducts);

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
      const { updateDeal } = await import('../../services/pipedriveApiService.js');
      updateDeal.mockResolvedValue({ success: true });

      await updateDealWithProjectNumber(
        'api.pipedrive.com',
        'valid-token',
        '12345',
        'PROJ-001',
        req
      );

      expect(updateDeal).toHaveBeenCalledWith(
        'api.pipedrive.com',
        'valid-token',
        '12345',
        expect.objectContaining({
          custom_fields: expect.objectContaining({
            project_number: 'PROJ-001'
          })
        })
      );
    });

    test('should handle update failure', async () => {
      const { updateDeal } = await import('../../services/pipedriveApiService.js');
      updateDeal.mockRejectedValue(new Error('Update failed'));

      await expect(updateDealWithProjectNumber(
        'api.pipedrive.com',
        'valid-token',
        '12345',
        'PROJ-001',
        req
      )).rejects.toThrow('Update failed');
    });
  });

  describe('createEnhancedDealObject', () => {
    test('should create enhanced deal object', () => {
      const mockDeal = mockData.pipedriveDeal('12345');
      
      const result = createEnhancedDealObject(mockDeal, 'Engineering', 'PROJ-001');

      expect(result).toEqual({
        ...mockDeal,
        departmentName: 'Engineering',
        projectNumber: 'PROJ-001'
      });
    });

    test('should handle minimal deal data', () => {
      const minimalDeal = { id: '12345', title: 'Minimal Deal' };
      
      const result = createEnhancedDealObject(minimalDeal, 'Engineering', 'PROJ-001');

      expect(result).toEqual({
        id: '12345',
        title: 'Minimal Deal',
        departmentName: 'Engineering',
        projectNumber: 'PROJ-001'
      });
    });
  });
});