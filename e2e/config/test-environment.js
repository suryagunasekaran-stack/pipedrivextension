/**
 * E2E Test Environment Configuration
 * 
 * This module sets up the test environment with:
 * - Test database configuration
 * - Pre-authenticated tokens
 * - Test data fixtures
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

export class TestEnvironment {
  constructor() {
    this.mongoServer = null;
    this.mongoClient = null;
    this.database = null;
    this.encryptionKey = null;
  }

  async setup() {
    console.log('🔧 Setting up E2E test environment...');

    // Start MongoDB Memory Server
    this.mongoServer = await MongoMemoryServer.create();
    const mongoUri = this.mongoServer.getUri();
    
    // Set environment variables for the app
    process.env.MONGODB_URI = mongoUri;
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error'; // Reduce noise during tests
    
    // Generate test encryption key
    this.encryptionKey = crypto.randomBytes(32).toString('hex');
    process.env.TOKEN_ENCRYPTION_KEY = this.encryptionKey;

    // Connect to database
    this.mongoClient = new MongoClient(mongoUri);
    await this.mongoClient.connect();
    this.database = this.mongoClient.db('test_db');

    // Inject test tokens into database
    await this.injectTestTokens();

    // Create test data
    await this.createTestData();

    console.log('✅ Test environment ready');
    
    return {
      mongoUri,
      database: this.database,
      encryptionKey: this.encryptionKey
    };
  }

  async injectTestTokens() {
    const tokensCollection = this.database.collection('auth_tokens');

    // Encrypt tokens using the same method as the app
    const encryptToken = (token) => {
      const algorithm = 'aes-256-cbc';
      const key = Buffer.from(this.encryptionKey, 'hex');
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      
      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return {
        encrypted,
        iv: iv.toString('hex')
      };
    };

    // Inject Pipedrive token
    if (process.env.TEST_PIPEDRIVE_API_TOKEN) {
      const pipedriveToken = encryptToken(process.env.TEST_PIPEDRIVE_API_TOKEN);
      
      await tokensCollection.insertOne({
        companyId: '13961027', // Your actual Pipedrive company ID
        service: 'pipedrive',
        encryptedAccessToken: pipedriveToken.encrypted,
        encryptedRefreshToken: pipedriveToken.encrypted, // Same for API token
        iv: pipedriveToken.iv,
        apiDomain: `${process.env.TEST_PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com`,
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isActive: true
      });
    }

    // Inject Xero tokens
    if (process.env.TEST_XERO_ACCESS_TOKEN) {
      const xeroAccessToken = encryptToken(process.env.TEST_XERO_ACCESS_TOKEN);
      const xeroRefreshToken = encryptToken(process.env.TEST_XERO_REFRESH_TOKEN || process.env.TEST_XERO_ACCESS_TOKEN);
      
      await tokensCollection.insertOne({
        companyId: '13961027', // Your actual Pipedrive company ID
        service: 'xero',
        encryptedAccessToken: xeroAccessToken.encrypted,
        encryptedRefreshToken: xeroRefreshToken.encrypted,
        iv: xeroAccessToken.iv,
        tenantId: process.env.TEST_XERO_TENANT_ID,
        tokenExpiresAt: new Date(process.env.TEST_XERO_TOKEN_EXPIRES || Date.now() + 30 * 60 * 1000),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isActive: true
      });
    }
  }

  async createTestData() {
    // Create project sequences for different departments
    const sequencesCollection = this.database.collection('project_sequences');
    
    const departments = ['NY', 'EL', 'MC', 'AF', 'ED', 'LC'];
    const currentYear = new Date().getFullYear() % 100;
    
    for (const dept of departments) {
      await sequencesCollection.insertOne({
        departmentCode: dept,
        year: currentYear,
        lastSequenceNumber: 0,
        createdAt: new Date()
      });
    }

    // Create some test deal-project mappings
    const mappingsCollection = this.database.collection('deal_project_mappings');
    
    await mappingsCollection.insertOne({
      projectNumber: `NY${currentYear}001`,
      pipedriveDealIds: [99999], // Test deal ID
      department: 'Navy',
      departmentCode: 'NY',
      year: currentYear,
      sequence: 1,
      createdAt: new Date(),
      lastUpdatedAt: new Date()
    });
  }

  async getTestDealId() {
    // Use the provided deal ID or fallback
    return process.env.TEST_PIPEDRIVE_DEAL_ID || '13961027';
  }

  async getTestConfig() {
    return {
      companyId: '13961027', // Your actual Pipedrive company ID
      dealId: await this.getTestDealId(),
      apiToken: process.env.TEST_PIPEDRIVE_API_TOKEN,
      companyDomain: process.env.TEST_PIPEDRIVE_COMPANY_DOMAIN,
      xeroTenantId: process.env.TEST_XERO_TENANT_ID,
      baseUrl: 'http://localhost:3000'
    };
  }

  async cleanup() {
    console.log('🧹 Cleaning up test environment...');

    if (this.mongoClient) {
      await this.mongoClient.close();
    }

    if (this.mongoServer) {
      await this.mongoServer.stop();
    }

    console.log('✅ Cleanup complete');
  }

  async resetDatabase() {
    // Clear all collections except auth_tokens
    const collections = await this.database.collections();
    
    for (const collection of collections) {
      if (collection.collectionName !== 'auth_tokens') {
        await collection.deleteMany({});
      }
    }

    // Re-create test data
    await this.createTestData();
  }
}

// Helper function to wait for server to be ready
export async function waitForServer(url, maxAttempts = 30) {
  console.log(`⏳ Waiting for server at ${url}...`);
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        console.log('✅ Server is ready');
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error('Server failed to start in time');
} 