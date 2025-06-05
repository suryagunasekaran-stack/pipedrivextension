/**
 * Integration Test Setup
 * 
 * Sets up test environment with:
 * - In-memory MongoDB using MongoDB Memory Server
 * - Express app instance for testing
 * - Mock configurations and utilities
 * - Cleanup functions
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import express from 'express';
import cors from 'cors';
import nock from 'nock';

let mongod;
let connection;
let db;

/**
 * Setup test database and app before tests
 */
export async function setupTestEnvironment() {
    // Start in-memory MongoDB
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    
    // Connect to test database
    connection = await MongoClient.connect(mongoUri);
    db = connection.db();
    
    // Set environment variables for testing
    process.env.MONGODB_URI = mongoUri;
    process.env.NODE_ENV = 'test';
    process.env.TOKEN_ENCRYPTION_KEY = '12345678901234567890123456789012'; // 32 bytes for testing
    
    // Clear any existing nock interceptors
    nock.cleanAll();
    
    return { db, mongoUri };
}

/**
 * Create test Express app with routes
 */
export function createTestApp() {
    const app = express();
    
    // Basic middleware
    app.use(cors());
    app.use(express.json());
    
    // Health check endpoint
    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });
    
    return app;
}

/**
 * Create test app with actual routes
 */
export async function createTestAppWithRoutes() {
    const app = express();
    
    // Basic middleware
    app.use(cors());
    app.use(express.json());
    
    // Import and mount routes
    try {
        const { default: databaseRoutes } = await import('../routes/databaseRoutes.js');
        app.use('/api/database', databaseRoutes);
        
        // Add a simple health endpoint for testing
        app.get('/health', (req, res) => {
            res.status(200).json({
                status: 'OK',
                timestamp: new Date().toISOString()
            });
        });
        
    } catch (error) {
        console.warn('Could not load routes:', error.message);
    }
    
    return app;
}

/**
 * Setup mock external APIs
 */
export function setupMockAPIs() {
    // Mock Pipedrive API
    const pipedriveScope = nock('https://api.pipedrive.com')
        .persist(); // Keep this mock active for all tests
    
    // Mock Xero API
    const xeroScope = nock('https://api.xero.com')
        .persist();
        
    return { pipedriveScope, xeroScope };
}

/**
 * Mock Pipedrive authentication response
 */
export function mockPipedriveAuth(companyId = '12345') {
    return nock('https://oauth.pipedrive.com')
        .post('/oauth/token')
        .reply(200, {
            access_token: 'mock_pipedrive_token',
            refresh_token: 'mock_refresh_token',
            token_type: 'Bearer',
            expires_in: 3600,
            api_domain: `company-${companyId}.pipedrive.com`
        });
}

/**
 * Mock Xero authentication response
 */
export function mockXeroAuth() {
    return nock('https://identity.xero.com')
        .post('/connect/token')
        .reply(200, {
            access_token: 'mock_xero_token',
            refresh_token: 'mock_xero_refresh',
            token_type: 'Bearer',
            expires_in: 1800
        });
}

/**
 * Mock Pipedrive API responses
 */
export function mockPipedriveAPI(companyId = '12345') {
    const domain = `company-${companyId}.pipedrive.com`;
    
    // Create persistent mock for the user endpoint
    const userMock = nock(`https://${domain}`)
        .persist()
        .get('/v1/users/me')
        .reply(200, {
            success: true,
            data: {
                id: 123,
                name: 'Test User',
                email: 'test@company.com',
                company_id: parseInt(companyId)
            }
        });
    
    // Create mock for deals endpoint
    const dealsMock = nock(`https://${domain}`)
        .persist()
        .get(/\/v1\/deals\/\d+/)
        .reply(200, {
            success: true,
            data: {
                id: 12345,
                title: 'Test Deal',
                value: 50000,
                currency: 'USD',
                person_id: { value: 456, name: 'John Doe' },
                org_id: { value: 789, name: 'Test Company' }
            }
        });
    
    return userMock;
}

/**
 * Mock Xero API responses
 */
export function mockXeroAPI() {
    return nock('https://api.xero.com')
        .get('/connections')
        .reply(200, [
            {
                tenantId: 'mock-tenant-id',
                tenantName: 'Test Company'
            }
        ]);
}

/**
 * Clean up test environment
 */
export async function teardownTestEnvironment() {
    // Clean nock interceptors
    nock.cleanAll();
    
    // Close database connections
    if (connection) {
        await connection.close();
    }
    
    if (mongod) {
        await mongod.stop();
    }
}

/**
 * Create test data in database
 */
export async function createTestData(database) {
    // Create test collections and data
    const authTokens = database.collection('auth_tokens');
    const projectSequences = database.collection('project_sequences');
    const dealProjectMappings = database.collection('deal_project_mappings');
    
    // Insert sample test data
    await authTokens.insertOne({
        companyId: '12345',
        service: 'pipedrive',
        encryptedAccessToken: 'encrypted_token_data',
        apiDomain: 'company-12345.pipedrive.com',
        tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        isActive: true,
        createdAt: new Date()
    });
    
    await projectSequences.insertOne({
        departmentCode: 'NY',
        year: 25,
        lastSequenceNumber: 5,
        createdAt: new Date()
    });
    
    await dealProjectMappings.insertOne({
        projectNumber: 'NY25001',
        pipedriveDealIds: [12345],
        department: 'Navy',
        departmentCode: 'NY',
        year: 25,
        sequence: 1,
        createdAt: new Date()
    });
    
    return { authTokens, projectSequences, dealProjectMappings };
}

/**
 * Utility function to wait for async operations
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
} 