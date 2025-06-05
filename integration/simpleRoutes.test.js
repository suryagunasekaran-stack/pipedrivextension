/**
 * Simple Routes Integration Tests
 * 
 * Basic integration tests for routes with minimal dependencies.
 * This is our starting point for integration testing.
 */

import request from 'supertest';
import express from 'express';
import nock from 'nock';
import { 
    setupTestEnvironment, 
    teardownTestEnvironment,
    mockPipedriveAuth
} from './setup.js';

describe('Simple Routes Integration Tests', () => {
    let testDb;

    // Setup before all tests
    beforeAll(async () => {
        const { db } = await setupTestEnvironment();
        testDb = db;
    }, 30000);

    // Cleanup after all tests
    afterAll(async () => {
        await teardownTestEnvironment();
    }, 10000);

    // Clean up mocks between tests
    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('Basic Express App Tests', () => {

        test('should create basic express app', async () => {
            const app = express();
            app.use(express.json());
            
            app.get('/test', (req, res) => {
                res.status(200).json({ message: 'Test successful' });
            });

            const response = await request(app)
                .get('/test')
                .expect(200);

            expect(response.body).toEqual({ message: 'Test successful' });
        });

        test('should handle JSON body parsing', async () => {
            const app = express();
            app.use(express.json());
            
            app.post('/echo', (req, res) => {
                res.status(200).json({ received: req.body });
            });

            const testData = { name: 'Test', value: 123 };

            const response = await request(app)
                .post('/echo')
                .send(testData)
                .expect(200);

            expect(response.body.received).toEqual(testData);
        });

        test('should handle URL parameters', async () => {
            const app = express();
            
            app.get('/users/:id', (req, res) => {
                res.status(200).json({ 
                    userId: req.params.id,
                    query: req.query 
                });
            });

            const response = await request(app)
                .get('/users/123?name=test')
                .expect(200);

            expect(response.body.userId).toBe('123');
            expect(response.body.query.name).toBe('test');
        });

        test('should handle error responses', async () => {
            const app = express();
            
            app.get('/error', (req, res) => {
                res.status(400).json({ error: 'Bad request' });
            });

            const response = await request(app)
                .get('/error')
                .expect(400);

            expect(response.body.error).toBe('Bad request');
        });
    });

    describe('Mock External API Tests', () => {

        test('should mock Pipedrive OAuth token exchange', async () => {
            // Setup the mock
            const mockScope = mockPipedriveAuth('12345');

            // Create a simple app that calls the mocked API
            const app = express();
            app.use(express.json());
            
            app.post('/test-auth', async (req, res) => {
                try {
                    // This would normally call Pipedrive OAuth
                    const axios = (await import('axios')).default;
                    const response = await axios.post('https://oauth.pipedrive.com/oauth/token', {
                        grant_type: 'authorization_code',
                        code: 'test_code',
                        client_id: 'test_client',
                        client_secret: 'test_secret'
                    });
                    
                    res.json({ 
                        success: true, 
                        token: response.data.access_token 
                    });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            });

            const response = await request(app)
                .post('/test-auth')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.token).toBe('mock_pipedrive_token');
            
            // Verify the mock was called
            expect(mockScope.isDone()).toBe(true);
        });

        test('should mock multiple API calls', async () => {
            // Mock Pipedrive API
            const pipedriveScope = nock('https://company-12345.pipedrive.com')
                .get('/v1/users/me')
                .reply(200, {
                    success: true,
                    data: { id: 123, name: 'Test User' }
                });

            // Mock Xero API
            const xeroScope = nock('https://api.xero.com')
                .get('/connections')
                .reply(200, [
                    { tenantId: 'test-tenant', tenantName: 'Test Company' }
                ]);

            const app = express();
            app.use(express.json());
            
            app.get('/test-apis', async (req, res) => {
                try {
                    const axios = (await import('axios')).default;
                    
                    const [pipedriveResponse, xeroResponse] = await Promise.all([
                        axios.get('https://company-12345.pipedrive.com/v1/users/me'),
                        axios.get('https://api.xero.com/connections')
                    ]);
                    
                    res.json({
                        pipedrive: pipedriveResponse.data,
                        xero: xeroResponse.data
                    });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            });

            const response = await request(app)
                .get('/test-apis')
                .expect(200);

            expect(response.body.pipedrive.success).toBe(true);
            expect(response.body.xero).toHaveLength(1);
            expect(pipedriveScope.isDone()).toBe(true);
            expect(xeroScope.isDone()).toBe(true);
        });

        test('should handle API errors gracefully', async () => {
            // Mock API error
            const errorScope = nock('https://api.example.com')
                .get('/fail')
                .reply(500, { error: 'Internal server error' });

            const app = express();
            app.use(express.json());
            
            app.get('/test-error', async (req, res) => {
                try {
                    const axios = (await import('axios')).default;
                    await axios.get('https://api.example.com/fail');
                    res.json({ success: true });
                } catch (error) {
                    res.status(400).json({ 
                        error: 'API call failed',
                        details: error.response?.data 
                    });
                }
            });

            const response = await request(app)
                .get('/test-error')
                .expect(400);

            expect(response.body.error).toBe('API call failed');
            expect(errorScope.isDone()).toBe(true);
        });
    });

    describe('Database Integration Tests', () => {

        test('should connect to test database', async () => {
            // Simple database operation
            const collection = testDb.collection('test_collection');
            
            const testDoc = { name: 'test', timestamp: new Date() };
            const insertResult = await collection.insertOne(testDoc);
            
            expect(insertResult.insertedId).toBeDefined();
            
            const foundDoc = await collection.findOne({ _id: insertResult.insertedId });
            expect(foundDoc.name).toBe('test');
            
            // Cleanup
            await collection.deleteOne({ _id: insertResult.insertedId });
        });

        test('should handle database operations in route', async () => {
            const app = express();
            app.use(express.json());
            
            app.post('/create-item', async (req, res) => {
                try {
                    const collection = testDb.collection('items');
                    const result = await collection.insertOne(req.body);
                    
                    res.status(201).json({ 
                        success: true, 
                        id: result.insertedId 
                    });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            });
            
            app.get('/items/:id', async (req, res) => {
                try {
                    const { ObjectId } = await import('mongodb');
                    const collection = testDb.collection('items');
                    const item = await collection.findOne({ 
                        _id: new ObjectId(req.params.id) 
                    });
                    
                    if (item) {
                        res.json(item);
                    } else {
                        res.status(404).json({ error: 'Item not found' });
                    }
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            });

            // Create an item
            const createResponse = await request(app)
                .post('/create-item')
                .send({ name: 'Test Item', value: 42 })
                .expect(201);

            expect(createResponse.body.success).toBe(true);
            expect(createResponse.body.id).toBeDefined();

            // Retrieve the item
            const getResponse = await request(app)
                .get(`/items/${createResponse.body.id}`)
                .expect(200);

            expect(getResponse.body.name).toBe('Test Item');
            expect(getResponse.body.value).toBe(42);

            // Cleanup
            const collection = testDb.collection('items');
            await collection.deleteMany({});
        });

        test('should handle concurrent database operations', async () => {
            const collection = testDb.collection('concurrent_test');
            
            // Insert multiple documents concurrently
            const insertPromises = Array(10).fill().map((_, index) => 
                collection.insertOne({ index, timestamp: new Date() })
            );
            
            const results = await Promise.all(insertPromises);
            
            expect(results).toHaveLength(10);
            results.forEach(result => {
                expect(result.insertedId).toBeDefined();
            });
            
            // Verify all documents were inserted
            const count = await collection.countDocuments();
            expect(count).toBe(10);
            
            // Cleanup
            await collection.deleteMany({});
        });
    });

    describe('Integration Patterns', () => {

        test('should test API → Database flow', async () => {
            // Mock external API
            const apiScope = nock('https://api.external.com')
                .get('/data/123')
                .reply(200, {
                    id: 123,
                    name: 'External Data',
                    value: 999
                });

            const app = express();
            app.use(express.json());
            
            app.post('/sync/:id', async (req, res) => {
                try {
                    const axios = (await import('axios')).default;
                    
                    // Fetch from external API
                    const apiResponse = await axios.get(`https://api.external.com/data/${req.params.id}`);
                    
                    // Store in database
                    const collection = testDb.collection('synced_data');
                    const result = await collection.insertOne({
                        externalId: apiResponse.data.id,
                        name: apiResponse.data.name,
                        value: apiResponse.data.value,
                        syncedAt: new Date()
                    });
                    
                    res.json({ 
                        success: true, 
                        dbId: result.insertedId,
                        externalId: apiResponse.data.id
                    });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            });

            const response = await request(app)
                .post('/sync/123')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.externalId).toBe(123);
            expect(apiScope.isDone()).toBe(true);
            
            // Verify data was stored
            const collection = testDb.collection('synced_data');
            const storedDoc = await collection.findOne({ externalId: 123 });
            expect(storedDoc.name).toBe('External Data');
            
            // Cleanup
            await collection.deleteMany({});
        });

        test('should handle authentication flow simulation', async () => {
            // Mock OAuth token exchange
            const authScope = mockPipedriveAuth('test-company');

            const app = express();
            app.use(express.json());
            
            app.post('/oauth/callback', async (req, res) => {
                try {
                    const { code, companyId } = req.body;
                    
                    // Exchange code for token (mocked)
                    const axios = (await import('axios')).default;
                    const tokenResponse = await axios.post('https://oauth.pipedrive.com/oauth/token', {
                        grant_type: 'authorization_code',
                        code,
                        client_id: 'test_client',
                        client_secret: 'test_secret'
                    });
                    
                    // Store token in database
                    const collection = testDb.collection('auth_tokens');
                    await collection.insertOne({
                        companyId,
                        accessToken: tokenResponse.data.access_token,
                        apiDomain: tokenResponse.data.api_domain,
                        createdAt: new Date()
                    });
                    
                    res.json({ 
                        success: true,
                        apiDomain: tokenResponse.data.api_domain 
                    });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            });

            const response = await request(app)
                .post('/oauth/callback')
                .send({ 
                    code: 'auth_code_123', 
                    companyId: 'test-company' 
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.apiDomain).toBe('company-test-company.pipedrive.com');
            expect(authScope.isDone()).toBe(true);
            
            // Verify token was stored
            const collection = testDb.collection('auth_tokens');
            const storedToken = await collection.findOne({ companyId: 'test-company' });
            expect(storedToken.accessToken).toBe('mock_pipedrive_token');
            
            // Cleanup
            await collection.deleteMany({});
        });
    });
}); 