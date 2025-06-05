import { validateProjectCreationRequest, createEnhancedDealObject } from '../utils/projectHelpers.js';

describe('Project Helpers - Pure Business Logic Tests', () => {

    describe('validateProjectCreationRequest', () => {
        
        test('should successfully validate with all required parameters', () => {
            const requestBody = {
                pipedriveDealId: '12345',
                pipedriveCompanyId: '67890',
                existingProjectNumberToLink: 'NY25001'
            };
            const mockReq = { id: 'test-123' };

            const result = validateProjectCreationRequest(requestBody, mockReq);

            expect(result).toEqual({
                dealId: '12345',
                companyId: '67890',
                existingProjectNumberToLink: 'NY25001'
            });
        });

        test('should successfully validate without optional existingProjectNumberToLink', () => {
            const requestBody = {
                pipedriveDealId: '12345',
                pipedriveCompanyId: '67890'
            };
            const mockReq = { id: 'test-123' };

            const result = validateProjectCreationRequest(requestBody, mockReq);

            expect(result).toEqual({
                dealId: '12345',
                companyId: '67890',
                existingProjectNumberToLink: undefined
            });
        });

        test('should throw error when pipedriveDealId is missing', () => {
            const requestBody = {
                pipedriveCompanyId: '67890'
            };
            const mockReq = { id: 'test-123' };

            expect(() => validateProjectCreationRequest(requestBody, mockReq))
                .toThrow('Deal ID and Company ID are required in the request body.');
        });

        test('should throw error when pipedriveCompanyId is missing', () => {
            const requestBody = {
                pipedriveDealId: '12345'
            };
            const mockReq = { id: 'test-123' };

            expect(() => validateProjectCreationRequest(requestBody, mockReq))
                .toThrow('Deal ID and Company ID are required in the request body.');
        });

        test('should throw error when both required parameters are missing', () => {
            const requestBody = {
                existingProjectNumberToLink: 'NY25001'
            };
            const mockReq = { id: 'test-123' };

            expect(() => validateProjectCreationRequest(requestBody, mockReq))
                .toThrow('Deal ID and Company ID are required in the request body.');
        });

        test('should handle empty strings as missing values', () => {
            const requestBody = {
                pipedriveDealId: '',
                pipedriveCompanyId: '67890'
            };
            const mockReq = { id: 'test-123' };

            expect(() => validateProjectCreationRequest(requestBody, mockReq))
                .toThrow('Deal ID and Company ID are required in the request body.');
        });

        test('should handle numeric values correctly', () => {
            const requestBody = {
                pipedriveDealId: 12345,
                pipedriveCompanyId: 67890
            };
            const mockReq = { id: 'test-123' };

            const result = validateProjectCreationRequest(requestBody, mockReq);

            expect(result).toEqual({
                dealId: 12345,
                companyId: 67890,
                existingProjectNumberToLink: undefined
            });
        });
    });

    describe('createEnhancedDealObject', () => {
        
        test('should enhance deal object with department and project number', () => {
            const dealDetails = {
                id: '12345',
                title: 'Test Deal',
                value: 50000,
                currency: 'USD',
                stage_id: 1
            };
            const departmentName = 'Navy';
            const projectNumber = 'NY25001';

            const result = createEnhancedDealObject(dealDetails, departmentName, projectNumber);

            expect(result).toMatchObject({
                id: '12345',
                title: 'Test Deal',
                value: 50000,
                currency: 'USD',
                stage_id: 1,
                department: 'Navy',
                projectNumber: 'NY25001'
            });
            expect(result).toHaveProperty('enhancedAt');
            expect(typeof result.enhancedAt).toBe('string');
        });

        test('should preserve all original deal properties', () => {
            const dealDetails = {
                id: '98765',
                title: 'Complex Deal',
                value: 75000,
                currency: 'EUR',
                person_id: { value: 123, name: 'John Doe' },
                org_id: { value: 456, name: 'Test Corp' },
                custom_field: 'custom_value',
                nested: {
                    data: {
                        important: true
                    }
                }
            };
            const departmentName = 'Electrical';
            const projectNumber = 'EL25042';

            const result = createEnhancedDealObject(dealDetails, departmentName, projectNumber);

            expect(result).toMatchObject(dealDetails);
            expect(result.department).toBe('Electrical');
            expect(result.projectNumber).toBe('EL25042');
            expect(result.nested.data.important).toBe(true);
        });

        test('should handle empty deal object', () => {
            const dealDetails = {};
            const departmentName = 'Machining';
            const projectNumber = 'MC25001';

            const result = createEnhancedDealObject(dealDetails, departmentName, projectNumber);

            expect(result).toEqual({
                department: 'Machining',
                projectNumber: 'MC25001',
                enhancedAt: expect.any(String)
            });
        });

        test('should handle null/undefined values gracefully', () => {
            const dealDetails = {
                id: '11111',
                title: null,
                value: undefined,
                notes: '',
                tags: []
            };
            const departmentName = 'Afloat';
            const projectNumber = 'AF25123';

            const result = createEnhancedDealObject(dealDetails, departmentName, projectNumber);

            expect(result).toEqual({
                id: '11111',
                title: null,
                value: undefined,
                notes: '',
                tags: [],
                department: 'Afloat',
                projectNumber: 'AF25123',
                enhancedAt: expect.any(String)
            });
        });

        test('should generate valid ISO timestamp for enhancedAt', () => {
            const dealDetails = { id: '12345' };
            const departmentName = 'Navy';
            const projectNumber = 'NY25001';

            const result = createEnhancedDealObject(dealDetails, departmentName, projectNumber);

            expect(result.enhancedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            
            // Verify it's a valid date
            const enhancedDate = new Date(result.enhancedAt);
            expect(enhancedDate.getTime()).not.toBeNaN();
            
            // Should be close to current time (within 1 second)
            const now = new Date();
            expect(Math.abs(now.getTime() - enhancedDate.getTime())).toBeLessThan(1000);
        });

        test('should handle special characters in department and project number', () => {
            const dealDetails = { id: '12345' };
            const departmentName = 'Special & Department';
            const projectNumber = 'SP25-001';

            const result = createEnhancedDealObject(dealDetails, departmentName, projectNumber);

            expect(result.department).toBe('Special & Department');
            expect(result.projectNumber).toBe('SP25-001');
        });
    });
}); 