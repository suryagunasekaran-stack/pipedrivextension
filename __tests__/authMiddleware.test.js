/**
 * Authentication Middleware Tests
 * 
 * Tests for all authentication middleware functions including:
 * - requirePipedriveAuth
 * - optionalXeroAuth
 * - requireXeroAuth
 * - requirePipedriveWithOptionalXero
 * - requireBothPipedriveAndXero
 * - checkAuthRequirements
 */

import { jest } from '@jest/globals';

// ESM-compatible mocking
const mockSecureTokenService = {
    getAuthToken: jest.fn(),
    refreshPipedriveToken: jest.fn(),
    refreshXeroToken: jest.fn()
};

const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

// Mock all modules
await jest.unstable_mockModule('../services/secureTokenService.js', () => mockSecureTokenService);
await jest.unstable_mockModule('../lib/logger.js', () => ({ default: mockLogger }));

const authMiddleware = await import('../middleware/authMiddleware.js');

describe('Authentication Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        // Set up mock request, response, and next function
        req = {
            body: {},
            query: {},
            pipedriveAuth: null,
            xeroAuth: null
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();

        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('requirePipedriveAuth', () => {
        test('should return 400 if no company ID is provided', async () => {
            await authMiddleware.requirePipedriveAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Company ID is required',
                authRequired: true
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('should return 401 if Pipedrive token is missing', async () => {
            req.body.companyId = 'test-company';
            mockSecureTokenService.getAuthToken.mockResolvedValue(null);

            await authMiddleware.requirePipedriveAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Pipedrive not authenticated for company test-company',
                authRequired: true,
                authType: 'pipedrive',
                companyId: 'test-company',
                authUrl: 'http://localhost:3000/auth/auth-url?companyId=test-company'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('should continue with valid token', async () => {
            req.body.companyId = 'test-company';
            const validToken = {
                accessToken: 'valid-token',
                apiDomain: 'test.pipedrive.com',
                tokenExpiresAt: Date.now() + 3600000 // Expires in 1 hour
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(validToken);

            await authMiddleware.requirePipedriveAuth(req, res, next);

            expect(req.pipedriveAuth).toEqual({
                accessToken: 'valid-token',
                apiDomain: 'test.pipedrive.com',
                companyId: 'test-company'
            });
            expect(next).toHaveBeenCalled();
        });

        test('should refresh expired token and continue', async () => {
            req.body.companyId = 'test-company';
            const expiredToken = {
                accessToken: 'expired-token',
                apiDomain: 'test.pipedrive.com',
                tokenExpiresAt: Date.now() - 10000 // Expired 10 seconds ago
            };
            const refreshedToken = {
                accessToken: 'new-token',
                apiDomain: 'test.pipedrive.com'
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(expiredToken);
            mockSecureTokenService.refreshPipedriveToken.mockResolvedValue(refreshedToken);

            await authMiddleware.requirePipedriveAuth(req, res, next);

            expect(mockSecureTokenService.refreshPipedriveToken).toHaveBeenCalledWith('test-company');
            expect(req.pipedriveAuth).toEqual({
                accessToken: 'new-token',
                apiDomain: 'test.pipedrive.com',
                companyId: 'test-company'
            });
            expect(next).toHaveBeenCalled();
        });

        test('should return 401 if token refresh fails', async () => {
            req.body.companyId = 'test-company';
            const expiredToken = {
                accessToken: 'expired-token',
                apiDomain: 'test.pipedrive.com',
                tokenExpiresAt: Date.now() - 10000
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(expiredToken);
            mockSecureTokenService.refreshPipedriveToken.mockRejectedValue(new Error('Refresh failed'));

            await authMiddleware.requirePipedriveAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Pipedrive token expired and refresh failed. Please re-authenticate.',
                authRequired: true,
                authType: 'pipedrive',
                companyId: 'test-company',
                authUrl: 'http://localhost:3000/auth?companyId=test-company'
            });
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('requireXeroAuth', () => {
        test('should return 400 if no company ID is provided', async () => {
            await authMiddleware.requireXeroAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Company ID is required',
                authRequired: true
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('should return 401 if Xero token is missing', async () => {
            req.body.companyId = 'test-company';
            mockSecureTokenService.getAuthToken.mockResolvedValue(null);

            await authMiddleware.requireXeroAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Xero not authenticated for company test-company. Please connect to Xero first.',
                authRequired: true,
                authType: 'xero',
                companyId: 'test-company',
                authUrl: 'http://localhost:3000/auth/connect-xero?pipedriveCompanyId=test-company'
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('should continue with valid Xero token', async () => {
            req.body.companyId = 'test-company';
            const validToken = {
                accessToken: 'valid-xero-token',
                tenantId: 'tenant-123',
                tokenExpiresAt: Date.now() + 3600000
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(validToken);

            await authMiddleware.requireXeroAuth(req, res, next);

            expect(req.xeroAuth).toEqual({
                accessToken: 'valid-xero-token',
                tenantId: 'tenant-123',
                companyId: 'test-company'
            });
            expect(next).toHaveBeenCalled();
        });

        test('should refresh expired Xero token and continue', async () => {
            req.body.companyId = 'test-company';
            const expiredToken = {
                accessToken: 'expired-xero-token',
                tenantId: 'tenant-123',
                tokenExpiresAt: Date.now() - 10000
            };
            const refreshedToken = {
                accessToken: 'new-xero-token',
                tenantId: 'tenant-123'
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(expiredToken);
            mockSecureTokenService.refreshXeroToken.mockResolvedValue(refreshedToken);

            await authMiddleware.requireXeroAuth(req, res, next);

            expect(mockSecureTokenService.refreshXeroToken).toHaveBeenCalledWith('test-company');
            expect(req.xeroAuth).toEqual({
                accessToken: 'new-xero-token',
                tenantId: 'tenant-123',
                companyId: 'test-company'
            });
            expect(next).toHaveBeenCalled();
        });

        test('should return 401 if Xero token refresh fails', async () => {
            req.body.companyId = 'test-company';
            const expiredToken = {
                accessToken: 'expired-xero-token',
                tenantId: 'tenant-123',
                tokenExpiresAt: Date.now() - 10000
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(expiredToken);
            mockSecureTokenService.refreshXeroToken.mockRejectedValue(new Error('Refresh failed'));

            await authMiddleware.requireXeroAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Xero token expired and refresh failed. Please re-authenticate.',
                authRequired: true,
                authType: 'xero',
                companyId: 'test-company',
                authUrl: 'http://localhost:3000/auth/connect-xero?pipedriveCompanyId=test-company'
            });
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('optionalXeroAuth', () => {
        test('should continue without auth if no company ID', async () => {
            await authMiddleware.optionalXeroAuth(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(mockSecureTokenService.getAuthToken).not.toHaveBeenCalled();
        });

        test('should continue with null xeroAuth if no token', async () => {
            req.body.companyId = 'test-company';
            mockSecureTokenService.getAuthToken.mockResolvedValue(null);

            await authMiddleware.optionalXeroAuth(req, res, next);

            expect(req.xeroAuth).toBeNull();
            expect(next).toHaveBeenCalled();
        });

        test('should attach valid Xero token', async () => {
            req.body.companyId = 'test-company';
            const validToken = {
                accessToken: 'xero-token',
                tenantId: 'tenant-123',
                tokenExpiresAt: Date.now() + 3600000
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(validToken);

            await authMiddleware.optionalXeroAuth(req, res, next);

            expect(req.xeroAuth).toEqual({
                accessToken: 'xero-token',
                tenantId: 'tenant-123',
                companyId: 'test-company'
            });
            expect(next).toHaveBeenCalled();
        });

        test('should continue with null xeroAuth if refresh fails', async () => {
            req.body.companyId = 'test-company';
            const expiredToken = {
                accessToken: 'expired-xero-token',
                tenantId: 'tenant-123',
                tokenExpiresAt: Date.now() - 10000
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(expiredToken);
            mockSecureTokenService.refreshXeroToken.mockRejectedValue(new Error('Refresh failed'));

            await authMiddleware.optionalXeroAuth(req, res, next);

            expect(req.xeroAuth).toBeNull();
            expect(next).toHaveBeenCalled();
        });
    });

    describe('requireBothPipedriveAndXero', () => {
        test('should require both Pipedrive and Xero authentication', async () => {
            req.body.companyId = 'test-company';
            
            // Mock successful Pipedrive auth
            const pipedriveToken = {
                accessToken: 'pd-token',
                apiDomain: 'test.pipedrive.com',
                tokenExpiresAt: Date.now() + 3600000
            };
            
            // Mock successful Xero auth
            const xeroToken = {
                accessToken: 'xero-token',
                tenantId: 'tenant-123',
                tokenExpiresAt: Date.now() + 3600000
            };

            mockSecureTokenService.getAuthToken
                .mockResolvedValueOnce(pipedriveToken) // First call for Pipedrive
                .mockResolvedValueOnce(xeroToken);     // Second call for Xero

            await authMiddleware.requireBothPipedriveAndXero(req, res, next);

            expect(req.pipedriveAuth).toEqual({
                accessToken: 'pd-token',
                apiDomain: 'test.pipedrive.com',
                companyId: 'test-company'
            });
            expect(req.xeroAuth).toEqual({
                accessToken: 'xero-token',
                tenantId: 'tenant-123',
                companyId: 'test-company'
            });
            expect(next).toHaveBeenCalled();
        });

        test('should fail if Pipedrive auth fails', async () => {
            req.body.companyId = 'test-company';
            mockSecureTokenService.getAuthToken.mockResolvedValue(null);

            await authMiddleware.requireBothPipedriveAndXero(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    authType: 'pipedrive'
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        test('should fail if Xero auth fails after Pipedrive succeeds', async () => {
            req.body.companyId = 'test-company';
            
            const pipedriveToken = {
                accessToken: 'pd-token',
                apiDomain: 'test.pipedrive.com',
                tokenExpiresAt: Date.now() + 3600000
            };

            mockSecureTokenService.getAuthToken
                .mockResolvedValueOnce(pipedriveToken) // Pipedrive succeeds
                .mockResolvedValueOnce(null);          // Xero fails

            await authMiddleware.requireBothPipedriveAndXero(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    authType: 'xero'
                })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Integration with different company ID sources', () => {
        test('should find company ID from query params', async () => {
            req.query.companyId = 'test-company';
            const validToken = {
                accessToken: 'valid-token',
                apiDomain: 'test.pipedrive.com',
                tokenExpiresAt: Date.now() + 3600000
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(validToken);

            await authMiddleware.requirePipedriveAuth(req, res, next);

            expect(req.pipedriveAuth.companyId).toBe('test-company');
            expect(next).toHaveBeenCalled();
        });

        test('should find company ID from pipedriveCompanyId in body', async () => {
            req.body.pipedriveCompanyId = 'test-company';
            const validToken = {
                accessToken: 'valid-token',
                apiDomain: 'test.pipedrive.com',
                tokenExpiresAt: Date.now() + 3600000
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(validToken);

            await authMiddleware.requirePipedriveAuth(req, res, next);

            expect(req.pipedriveAuth.companyId).toBe('test-company');
            expect(next).toHaveBeenCalled();
        });

        test('should find company ID from existing pipedriveAuth for Xero middleware', async () => {
            req.pipedriveAuth = { companyId: 'test-company' };
            const validToken = {
                accessToken: 'xero-token',
                tenantId: 'tenant-123',
                tokenExpiresAt: Date.now() + 3600000
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(validToken);

            await authMiddleware.optionalXeroAuth(req, res, next);

            expect(req.xeroAuth.companyId).toBe('test-company');
            expect(next).toHaveBeenCalled();
        });
    });

    describe('Error handling', () => {
        test('should handle token service errors gracefully', async () => {
            req.body.companyId = 'test-company';
            mockSecureTokenService.getAuthToken.mockRejectedValue(new Error('Database error'));

            await authMiddleware.requirePipedriveAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Authentication check failed',
                authRequired: true
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('should handle Xero token service errors gracefully in optionalXeroAuth', async () => {
            req.body.companyId = 'test-company';
            mockSecureTokenService.getAuthToken.mockRejectedValue(new Error('Database error'));

            await authMiddleware.optionalXeroAuth(req, res, next);

            expect(req.xeroAuth).toBeNull();
            expect(next).toHaveBeenCalled();
        });

        test('should handle Xero token service errors gracefully in requireXeroAuth', async () => {
            req.body.companyId = 'test-company';
            mockSecureTokenService.getAuthToken.mockRejectedValue(new Error('Database error'));

            await authMiddleware.requireXeroAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: 'Xero authentication check failed',
                authRequired: true
            });
            expect(next).not.toHaveBeenCalled();
        });
    });
}); 