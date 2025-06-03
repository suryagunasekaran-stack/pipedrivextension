/**
 * Test environment configuration
 * Sets up environment variables and configurations specifically for testing
 */

// Test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pipedriveapp_test';
process.env.DB_NAME = 'pipedriveapp_test';

// Test API endpoints (use mock servers or test instances)
process.env.PIPEDRIVE_API_URL = 'https://api-mock.pipedrive.com';
process.env.XERO_API_URL = 'https://api-mock.xero.com';

// Test OAuth credentials (use test/sandbox credentials)
process.env.PIPEDRIVE_CLIENT_ID = 'test_pipedrive_client_id';
process.env.PIPEDRIVE_CLIENT_SECRET = 'test_pipedrive_client_secret';
process.env.XERO_CLIENT_ID = 'test_xero_client_id';
process.env.XERO_CLIENT_SECRET = 'test_xero_client_secret';

// Test redirect URIs
process.env.PIPEDRIVE_REDIRECT_URI = 'http://localhost:3000/auth/pipedrive/callback';
process.env.XERO_REDIRECT_URI = 'http://localhost:3000/auth/xero/callback';

// Disable external API calls in test environment
process.env.DISABLE_EXTERNAL_APIS = 'true';

// Test logging configuration
process.env.LOG_LEVEL = 'silent'; // Reduce noise during tests

// Test database configuration
process.env.DB_CONNECTION_TIMEOUT = '5000';
process.env.DB_MAX_POOL_SIZE = '5';

console.log('🧪 Test environment configuration loaded');

export const testConfig = {
  mongodb: {
    uri: process.env.MONGODB_URI,
    dbName: process.env.DB_NAME
  },
  apis: {
    pipedrive: {
      baseUrl: process.env.PIPEDRIVE_API_URL,
      clientId: process.env.PIPEDRIVE_CLIENT_ID,
      clientSecret: process.env.PIPEDRIVE_CLIENT_SECRET
    },
    xero: {
      baseUrl: process.env.XERO_API_URL,
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET
    }
  },
  timeouts: {
    api: 5000,
    database: 5000
  }
};
