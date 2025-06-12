/**
 * Xero Integration Test Suite
 * 
 * Comprehensive test suite for Pipedrive-Xero integration
 * Includes basic integration, complex scenarios, and edge cases
 */

import { runXeroIntegrationTest } from './tests/integration-test.js';
import { runComplexXeroIntegrationTest, runMultiCurrencyXeroIntegrationTest } from './tests/complex-integration-test.js';
import { 
  runAllEdgeCasesTests,
  runNoProductsTest,
  runZeroNegativeProductsTest,
  runSpecialCharactersTest,
  runMultipleTaxRatesTest,
  runDiscountedProductsTest,
  runMissingOrganizationTest
} from './tests/edge-cases-test.js';

// Export all test functions
export {
  // Basic integration tests
  runXeroIntegrationTest,
  
  // Complex integration tests
  runComplexXeroIntegrationTest,
  runMultiCurrencyXeroIntegrationTest,
  
  // Edge cases tests
  runAllEdgeCasesTests,
  runNoProductsTest,
  runZeroNegativeProductsTest,
  runSpecialCharactersTest,
  runMultipleTaxRatesTest,
  runDiscountedProductsTest,
  runMissingOrganizationTest
};

// Test configuration helper
export function createTestConfig() {
  const requiredEnvVars = [
    'PIPEDRIVE_COMPANY_DOMAIN',
    'PIPEDRIVE_API_TOKEN',
    'PIPEDRIVE_COMPANY_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  return {
    companyDomain: process.env.PIPEDRIVE_COMPANY_DOMAIN,
    apiToken: process.env.PIPEDRIVE_API_TOKEN,
    companyId: process.env.PIPEDRIVE_COMPANY_ID
  };
}

// Main test runner
export async function runAllTests() {
  console.log('🚀 Starting Xero Integration Test Suite...\n');
  
  try {
    const testConfig = createTestConfig();
    const results = {};
    
    // Run basic integration test
    console.log('📋 Running basic integration test...');
    results.basic = await runXeroIntegrationTest(testConfig);
    
    // Run complex integration test
    console.log('\n📋 Running complex integration test...');
    results.complex = await runComplexXeroIntegrationTest(testConfig);
    
    // Run edge cases tests
    console.log('\n📋 Running edge cases tests...');
    results.edgeCases = await runAllEdgeCasesTests(testConfig);
    
    // Summary
    console.log('\n🎉 Test Suite Complete!');
    console.log('========================');
    
    const allPassed = Object.values(results).every(result => result.success);
    const status = allPassed ? '✅ ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED';
    
    console.log(status);
    console.log(`Basic Integration: ${results.basic.success ? '✅' : '❌'}`);
    console.log(`Complex Integration: ${results.complex.success ? '✅' : '❌'}`);
    console.log(`Edge Cases: ${results.edgeCases.success ? '✅' : '❌'} (${results.edgeCases.summary?.passed || 0}/${results.edgeCases.summary?.total || 0})`);
    
    return { success: allPassed, results };
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Quick test runner for individual test types
export async function runQuickTest(testType = 'basic') {
  const testConfig = createTestConfig();
  
  switch (testType) {
    case 'basic':
      return await runXeroIntegrationTest(testConfig);
    case 'complex':
      return await runComplexXeroIntegrationTest(testConfig);
    case 'edge-cases':
      return await runAllEdgeCasesTests(testConfig);
    case 'no-products':
      return await runNoProductsTest(testConfig);
    case 'zero-negative':
      return await runZeroNegativeProductsTest(testConfig);
    case 'special-chars':
      return await runSpecialCharactersTest(testConfig);
    case 'multiple-tax':
      return await runMultipleTaxRatesTest(testConfig);
    case 'discounts':
      return await runDiscountedProductsTest(testConfig);
    case 'missing-org':
      return await runMissingOrganizationTest(testConfig);
    default:
      throw new Error(`Unknown test type: ${testType}`);
  }
} 