/**
 * Xero Integration Tests - Main Test File
 * 
 * Tests the integration between Pipedrive deals and Xero quotes
 * Focus: Deal → Products → Xero Quote → Verification
 * 
 * PREREQUISITE: Make sure your server is running on http://localhost:3000
 */

import { jest } from '@jest/globals';
import { TestEnvironment } from '../config/test-environment.js';
import { runXeroIntegrationTest } from './xero-integration/tests/integration-test.js';

describe('E2E: Xero Integration Tests', () => {
  let testEnv;
  let testConfig;
  
  // Cleanup configuration
  const CLEANUP_ENABLED = process.env.E2E_CLEANUP !== 'false';

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
    testConfig = await testEnv.getTestConfig();
    
    console.log(`🔧 Auto-cleanup is ${CLEANUP_ENABLED ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🌐 Server URL: ${process.env.SERVER_URL || 'http://localhost:3000'}`);
    
    if (!CLEANUP_ENABLED) {
      console.log('💡 To enable cleanup, remove E2E_CLEANUP=false from environment');
    }
  }, 30000);

  afterAll(async () => {
    // Cleanup test environment
    if (testEnv) {
      await testEnv.cleanup();
    }
    
    // Force cleanup any remaining handles
    if (global.gc) {
      global.gc();
    }
  });

  describe('Xero Quote Integration', () => {
    test('should create deal with products and sync to Xero quote', async () => {
      const result = await runXeroIntegrationTest(testConfig);
      
      // Verify the test was successful
      expect(result.success).toBe(true);
      expect(result.dealId).toBeDefined();
      expect(result.quoteNumber).toBeDefined();
      expect(result.quoteId).toBeDefined();
      expect(result.dealProducts).toBe(2);
      expect(result.customFieldsUpdated).toBeGreaterThan(0);
    }, 60000); // 60 second timeout
  });
}); 