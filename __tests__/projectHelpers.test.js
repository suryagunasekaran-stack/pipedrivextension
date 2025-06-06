import { jest } from '@jest/globals';

// ESM-compatible mocking
const mockSecureTokenService = {
    getAuthToken: jest.fn(),
    refreshPipedriveToken: jest.fn(),
    refreshXeroToken: jest.fn()
};

const mockPipedriveApiService = {
    getDealDetails: jest.fn(),
    getOrganizationDetails: jest.fn(),
    getPersonDetails: jest.fn(),
    getDealProducts: jest.fn(),
    updateDealWithProjectNumber: jest.fn()
};

const mockXeroApiService = {
    findXeroContactByName: jest.fn(),
    createXeroContact: jest.fn(),
    createXeroProject: jest.fn(),
    createXeroTask: jest.fn(),
    getXeroQuotes: jest.fn(),
    acceptXeroQuote: jest.fn()
};

const mockProjectSequenceModel = {
    getNextProjectNumber: jest.fn()
};

const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
};

// Mock all modules
await jest.unstable_mockModule('../services/secureTokenService.js', () => mockSecureTokenService);
await jest.unstable_mockModule('../services/pipedriveApiService.js', () => mockPipedriveApiService);
await jest.unstable_mockModule('../services/xeroApiService.js', () => mockXeroApiService);
await jest.unstable_mockModule('../models/projectSequenceModel.js', () => mockProjectSequenceModel);
await jest.unstable_mockModule('../lib/logger.js', () => ({ default: mockLogger }));

const projectHelpers = await import('../utils/projectHelpers.js');

