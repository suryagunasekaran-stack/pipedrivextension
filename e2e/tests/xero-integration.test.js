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
import { 
  runComplexXeroIntegrationTest, 
  runMultiCurrencyXeroIntegrationTest 
} from './xero-integration/tests/complex-integration-test.js';
import { 
  runNoProductsTest,
  runZeroNegativeProductsTest,
  runSpecialCharactersTest,
  runMultipleTaxRatesTest,
  runDiscountedProductsTest,
  runMissingOrganizationTest
} from './xero-integration/tests/edge-cases-test.js';

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

  describe('Basic Xero Quote Integration', () => {
    test('should create deal with basic products and sync to Xero quote', async () => {
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

  describe('Complex Xero Quote Integration', () => {
    test('should create deal with complex products (tax, discounts, accounts) and sync to Xero', async () => {
      const result = await runComplexXeroIntegrationTest(testConfig);
      
      // Verify the complex test was successful
      expect(result.success).toBe(true);
      expect(result.dealId).toBeDefined();
      expect(result.quoteNumber).toBeDefined();
      expect(result.quoteId).toBeDefined();
      expect(result.dealProducts).toBe(5); // Complex test has 5 products
      expect(result.customFieldsUpdated).toBeGreaterThan(0);
      expect(result.testType).toBe('complex');
      
      // Verify complex fields
      expect(result.currency).toBeDefined();
      expect(result.finalTotal).toBeDefined();
      expect(parseFloat(result.finalTotal)).toBeGreaterThan(0);
      
      console.log(`🎯 Complex test completed - Currency: ${result.currency}, Total: $${result.finalTotal}`);
    }, 90000); // 90 second timeout for complex test
  });

  // Multi-Currency tests commented out for debugging complex test
  // describe('Multi-Currency Xero Quote Integration', () => {
  //   test('should create USD deal with multi-currency products and sync to Xero', async () => {
  //     const result = await runMultiCurrencyXeroIntegrationTest(testConfig, 'USD');
  //     
  //     // Verify the multi-currency test was successful
  //     expect(result.success).toBe(true);
  //     expect(result.dealId).toBeDefined();
  //     expect(result.quoteNumber).toBeDefined();
  //     expect(result.quoteId).toBeDefined();
  //     expect(result.dealProducts).toBe(2); // Multi-currency test has 2 products
  //     expect(result.testType).toBe('multi-currency');
  //     
  //     // Verify currency handling
  //     expect(result.currency).toBe('USD');
  //     expect(result.finalTotal).toBeDefined();
  //     expect(parseFloat(result.finalTotal)).toBeGreaterThan(0);
  //     
  //     console.log(`🌍 Multi-currency test completed - Currency: ${result.currency}, Total: $${result.finalTotal}`);
  //   }, 90000); // 90 second timeout for multi-currency test

  //   test('should create EUR deal with multi-currency products and sync to Xero', async () => {
  //     const result = await runMultiCurrencyXeroIntegrationTest(testConfig, 'EUR');
  //     
  //     // Verify the EUR test was successful
  //     expect(result.success).toBe(true);
  //     expect(result.dealId).toBeDefined();
  //     expect(result.quoteNumber).toBeDefined();
  //     expect(result.quoteId).toBeDefined();
  //     expect(result.dealProducts).toBe(2);
  //     expect(result.testType).toBe('multi-currency');
  //     
  //     // Verify EUR currency handling
  //     expect(result.currency).toBe('EUR');
  //     expect(result.finalTotal).toBeDefined();
  //     expect(parseFloat(result.finalTotal)).toBeGreaterThan(0);
  //     
  //     console.log(`🇪🇺 EUR test completed - Currency: ${result.currency}, Total: $${result.finalTotal}`);
  //   }, 90000); // 90 second timeout for EUR test
  // });

  describe('Edge Cases Xero Quote Integration', () => {
    test('should handle no products scenario gracefully', async () => {
      const result = await runNoProductsTest(testConfig);
      
      expect(result.success).toBe(true);
      expect(result.reason).toContain('no products');
    }, 60000);

    test('should handle zero/negative product values correctly', async () => {
      const result = await runZeroNegativeProductsTest(testConfig);
      
      expect(result.success).toBe(true);
      expect(result.reason).toMatch(/zero|negative|invalid|rejected/i);
    }, 60000);

    test('should handle special characters in product names/descriptions', async () => {
      const result = await runSpecialCharactersTest(testConfig);
      
      expect(result.success).toBe(true);
      expect(result.dealId).toBeDefined();
      expect(result.quoteNumber).toBeDefined();
    }, 60000);

    test('should handle multiple tax rates in same quote', async () => {
      const result = await runMultipleTaxRatesTest(testConfig);
      
      expect(result.success).toBe(true);
      expect(result.dealId).toBeDefined();
      expect(result.quoteNumber).toBeDefined();
    }, 60000);

    test('should handle line-level discounts correctly', async () => {
      const result = await runDiscountedProductsTest(testConfig);
      
      expect(result.success).toBe(true);
      expect(result.dealId).toBeDefined();
      expect(result.quoteNumber).toBeDefined();
    }, 60000);

    test('should handle missing organization gracefully', async () => {
      const result = await runMissingOrganizationTest(testConfig);
      
      expect(result.success).toBe(true);
      expect(result.reason).toContain('organization');
    }, 60000);
  });
}); 