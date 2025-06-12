#!/usr/bin/env node

/**
 * Edge Cases Test Runner
 * 
 * Run specific edge case tests for Xero integration
 * 
 * Usage:
 *   node e2e/run-edge-cases-tests.js [test-type]
 * 
 * Test types:
 *   all           - Run all edge cases tests (default)
 *   no-products   - Test deal with no products
 *   zero-negative - Test zero-value and negative products
 *   special-chars - Test products with special characters
 *   multiple-tax  - Test multiple tax rates
 *   discounts     - Test line-level discounts
 *   missing-org   - Test deal without organization
 */

import { TestEnvironment } from './config/test-environment.js';
import { 
  runAllEdgeCasesTests,
  runNoProductsTest,
  runZeroNegativeProductsTest,
  runSpecialCharactersTest,
  runMultipleTaxRatesTest,
  runDiscountedProductsTest,
  runMissingOrganizationTest
} from './tests/xero-integration/tests/edge-cases-test.js';

async function main() {
  const testType = process.argv[2] || 'all';
  
  console.log(`🧪 Running edge cases test: ${testType}\n`);
  
  let testEnv;
  
  try {
    // Setup test environment (same as existing tests)
    testEnv = new TestEnvironment();
    await testEnv.setup();
    const testConfig = await testEnv.getTestConfig();
    
    console.log('🔧 Test environment ready');
    console.log(`🌐 Server URL: ${testConfig.baseUrl}`);
    console.log(`🏢 Company ID: ${testConfig.companyId}`);
    console.log(`📋 Company Domain: ${testConfig.companyDomain}\n`);
    
    let result;
    
    // Run the specified test
    switch (testType) {
      case 'all':
        result = await runAllEdgeCasesTests(testConfig);
        break;
      case 'no-products':
        result = await runNoProductsTest(testConfig);
        break;
      case 'zero-negative':
        result = await runZeroNegativeProductsTest(testConfig);
        break;
      case 'special-chars':
        result = await runSpecialCharactersTest(testConfig);
        break;
      case 'multiple-tax':
        result = await runMultipleTaxRatesTest(testConfig);
        break;
      case 'discounts':
        result = await runDiscountedProductsTest(testConfig);
        break;
      case 'missing-org':
        result = await runMissingOrganizationTest(testConfig);
        break;
      default:
        throw new Error(`Unknown test type: ${testType}. Use --help to see available options.`);
    }
    
    if (result.success) {
      console.log('\n🎉 Test completed successfully!');
      if (result.summary) {
        console.log(`📊 Summary: ${result.summary.passed}/${result.summary.total} tests passed`);
      }
      process.exit(0);
    } else {
      console.log('\n❌ Test failed!');
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
      if (result.summary) {
        console.log(`📊 Summary: ${result.summary.passed}/${result.summary.total} tests passed`);
      }
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test runner error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup test environment
    if (testEnv) {
      await testEnv.cleanup();
    }
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Edge Cases Test Runner

Usage:
  node e2e/run-edge-cases-tests.js [test-type]

Test types:
  all           - Run all edge cases tests (default)
  no-products   - Test deal with no products
  zero-negative - Test zero-value and negative products  
  special-chars - Test products with special characters
  multiple-tax  - Test multiple tax rates
  discounts     - Test line-level discounts
  missing-org   - Test deal without organization

Examples:
  node e2e/run-edge-cases-tests.js
  node e2e/run-edge-cases-tests.js special-chars
  node e2e/run-edge-cases-tests.js multiple-tax

Environment Setup:
  Make sure you have a .env.test file with the required test credentials.
  The test environment will be automatically set up and cleaned up.
`);
  process.exit(0);
}

main(); 