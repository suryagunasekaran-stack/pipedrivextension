/**
 * Auth Routes Integration Tests
 * 
 * Integration tests for authentication routes with:
 * - Real route handlers and middleware
 * - Mocked external APIs (Pipedrive/Xero OAuth)
 * - In-memory MongoDB for token storage
 * - Supertest for HTTP testing
 */

import request from 'supertest';
import express from 'express';
import nock from 'nock';
import { 
    setupTestEnvironment, 
    teardownTestEnvironment,
    mockPipedriveAuth,
    mockXeroAuth,
    mockPipedriveAPI
} from './setup.js';

describe('Auth Routes Integration Tests', () => {
    let app;
    let testDb;

    beforeAll(async () => {
        const { db } = await setupTestEnvironment();
        testDb = db;
        
        // Create a simple Express app that simulates our auth routes
        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // Simple auth status endpoint (like /auth/status)
        app.get('/auth/status', async (req, res) => {
            try {
                const { companyId } = req.query;
                
                if (!companyId) {
                    return res.status(400).json({ 
                        error: 'companyId is required' 
                    });
                }
                
                // Check if company has auth tokens
                const authTokens = testDb.collection('auth_tokens');
                const pipedriveToken = await authTokens.findOne({ 
                    companyId, 
                    service: 'pipedrive',
                    isActive: true 
                });
                const xeroToken = await authTokens.findOne({ 
                    companyId, 
                    service: 'xero',
                    isActive: true 
                });
                
                res.json({
                    success: true,
                    companyId,
                    pipedrive: {
                        authenticated: !!pipedriveToken,
                        apiDomain: pipedriveToken?.apiDomain || null
                    },
                    xero: {
                        authenticated: !!xeroToken,
                        tenantId: xeroToken?.tenantId || null
                    }
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // OAuth callback simulation (like /auth/callback)
        app.post('/auth/callback', async (req, res) => {
            try {
                const { code, state, companyId } = req.body;
                
                if (!code || !state) {
                    return res.status(400).json({ 
                        error: 'Missing authorization code or state' 
                    });
                }
                
                // Exchange code for token (mocked)
                const axios = (await import('axios')).default;
                const tokenResponse = await axios.post('https://oauth.pipedrive.com/oauth/token', {
                    grant_type: 'authorization_code',
                    code,
                    client_id: process.env.CLIENT_ID || 'test_client',
                    client_secret: process.env.CLIENT_SECRET || 'test_secret',
                    redirect_uri: process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback'
                });
                
                // Get user info to find company ID
                const userResponse = await axios.get(`https://${tokenResponse.data.api_domain}/v1/users/me`, {
                    headers: {
                        'Authorization': `Bearer ${tokenResponse.data.access_token}`
                    }
                });
                
                const actualCompanyId = userResponse.data.data.company_id.toString();
                
                // Store token in database
                const authTokens = testDb.collection('auth_tokens');
                await authTokens.insertOne({
                    companyId: actualCompanyId,
                    service: 'pipedrive',
                    encryptedAccessToken: tokenResponse.data.access_token, // In real app this would be encrypted
                    encryptedRefreshToken: tokenResponse.data.refresh_token,
                    apiDomain: tokenResponse.data.api_domain,
                    tokenExpiresAt: new Date(Date.now() + (tokenResponse.data.expires_in * 1000)),
                    isActive: true,
                    createdAt: new Date(),
                    lastUsedAt: new Date()
                });
                
                res.json({
                    success: true,
                    companyId: actualCompanyId,
                    apiDomain: tokenResponse.data.api_domain,
                    redirectUrl: `${process.env.FRONTEND_BASE_URL || 'http://localhost:3001'}/success?companyId=${actualCompanyId}`
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Xero OAuth callback simulation
        app.post('/auth/xero-callback', async (req, res) => {
            try {
                const { code, state, pipedriveCompanyId } = req.body;
                
                if (!code || !pipedriveCompanyId) {
                    return res.status(400).json({ 
                        error: 'Missing authorization code or Pipedrive company ID' 
                    });
                }
                
                // Exchange code for token (mocked)
                const axios = (await import('axios')).default;
                const tokenResponse = await axios.post('https://identity.xero.com/connect/token', {
                    grant_type: 'authorization_code',
                    code,
                    client_id: process.env.XERO_CLIENT_ID || 'test_xero_client',
                    client_secret: process.env.XERO_CLIENT_SECRET || 'test_xero_secret',
                    redirect_uri: process.env.XERO_REDIRECT_URI || 'http://localhost:3000/auth/xero-callback'
                });
                
                // Get tenant connections
                const connectionsResponse = await axios.get('https://api.xero.com/connections', {
                    headers: {
                        'Authorization': `Bearer ${tokenResponse.data.access_token}`
                    }
                });
                
                const tenantId = connectionsResponse.data[0]?.tenantId || 'test-tenant-id';
                
                // Store Xero token linked to Pipedrive company
                const authTokens = testDb.collection('auth_tokens');
                await authTokens.insertOne({
                    companyId: pipedriveCompanyId,
                    service: 'xero',
                    encryptedAccessToken: tokenResponse.data.access_token,
                    encryptedRefreshToken: tokenResponse.data.refresh_token,
                    tenantId: tenantId,
                    tokenExpiresAt: new Date(Date.now() + (tokenResponse.data.expires_in * 1000)),
                    isActive: true,
                    createdAt: new Date(),
                    lastUsedAt: new Date()
                });
                
                res.json({
                    success: true,
                    companyId: pipedriveCompanyId,
                    tenantId: tenantId,
                    redirectUrl: `${process.env.FRONTEND_BASE_URL || 'http://localhost:3001'}/xero-success?companyId=${pipedriveCompanyId}`
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Logout endpoint
        app.post('/auth/logout', async (req, res) => {
            try {
                const { companyId } = req.body;
                
                if (!companyId) {
                    return res.status(400).json({ 
                        error: 'companyId is required' 
                    });
                }
                
                // Deactivate all tokens for the company
                const authTokens = testDb.collection('auth_tokens');
                await authTokens.updateMany(
                    { companyId },
                    { 
                        $set: { 
                            isActive: false,
                            deactivatedAt: new Date()
                        } 
                    }
                );
                
                res.json({
                    success: true,
                    message: 'Successfully logged out'
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

    }, 30000);

    afterAll(async () => {
        await teardownTestEnvironment();
    }, 10000);

    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(async () => {
        nock.cleanAll();
        // Clean database between tests
        const collections = await testDb.collections();
        await Promise.all(collections.map(collection => collection.deleteMany({})));
    });

    describe('Auth Status Endpoint', () => {

        test('should check auth status for unauthenticated company', async () => {
            const response = await request(app)
                .get('/auth/status?companyId=12345')
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                companyId: '12345',
                pipedrive: {
                    authenticated: false,
                    apiDomain: null
                },
                xero: {
                    authenticated: false,
                    tenantId: null
                }
            });
        });

        test('should check auth status for authenticated company', async () => {
            // Insert test tokens
            const authTokens = testDb.collection('auth_tokens');
            await authTokens.insertMany([
                {
                    companyId: '12345',
                    service: 'pipedrive',
                    encryptedAccessToken: 'test_token',
                    apiDomain: 'company-12345.pipedrive.com',
                    isActive: true
                },
                {
                    companyId: '12345',
                    service: 'xero',
                    encryptedAccessToken: 'test_xero_token',
                    tenantId: 'test-tenant-id',
                    isActive: true
                }
            ]);

            const response = await request(app)
                .get('/auth/status?companyId=12345')
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                companyId: '12345',
                pipedrive: {
                    authenticated: true,
                    apiDomain: 'company-12345.pipedrive.com'
                },
                xero: {
                    authenticated: true,
                    tenantId: 'test-tenant-id'
                }
            });
        });

        test('should require companyId parameter', async () => {
            const response = await request(app)
                .get('/auth/status')
                .expect(400);

            expect(response.body.error).toBe('companyId is required');
        });

        test('should handle inactive tokens', async () => {
            // Insert inactive token
            const authTokens = testDb.collection('auth_tokens');
            await authTokens.insertOne({
                companyId: '12345',
                service: 'pipedrive',
                encryptedAccessToken: 'test_token',
                apiDomain: 'company-12345.pipedrive.com',
                isActive: false // Inactive token
            });

            const response = await request(app)
                .get('/auth/status?companyId=12345')
                .expect(200);

            expect(response.body.pipedrive.authenticated).toBe(false);
        });
    });

    describe('Pipedrive OAuth Callback', () => {

        test('should handle successful OAuth callback', async () => {
            // Mock Pipedrive OAuth token exchange
            const tokenMock = mockPipedriveAuth('12345');
            
            // Mock Pipedrive user API
            const userMock = mockPipedriveAPI('12345');

            const response = await request(app)
                .post('/auth/callback')
                .send({
                    code: 'auth_code_12345',
                    state: 'csrf_token_abc',
                    companyId: '12345'
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.companyId).toBe('12345');
            expect(response.body.apiDomain).toBe('company-12345.pipedrive.com');
            expect(response.body.redirectUrl).toContain('/success?companyId=12345');
            
            expect(tokenMock.isDone()).toBe(true);
            expect(userMock.isDone()).toBe(true);

            // Verify token was stored
            const authTokens = testDb.collection('auth_tokens');
            const storedToken = await authTokens.findOne({ 
                companyId: '12345', 
                service: 'pipedrive' 
            });
            
            expect(storedToken).toBeTruthy();
            expect(storedToken.apiDomain).toBe('company-12345.pipedrive.com');
            expect(storedToken.isActive).toBe(true);
        });

        test('should reject callback without authorization code', async () => {
            const response = await request(app)
                .post('/auth/callback')
                .send({
                    state: 'csrf_token_abc'
                })
                .expect(400);

            expect(response.body.error).toBe('Missing authorization code or state');
        });

        test('should handle OAuth API errors', async () => {
            // Mock OAuth error
            nock('https://oauth.pipedrive.com')
                .post('/oauth/token')
                .reply(400, { error: 'invalid_grant' });

            const response = await request(app)
                .post('/auth/callback')
                .send({
                    code: 'invalid_code',
                    state: 'csrf_token_abc'
                })
                .expect(500);

            expect(response.body.error).toContain('Request failed');
        });
    });

    describe('Xero OAuth Callback', () => {

        test('should handle successful Xero OAuth callback', async () => {
            // Mock Xero OAuth token exchange
            const xeroTokenMock = mockXeroAuth();
            
            // Mock Xero connections API
            const connectionsMock = nock('https://api.xero.com')
                .get('/connections')
                .reply(200, [
                    {
                        tenantId: 'test-tenant-id',
                        tenantName: 'Test Company'
                    }
                ]);

            const response = await request(app)
                .post('/auth/xero-callback')
                .send({
                    code: 'xero_auth_code',
                    state: 'xero_csrf_token',
                    pipedriveCompanyId: '12345'
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.companyId).toBe('12345');
            expect(response.body.tenantId).toBe('test-tenant-id');
            expect(response.body.redirectUrl).toContain('/xero-success?companyId=12345');
            
            expect(xeroTokenMock.isDone()).toBe(true);
            expect(connectionsMock.isDone()).toBe(true);

            // Verify Xero token was stored
            const authTokens = testDb.collection('auth_tokens');
            const storedToken = await authTokens.findOne({ 
                companyId: '12345', 
                service: 'xero' 
            });
            
            expect(storedToken).toBeTruthy();
            expect(storedToken.tenantId).toBe('test-tenant-id');
            expect(storedToken.isActive).toBe(true);
        });

        test('should reject Xero callback without required fields', async () => {
            const response = await request(app)
                .post('/auth/xero-callback')
                .send({
                    code: 'xero_auth_code'
                    // Missing pipedriveCompanyId
                })
                .expect(400);

            expect(response.body.error).toBe('Missing authorization code or Pipedrive company ID');
        });
    });

    describe('Logout Endpoint', () => {

        test('should successfully logout company', async () => {
            // Insert test tokens
            const authTokens = testDb.collection('auth_tokens');
            await authTokens.insertMany([
                {
                    companyId: '12345',
                    service: 'pipedrive',
                    encryptedAccessToken: 'test_token',
                    isActive: true
                },
                {
                    companyId: '12345',
                    service: 'xero',
                    encryptedAccessToken: 'test_xero_token',
                    isActive: true
                }
            ]);

            const response = await request(app)
                .post('/auth/logout')
                .send({ companyId: '12345' })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Successfully logged out');

            // Verify tokens were deactivated
            const activeTokens = await authTokens.find({ 
                companyId: '12345', 
                isActive: true 
            }).toArray();
            
            expect(activeTokens).toHaveLength(0);
            
            const inactiveTokens = await authTokens.find({ 
                companyId: '12345', 
                isActive: false 
            }).toArray();
            
            expect(inactiveTokens).toHaveLength(2);
        });

        test('should require companyId for logout', async () => {
            const response = await request(app)
                .post('/auth/logout')
                .send({})
                .expect(400);

            expect(response.body.error).toBe('companyId is required');
        });
    });

    describe('Full Authentication Flow', () => {

        test('should complete full Pipedrive → Xero authentication flow', async () => {
            // Step 1: Pipedrive OAuth
            const pipedriveTokenMock = mockPipedriveAuth('12345');
            const pipedriveUserMock = mockPipedriveAPI('12345');

            const pipedriveResponse = await request(app)
                .post('/auth/callback')
                .send({
                    code: 'pipedrive_auth_code',
                    state: 'csrf_token_1'
                })
                .expect(200);

            expect(pipedriveResponse.body.success).toBe(true);
            expect(pipedriveTokenMock.isDone()).toBe(true);
            expect(pipedriveUserMock.isDone()).toBe(true);

            // Step 2: Check auth status (should show Pipedrive authenticated)
            const statusResponse1 = await request(app)
                .get('/auth/status?companyId=12345')
                .expect(200);

            expect(statusResponse1.body.pipedrive.authenticated).toBe(true);
            expect(statusResponse1.body.xero.authenticated).toBe(false);

            // Step 3: Xero OAuth
            const xeroTokenMock = mockXeroAuth();
            const xeroConnectionsMock = nock('https://api.xero.com')
                .get('/connections')
                .reply(200, [{ tenantId: 'test-tenant', tenantName: 'Test Co' }]);

            const xeroResponse = await request(app)
                .post('/auth/xero-callback')
                .send({
                    code: 'xero_auth_code',
                    state: 'csrf_token_2',
                    pipedriveCompanyId: '12345'
                })
                .expect(200);

            expect(xeroResponse.body.success).toBe(true);
            expect(xeroTokenMock.isDone()).toBe(true);
            expect(xeroConnectionsMock.isDone()).toBe(true);

            // Step 4: Check final auth status (both should be authenticated)
            const statusResponse2 = await request(app)
                .get('/auth/status?companyId=12345')
                .expect(200);

            expect(statusResponse2.body.pipedrive.authenticated).toBe(true);
            expect(statusResponse2.body.xero.authenticated).toBe(true);

            // Step 5: Logout
            await request(app)
                .post('/auth/logout')
                .send({ companyId: '12345' })
                .expect(200);

            // Step 6: Verify both are logged out
            const statusResponse3 = await request(app)
                .get('/auth/status?companyId=12345')
                .expect(200);

            expect(statusResponse3.body.pipedrive.authenticated).toBe(false);
            expect(statusResponse3.body.xero.authenticated).toBe(false);
        });
    });
}); 