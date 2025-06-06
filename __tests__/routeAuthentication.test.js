/**
 * Route Authentication Integration Tests
 * 
 * Tests to verify that routes correctly enforce authentication requirements
 * after our middleware fixes.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// ESM-compatible mocking
const mockSecureTokenService = {
    getAuthToken: jest.fn(),
    refreshPipedriveToken: jest.fn(),
    refreshXeroToken: jest.fn()
};

const mockProjectController = {
    createFullProject: jest.fn((req, res) => res.json({ success: true, message: 'Project created' }))
};

const mockXeroController = {
    getXeroStatus: jest.fn((req, res) => res.json({ success: true, message: 'Status retrieved' })),
    createXeroQuote: jest.fn((req, res) => res.json({ success: true, message: 'Quote created' })),
    acceptXeroQuote: jest.fn((req, res) => res.json({ success: true, message: 'Quote accepted' })),
    createXeroProject: jest.fn((req, res) => res.json({ success: true, message: 'Project created' })),
    updateQuotationOnXero: jest.fn((req, res) => res.json({ success: true, message: 'Quotation updated' })),
    debugQuoteAcceptance: jest.fn((req, res) => res.json({ success: true, message: 'Debug response' })),
    createInvoiceFromQuote: jest.fn((req, res) => res.json({ success: true, message: 'Invoice created' }))
};

const mockRouteLogger = {
    logRoute: jest.fn(() => (req, res, next) => next())
};

// Mock all modules
await jest.unstable_mockModule('../services/secureTokenService.js', () => mockSecureTokenService);
await jest.unstable_mockModule('../lib/logger.js', () => ({ default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
await jest.unstable_mockModule('../controllers/projectController.js', () => mockProjectController);
await jest.unstable_mockModule('../controllers/xeroController.js', () => mockXeroController);
await jest.unstable_mockModule('../middleware/routeLogger.js', () => mockRouteLogger);

// Import routes after mocking
const { default: projectRoutes } = await import('../routes/projectRoutes.js');
const { default: xeroRoutes } = await import('../routes/xeroRoutes.js');

describe('Route Authentication Tests', () => {
    let app;

    beforeEach(() => {
        // Create test app
        app = express();
        app.use(express.json());
        app.use(projectRoutes);
        app.use(xeroRoutes);

        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('POST /api/project/create-full', () => {
        test('should require both Pipedrive and Xero authentication', async () => {
            // No authentication tokens
            mockSecureTokenService.getAuthToken.mockResolvedValue(null);

            const response = await request(app)
                .post('/api/project/create-full')
                .send({
                    pipedriveDealId: '12345',
                    pipedriveCompanyId: 'test-company'
                })
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                authType: 'pipedrive',
                authRequired: true
            });

            expect(mockProjectController.createFullProject).not.toHaveBeenCalled();
        });

        test('should succeed when both Pipedrive and Xero are authenticated', async () => {
            const pipedriveToken = {
                accessToken: 'pd-token',
                apiDomain: 'test.pipedrive.com',
                tokenExpiresAt: Date.now() + 3600000
            };
            const xeroToken = {
                accessToken: 'xero-token',
                tenantId: 'tenant-123',
                tokenExpiresAt: Date.now() + 3600000
            };

            mockSecureTokenService.getAuthToken
                .mockResolvedValueOnce(pipedriveToken)
                .mockResolvedValueOnce(xeroToken);

            const response = await request(app)
                .post('/api/project/create-full')
                .send({
                    pipedriveDealId: '12345',
                    pipedriveCompanyId: 'test-company'
                })
                .expect(200);

            expect(response.body).toEqual({ success: true, message: 'Project created' });
            expect(mockProjectController.createFullProject).toHaveBeenCalled();
        });

        test('should fail if only Pipedrive is authenticated (missing Xero)', async () => {
            const pipedriveToken = {
                accessToken: 'pd-token',
                apiDomain: 'test.pipedrive.com',
                tokenExpiresAt: Date.now() + 3600000
            };

            mockSecureTokenService.getAuthToken
                .mockResolvedValueOnce(pipedriveToken) // Pipedrive succeeds
                .mockResolvedValueOnce(null);          // Xero fails

            const response = await request(app)
                .post('/api/project/create-full')
                .send({
                    pipedriveDealId: '12345',
                    pipedriveCompanyId: 'test-company'
                })
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                authType: 'xero',
                authRequired: true
            });

            expect(mockProjectController.createFullProject).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/xero/create-quote', () => {
        test('should require both Pipedrive and Xero authentication', async () => {
            mockSecureTokenService.getAuthToken.mockResolvedValue(null);

            const response = await request(app)
                .post('/api/xero/create-quote')
                .send({
                    pipedriveCompanyId: 'test-company',
                    pipedriveDealId: '12345'
                })
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                authType: 'pipedrive',
                authRequired: true
            });

            expect(mockXeroController.createXeroQuote).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/xero/create-project', () => {
        test('should require Xero authentication only', async () => {
            mockSecureTokenService.getAuthToken.mockResolvedValue(null);

            const response = await request(app)
                .post('/api/xero/create-project')
                .send({
                    pipedriveCompanyId: 'test-company',
                    contactId: 'contact-123',
                    name: 'Test Project',
                    vesselName: 'Test Vessel'
                })
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                authType: 'xero',
                authRequired: true
            });

            expect(mockXeroController.createXeroProject).not.toHaveBeenCalled();
        });

        test('should succeed with valid Xero authentication', async () => {
            const xeroToken = {
                accessToken: 'xero-token',
                tenantId: 'tenant-123',
                tokenExpiresAt: Date.now() + 3600000
            };

            mockSecureTokenService.getAuthToken.mockResolvedValue(xeroToken);

            const response = await request(app)
                .post('/api/xero/create-project')
                .send({
                    pipedriveCompanyId: 'test-company',
                    contactId: 'contact-123',
                    name: 'Test Project',
                    vesselName: 'Test Vessel'
                })
                .expect(200);

            expect(response.body).toEqual({ success: true, message: 'Project created' });
            expect(mockXeroController.createXeroProject).toHaveBeenCalled();
        });
    });

    describe('PUT /api/xero/accept-quote/:quoteId', () => {
        test('should require Xero authentication only', async () => {
            mockSecureTokenService.getAuthToken.mockResolvedValue(null);

            const response = await request(app)
                .put('/api/xero/accept-quote/QUOTE123')
                .send({
                    pipedriveCompanyId: 'test-company'
                })
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                authType: 'xero',
                authRequired: true
            });

            expect(mockXeroController.acceptXeroQuote).not.toHaveBeenCalled();
        });
    });

    describe('PUT /api/xero/update-quotation', () => {
        test('should require both Pipedrive and Xero authentication', async () => {
            mockSecureTokenService.getAuthToken.mockResolvedValue(null);

            const response = await request(app)
                .put('/api/xero/update-quotation')
                .send({
                    pipedriveCompanyId: 'test-company',
                    dealId: '12345'
                })
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                authType: 'pipedrive',
                authRequired: true
            });

            expect(mockXeroController.updateQuotationOnXero).not.toHaveBeenCalled();
        });
    });
}); 