describe('Project Helpers - Business Logic Tests', () => {
    let mockReq;
    
    beforeEach(() => {
        mockReq = { id: 'test-123' };
        process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT = 'department';
        process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME = 'vessel_name';
        process.env.PIPEDRIVE_PROJECT_NUMBER_CUSTOM_FIELD_KEY = 'project_number';
        
        // Reset all mocks
        jest.clearAllMocks();
    });

    describe('validateProjectCreationRequest', () => {
        test('should validate request with all required parameters', () => {
            const requestBody = {
                pipedriveDealId: '12345',
                pipedriveCompanyId: '67890',
                existingProjectNumberToLink: 'NY25001'
            };

            const result = projectHelpers.validateProjectCreationRequest(requestBody, mockReq);

            expect(result).toEqual({
                dealId: '12345',
                companyId: '67890',
                existingProjectNumberToLink: 'NY25001'
            });
        });

        test('should throw error when required parameters are missing', () => {
            const requestBody = {
                pipedriveCompanyId: '67890'
            };

            expect(() => projectHelpers.validateProjectCreationRequest(requestBody, mockReq))
                .toThrow('Deal ID and Company ID are required in the request body.');
        });

        test('should handle empty strings as missing values', () => {
            const requestBody = {
                pipedriveDealId: '',
                pipedriveCompanyId: '67890'
            };

            expect(() => projectHelpers.validateProjectCreationRequest(requestBody, mockReq))
                .toThrow('Deal ID and Company ID are required in the request body.');
        });
    });

    describe('fetchAndValidateDeal', () => {
        test('should fetch and validate deal with department', async () => {
            const mockDeal = {
                id: 'deal-1',
                value: 1000,
                org_id: { value: 'org-123' },
                [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: 'Navy',
                [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: 'Test Vessel'
            };
            mockPipedriveApiService.getDealDetails.mockResolvedValue(mockDeal);
    
            const result = await projectHelpers.fetchAndValidateDeal('api', 'token', 'deal-1', mockReq);
            expect(result.dealDetails).toEqual(mockDeal);
            expect(result.departmentName).toBe('Navy');
        });
    
        test('should throw error when deal is not found', async () => {
            mockPipedriveApiService.getDealDetails.mockResolvedValue(null);
            await expect(projectHelpers.fetchAndValidateDeal('api', 'token', 'deal-1', mockReq))
                .rejects.toThrow('Deal with ID deal-1 not found.');
        });
    
        test('should throw error when department is missing', async () => {
            const mockDeal = { 
                id: 'deal-1',
                value: 1000,
                org_id: { value: 'org-123' },
                [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: 'Test Vessel'
                // Missing department
            };
            mockPipedriveApiService.getDealDetails.mockResolvedValue(mockDeal);
            await expect(projectHelpers.fetchAndValidateDeal('api', 'token', 'deal-1', mockReq))
                .rejects.toThrow('Department is required for project creation');
        });

        test('should throw error when department custom field key is not defined', async () => {
            delete process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT;
            const mockDeal = { 
                id: 'deal-1',
                value: 1000,
                org_id: { value: 'org-123' },
                [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: 'Test Vessel'
            };
            mockPipedriveApiService.getDealDetails.mockResolvedValue(mockDeal);
            await expect(projectHelpers.fetchAndValidateDeal('api', 'token', 'deal-1', mockReq))
                .rejects.toThrow('Department is required for project creation');
        });

        test('should throw error when deal fails business validation', async () => {
            const mockDeal = { 
                id: 'deal-1',
                // Missing value
                org_id: { value: 'org-123' },
                [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: 'Navy',
                [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: 'Test Vessel'
            };
            mockPipedriveApiService.getDealDetails.mockResolvedValue(mockDeal);
            await expect(projectHelpers.fetchAndValidateDeal('api', 'token', 'deal-1', mockReq))
                .rejects.toThrow('Deal value is required');
        });
    });

    describe('generateProjectNumber', () => {
        test('should generate new project number', async () => {
            const mockProjectNumber = 'NY25001';
            mockProjectSequenceModel.getNextProjectNumber.mockResolvedValue(mockProjectNumber);

            const result = await projectHelpers.generateProjectNumber(
                '12345',
                'Navy',
                null,
                mockReq
            );

            expect(result).toBe(mockProjectNumber);
            expect(mockProjectSequenceModel.getNextProjectNumber).toHaveBeenCalledWith(
                '12345',
                'Navy',
                null
            );
        });

        test('should handle existing project number linking', async () => {
            const existingNumber = 'NY25001';
            mockProjectSequenceModel.getNextProjectNumber.mockResolvedValue(existingNumber);

            const result = await projectHelpers.generateProjectNumber(
                '12345',
                'Navy',
                existingNumber,
                mockReq
            );

            expect(result).toBe(existingNumber);
            expect(mockProjectSequenceModel.getNextProjectNumber).toHaveBeenCalledWith(
                '12345',
                'Navy',
                existingNumber
            );
        });

        test('should handle project number generation errors', async () => {
            mockProjectSequenceModel.getNextProjectNumber.mockRejectedValue(new Error('Database error'));

            await expect(projectHelpers.generateProjectNumber(
                '12345',
                'Navy',
                null,
                mockReq
            )).rejects.toThrow('Failed to generate project number.');
        });
    });

    describe('createOrFindXeroContact', () => {
        test('should find existing Xero contact', async () => {
            const mockDeal = {
                org_id: { value: '67890' }
            };
            const mockOrg = {
                name: 'Test Company'
            };
            const mockContact = {
                ContactID: 'xero-123',
                Name: 'Test Company'
            };

            mockPipedriveApiService.getOrganizationDetails.mockResolvedValue(mockOrg);
            mockXeroApiService.findXeroContactByName.mockResolvedValue(mockContact);

            const result = await projectHelpers.createOrFindXeroContact(
                'xero-token',
                'tenant-123',
                mockDeal,
                'api.pipedrive.com',
                'pipedrive-token',
                mockReq
            );

            expect(result).toBe('xero-123');
        });

        test('should create new Xero contact when not found', async () => {
            const mockDeal = {
                org_id: { value: '67890' },
                person_id: { value: '12345' }
            };
            const mockOrg = {
                name: 'Test Company'
            };
            const mockPerson = {
                email: [{ value: 'test@company.com' }]
            };
            const mockNewContact = {
                ContactID: 'xero-123',
                Name: 'Test Company'
            };

            mockPipedriveApiService.getOrganizationDetails.mockResolvedValue(mockOrg);
            mockPipedriveApiService.getPersonDetails.mockResolvedValue(mockPerson);
            mockXeroApiService.findXeroContactByName.mockResolvedValue(null);
            mockXeroApiService.createXeroContact.mockResolvedValue(mockNewContact);

            const result = await projectHelpers.createOrFindXeroContact(
                'xero-token',
                'tenant-123',
                mockDeal,
                'api.pipedrive.com',
                'pipedrive-token',
                mockReq
            );

            expect(result).toBe('xero-123');
            expect(mockXeroApiService.createXeroContact).toHaveBeenCalledWith(
                'xero-token',
                'tenant-123',
                {
                    name: 'Test Company',
                    email: 'test@company.com',
                    isCustomer: true
                }
            );
        });

        test('should return null when deal has no organization', async () => {
            const result = await projectHelpers.createOrFindXeroContact('xero-token', 'tenant-123', {}, 'api', 'token', mockReq);
            expect(result).toBeNull();
        });

        test('should return null when organization details are incomplete', async () => {
            const dealDetails = { org_id: { value: 'org-1' } };
            mockPipedriveApiService.getOrganizationDetails.mockResolvedValue({ id: 'org-1' /* no name */ });
    
            const result = await projectHelpers.createOrFindXeroContact('xero-token', 'tenant-123', dealDetails, 'api', 'token', mockReq);
            expect(result).toBeNull();
        });
    
        test('should handle errors during Pipedrive API calls gracefully', async () => {
            const dealDetails = { org_id: { value: 'org-1' } };
            mockPipedriveApiService.getOrganizationDetails.mockRejectedValue(new Error('Pipedrive API Error'));
    
            await expect(projectHelpers.createOrFindXeroContact('xero-token', 'tenant-123', dealDetails, 'api', 'token', mockReq))
                .rejects.toThrow('Pipedrive API Error');
        });

        test('should handle error in getPersonDetails gracefully', async () => {
            mockPipedriveApiService.getOrganizationDetails.mockResolvedValue({ name: 'Org' });
            mockXeroApiService.findXeroContactByName.mockResolvedValue(null);
            mockXeroApiService.createXeroContact.mockResolvedValue({ ContactID: 'C2', Name: 'Org' });
            mockPipedriveApiService.getPersonDetails.mockRejectedValue(new Error('fail'));
            const dealDetails = { org_id: { value: 1 }, person_id: { value: 2 } };
            const result = await projectHelpers.createOrFindXeroContact('token', 'tenant', dealDetails, 'api', 'token', {});
            expect(result).toBe('C2');
        });
    });

    describe('createEnhancedDealObject', () => {
        test('should enhance deal object with department and project number', () => {
            const mockDeal = {
                id: '12345',
                title: 'Test Deal',
                value: 1000
            };

            const result = projectHelpers.createEnhancedDealObject(
                mockDeal,
                'Navy',
                'NY25001'
            );

            expect(result).toEqual({
                ...mockDeal,
                department: 'Navy',
                projectNumber: 'NY25001',
                enhancedAt: expect.any(String)
            });
        });

        test('should handle empty deal object', () => {
            const result = projectHelpers.createEnhancedDealObject(
                {},
                'Navy',
                'NY25001'
            );

            expect(result).toEqual({
                department: 'Navy',
                projectNumber: 'NY25001',
                enhancedAt: expect.any(String)
            });
        });

        test('should handle null/undefined values', () => {
            const result = projectHelpers.createEnhancedDealObject(
                null,
                'Navy',
                'NY25001'
            );

            expect(result).toEqual({
                department: 'Navy',
                projectNumber: 'NY25001',
                enhancedAt: expect.any(String)
            });
        });
    });
});

describe('handleXeroIntegration', () => {
    let req;
    const baseDealDetails = {
        value: 1000,
        expected_close_date: '2025-01-01T00:00:00.000Z',
        org_id: { value: 'org-1' },
        person_id: { value: 'person-1' }
    };

    beforeEach(() => {
        req = {
            id: 'test-123',
            xeroAuth: {
                accessToken: 'xero-access-token',
                tenantId: 'tenant-123',
            }
        };
        // Default success path mocks
        mockSecureTokenService.getAuthToken.mockResolvedValue({ tokenExpiresAt: Date.now() + 3600000 });
        mockPipedriveApiService.getOrganizationDetails.mockResolvedValue({ name: 'Test Org' });
        
        mockXeroApiService.findXeroContactByName.mockResolvedValue(null); 
        mockXeroApiService.createXeroContact.mockResolvedValue({ ContactID: 'contact-new' });

        mockXeroApiService.createXeroProject.mockResolvedValue({ ProjectID: 'proj-1' });
        mockXeroApiService.createXeroTask.mockResolvedValue({ TaskID: 'task-1' });
        mockPipedriveApiService.getDealProducts.mockResolvedValue([
            { name: 'Product A', sum: 500, quantity: 1 },
            { name: 'Product B', sum: 500, quantity: 2 }
        ]);
        jest.clearAllMocks();
    });

    test('should successfully create project, tasks, and accept quote', async () => {
        process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY = 'quoteNum';
        const dealDetails = { ...baseDealDetails, quoteNum: 'Q-123' };
        
        mockXeroApiService.getXeroQuotes.mockResolvedValue({ Quotes: [{ QuoteID: 'Q1', QuoteNumber: 'Q-123', Status: 'SENT' }]});
        mockXeroApiService.acceptXeroQuote.mockResolvedValue({ Status: 'ACCEPTED' });

        // Ensure contact is found for this test
        mockXeroApiService.findXeroContactByName.mockResolvedValue({ ContactID: 'contact-1' });
        // Mock the successful project creation
        mockXeroApiService.createXeroProject.mockResolvedValue({ ProjectID: 'proj-1' });

        const result = await projectHelpers.handleXeroIntegration('company-1', dealDetails, 'PN-1', 'deal-1', 'api', 'token', req);
        
        expect(mockXeroApiService.createXeroProject).toHaveBeenCalled();
        expect(mockPipedriveApiService.getDealProducts).toHaveBeenCalled();
        expect(mockXeroApiService.createXeroTask).toHaveBeenCalledTimes(2);
        expect(mockXeroApiService.acceptXeroQuote).toHaveBeenCalled();
        expect(result).toEqual(expect.objectContaining({
            projectCreated: true,
            projectId: 'proj-1',
            tasks: expect.any(Array),
            quote: { accepted: true, quoteId: 'Q1', error: null }
        }));
        expect(result.tasks.length).toBe(2);
    });
    
    test('should return early if no xeroAuth on req', async () => {
        const result = await projectHelpers.handleXeroIntegration('company-1', {}, 'PN-1', 'deal-1', 'api', 'token', {});
        expect(result).toEqual({
            projectCreated: false,
            message: 'Xero not authenticated for this company'
        });
    });

    test('should handle expired Xero token and refresh failure', async () => {
        mockSecureTokenService.getAuthToken.mockResolvedValue({ tokenExpiresAt: Date.now() - 1000 });
        mockSecureTokenService.refreshXeroToken.mockRejectedValue(new Error('refresh failed'));
        
        const result = await projectHelpers.handleXeroIntegration('company-1', {}, 'PN-1', 'deal-1', 'api', 'token', req);
        expect(result).toEqual({
            projectCreated: false,
            error: 'Failed to refresh Xero token',
            message: 'Xero token expired and refresh failed'
        });
    });

    test('should handle missing Xero contact', async () => {
        mockXeroApiService.findXeroContactByName.mockResolvedValue(null);
        mockXeroApiService.createXeroContact.mockResolvedValue(null); // Simulate creation failure
        
        const result = await projectHelpers.handleXeroIntegration('company-1', baseDealDetails, 'PN-1', 'deal-1', 'api', 'token', req);
        expect(result).toEqual({
            projectCreated: false,
            message: 'Could not create or find Xero contact for project creation'
        });
    });

    test('should handle Xero project creation failure', async () => {
        mockXeroApiService.createXeroProject.mockResolvedValue(null);
        
        const result = await projectHelpers.handleXeroIntegration('company-1', baseDealDetails, 'PN-1', 'deal-1', 'api', 'token', req);
        expect(result).toEqual({
            projectCreated: false,
            error: 'Project creation response missing ProjectID'
        });
    });

    test('should handle Xero task creation errors gracefully', async () => {
        mockXeroApiService.createXeroTask.mockRejectedValue(new Error('task error'));
        
        const result = await projectHelpers.handleXeroIntegration('company-1', baseDealDetails, 'PN-1', 'deal-1', 'api', 'token', req);
        expect(result.projectCreated).toBe(true);
        expect(result.projectId).toBe('proj-1');
        expect(result.tasks.length).toBe(0);
    });

    test('should handle quote acceptance error gracefully', async () => {
        process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY = 'quoteNum';
        const dealDetails = { ...baseDealDetails, quoteNum: 'Q-123' };
        mockXeroApiService.findXeroContactByName.mockResolvedValue({ ContactID: 'contact-1' });
        mockXeroApiService.createXeroProject.mockResolvedValue({ ProjectID: 'proj-1' });
        mockXeroApiService.getXeroQuotes.mockResolvedValue({ Quotes: [{ QuoteID: 'Q1', QuoteNumber: 'Q-123', Status: 'SENT' }]});
        mockXeroApiService.acceptXeroQuote.mockRejectedValue(new Error('Accept failed'));
        
        const result = await projectHelpers.handleXeroIntegration('company-1', dealDetails, 'PN-1', 'deal-1', 'api', 'token', req);
        
        expect(result.projectCreated).toBe(true);
        expect(result.quote).toEqual({ accepted: false, error: 'Accept failed' });
    });

    test('should skip quote logic if quote custom field is not configured', async () => {
        delete process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
        mockXeroApiService.findXeroContactByName.mockResolvedValue({ ContactID: 'contact-1' });
        mockXeroApiService.createXeroProject.mockResolvedValue({ ProjectID: 'proj-1' });
        const result = await projectHelpers.handleXeroIntegration('company-1', baseDealDetails, 'PN-1', 'deal-1', 'api', 'token', req);

        expect(mockXeroApiService.getXeroQuotes).not.toHaveBeenCalled();
        expect(result.projectCreated).toBe(true);
        expect(result.quote).toBeUndefined();
    });

    test('should handle general errors during execution', async () => {
        mockPipedriveApiService.getOrganizationDetails.mockRejectedValue(new Error('A critical failure'));
        const result = await projectHelpers.handleXeroIntegration('company-1', baseDealDetails, 'PN-1', 'deal-1', 'api', 'token', req);
        expect(result).toEqual({
            projectCreated: false,
            error: 'A critical failure'
        });
    });

    test('should handle invalid quotes response format', async () => {
        process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY = 'quoteNum';
        const dealDetails = { ...baseDealDetails, quoteNum: 'Q-123' };
        mockXeroApiService.findXeroContactByName.mockResolvedValue({ ContactID: 'contact-1' });
        mockXeroApiService.createXeroProject.mockResolvedValue({ ProjectID: 'proj-1' });
        mockXeroApiService.getXeroQuotes.mockResolvedValue(null); // Invalid response
        
        const result = await projectHelpers.handleXeroIntegration('company-1', dealDetails, 'PN-1', 'deal-1', 'api', 'token', req);
        expect(result.projectCreated).toBe(true);
        expect(result.quote).toEqual({ accepted: false, error: 'Invalid quotes response format' });
    });

    test('should handle no matching quote found', async () => {
        process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY = 'quoteNum';
        const dealDetails = { ...baseDealDetails, quoteNum: 'Q-123' };
        mockXeroApiService.findXeroContactByName.mockResolvedValue({ ContactID: 'contact-1' });
        mockXeroApiService.createXeroProject.mockResolvedValue({ ProjectID: 'proj-1' });
        mockXeroApiService.getXeroQuotes.mockResolvedValue({ Quotes: [] }); // No matching quote
        
        const result = await projectHelpers.handleXeroIntegration('company-1', dealDetails, 'PN-1', 'deal-1', 'api', 'token', req);
        expect(result.projectCreated).toBe(true);
        expect(result.quote).toEqual({ accepted: false, error: 'No matching sent quote found' });
    });
});

describe('fetchDealRelatedData', () => {
    test('should fetch all related data successfully', async () => {
        mockPipedriveApiService.getPersonDetails.mockResolvedValue({ id: 1 });
        mockPipedriveApiService.getOrganizationDetails.mockResolvedValue({ id: 2 });
        mockPipedriveApiService.getDealProducts.mockResolvedValue([{ id: 3 }]);
        
        const dealDetails = { person_id: { value: 1 }, org_id: { value: 2 } };
        const result = await projectHelpers.fetchDealRelatedData('api', 'token', dealDetails, 'deal-1', {});
        expect(result.personDetails).toEqual({ id: 1 });
        expect(result.orgDetails).toEqual({ id: 2 });
        expect(result.dealProducts).toEqual([{ id: 3 }]);
    });

    test('should handle errors in fetching person/org/products', async () => {
        mockPipedriveApiService.getPersonDetails.mockRejectedValue(new Error('fail'));
        mockPipedriveApiService.getOrganizationDetails.mockRejectedValue(new Error('fail'));
        mockPipedriveApiService.getDealProducts.mockRejectedValue(new Error('fail'));
        
        const dealDetails = { person_id: { value: 1 }, org_id: { value: 2 } };
        const result = await projectHelpers.fetchDealRelatedData('api', 'token', dealDetails, 'deal-1', {});
        expect(result.personDetails).toBeNull();
        expect(result.orgDetails).toBeNull();
        expect(result.dealProducts).toEqual([]);
    });

    test('should handle errors during Pipedrive API calls gracefully', async () => {
        const dealDetails = { org_id: { value: 'org-1' } };
        mockPipedriveApiService.getOrganizationDetails.mockRejectedValue(new Error('Pipedrive API Error'));
    
        const result = await projectHelpers.fetchDealRelatedData('api', 'token', dealDetails, 'deal-1', {});
        expect(result.orgDetails).toBeNull();
    });
});

describe('updateDealWithProjectNumber', () => {
    test('should update deal successfully', async () => {
        mockPipedriveApiService.updateDealWithProjectNumber.mockResolvedValue();
        await expect(projectHelpers.updateDealWithProjectNumber('api', 'token', 'deal-1', 'PN-1', {}))
            .resolves.toBeUndefined();
    });

    test('should handle update errors gracefully', async () => {
        mockPipedriveApiService.updateDealWithProjectNumber.mockRejectedValue(new Error('fail'));
        await expect(projectHelpers.updateDealWithProjectNumber('api', 'token', 'deal-1', 'PN-1', {}))
            .resolves.toBeUndefined();
    });
});

describe('validateAndRefreshPipedriveTokens', () => {
    let req;
    beforeEach(() => {
        req = { id: 'test-123' };
        jest.clearAllMocks();
    });

    test('should return valid tokens when not expired', async () => {
        const mockTokens = {
            accessToken: 'valid-token',
            tokenExpiresAt: Date.now() + 3600000 // 1 hour from now
        };
        mockSecureTokenService.getAuthToken.mockResolvedValue(mockTokens);

        const result = await projectHelpers.validateAndRefreshPipedriveTokens('company-1', req);
        expect(result).toEqual(mockTokens);
    });

    test('should throw error when no tokens exist', async () => {
        mockSecureTokenService.getAuthToken.mockResolvedValue(null);

        await expect(projectHelpers.validateAndRefreshPipedriveTokens('company-1', req))
            .rejects.toThrow('Pipedrive not authenticated for company company-1');
    });

    test('should throw error when access token is missing', async () => {
        mockSecureTokenService.getAuthToken.mockResolvedValue({
            tokenExpiresAt: Date.now() + 3600000
        });

        await expect(projectHelpers.validateAndRefreshPipedriveTokens('company-1', req))
            .rejects.toThrow('Pipedrive not authenticated for company company-1');
    });

    test('should refresh expired token successfully', async () => {
        const expiredTokens = {
            accessToken: 'expired-token',
            tokenExpiresAt: Date.now() - 1000 // 1 second ago
        };
        const refreshedTokens = {
            accessToken: 'new-token',
            tokenExpiresAt: Date.now() + 3600000
        };

        mockSecureTokenService.getAuthToken.mockResolvedValue(expiredTokens);
        mockSecureTokenService.refreshPipedriveToken.mockResolvedValue(refreshedTokens);

        const result = await projectHelpers.validateAndRefreshPipedriveTokens('company-1', req);
        expect(result).toEqual(refreshedTokens);
        expect(mockSecureTokenService.refreshPipedriveToken)
            .toHaveBeenCalledWith('company-1');
    });

    test('should throw error when token refresh fails', async () => {
        const expiredTokens = {
            accessToken: 'expired-token',
            tokenExpiresAt: Date.now() - 1000
        };

        mockSecureTokenService.getAuthToken.mockResolvedValue(expiredTokens);
        mockSecureTokenService.refreshPipedriveToken.mockRejectedValue(new Error('Refresh failed'));

        await expect(projectHelpers.validateAndRefreshPipedriveTokens('company-1', req))
            .rejects.toThrow('Failed to refresh Pipedrive token for company company-1');
    });
}); 