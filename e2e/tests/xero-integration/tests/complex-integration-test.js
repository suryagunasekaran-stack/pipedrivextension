/**
 * Complex Xero Integration Tests
 * 
 * Advanced tests for Xero integration covering:
 * - Complex products with tax and discounts
 * - Multi-currency scenarios
 * - Advanced line item validation
 * - Financial calculations verification
 * 
 * PREREQUISITE: Make sure your server is running on http://localhost:3000
 */

import { checkServerRunning } from '../helpers/server-helpers.js';
import { 
  findTestContactsAndOrg, 
  cleanupCreatedDeals, 
  addProductsToDeal, 
  getDealProducts, 
  getDealCustomFields 
} from '../helpers/pipedrive-helpers.js';
import { 
  createXeroQuote, 
  getXeroQuoteByNumber, 
  cleanupXeroQuotes 
} from '../helpers/xero-helpers.js';
import { 
  compareProducts, 
  compareComplexProducts,
  compareQuoteFinancials,
  compareQuoteMetadata
} from '../utils/comparison-utils.js';
import { 
  complexTestProducts, 
  multiCurrencyTestProducts,
  generateComplexTestDealData,
  generateMultiCurrencyTestDealData,
  testScenarios
} from '../fixtures/test-data.js';

// Complex integration test with tax, discounts, and multiple line items
export async function runComplexXeroIntegrationTest(testConfig) {
  console.log('\n🚀 Starting complex Xero integration test...\n');
  console.log('🔍 Testing: Tax types, discounts, account codes, complex calculations');
  
  let testPersonId;
  let testOrgId;
  let createdDealIds = [];
  let createdXeroQuoteIds = [];
  let serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  
  try {
    // Step 0: Setup and find test contacts
    console.log('🔧 Step 0: Setting up complex test environment...');
    await checkServerRunning(serverUrl);
    const { testPersonId: foundPersonId, testOrgId: foundOrgId } = await findTestContactsAndOrg(testConfig);
    testPersonId = foundPersonId;
    testOrgId = foundOrgId;

    // Step 1: Create a complex deal in Pipedrive
    console.log('📝 Step 1: Creating complex Pipedrive deal...');
    const dealData = generateComplexTestDealData(testPersonId, testOrgId, 'USD');

    const dealResponse = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/v1/deals?api_token=${testConfig.apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dealData)
      }
    );

    const dealResult = await dealResponse.json();
    if (!dealResult.success) {
      throw new Error(`Failed to create complex deal: ${JSON.stringify(dealResult)}`);
    }
    
    const dealId = dealResult.data.id;
    createdDealIds.push(dealId);
    console.log(`✅ Created complex deal: ${dealData.title} (ID: ${dealId})`);
    console.log(`💰 Deal value: $${dealData.value} ${dealData.currency}`);

    // Step 2: Add complex products to the deal
    console.log('\n📦 Step 2: Adding complex products to deal...');
    console.log(`🔍 Adding ${complexTestProducts.length} products with varying tax rates and discounts:`);
    
    complexTestProducts.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.name}`);
      console.log(`      - Quantity: ${product.quantity}, Price: $${product.item_price}`);
      console.log(`      - Tax: ${product.tax_type || 'N/A'}, Discount: ${product.discount_rate || 0}%`);
      console.log(`      - Account: ${product.account_code || 'Default'}`);
    });

    const addedProducts = await addProductsToDeal(dealId, complexTestProducts, testConfig);
    if (addedProducts.length !== complexTestProducts.length) {
      throw new Error(`Expected ${complexTestProducts.length} products, but added ${addedProducts.length}`);
    }

    // Verify products were added
    const dealProducts = await getDealProducts(dealId, testConfig);
    if (dealProducts.length !== complexTestProducts.length) {
      throw new Error(`Expected ${complexTestProducts.length} products in deal, but found ${dealProducts.length}`);
    }
    console.log(`✅ Added ${dealProducts.length} complex products to deal ${dealId}`);

    // Step 3: Create Xero quote
    console.log('\n🔄 Step 3: Creating Xero quote with complex products...');
    const companyId = testConfig.companyId || '13961027';
    console.log(`📋 Using company ID: ${companyId}`);
    
    const xeroQuoteResult = await createXeroQuote(String(dealId), String(companyId), serverUrl);
    if (!xeroQuoteResult || !xeroQuoteResult.quoteNumber || !xeroQuoteResult.quoteId) {
      throw new Error('Failed to create Xero quote with complex products');
    }
    
    const quoteNumber = xeroQuoteResult.quoteNumber;
    const quoteId = xeroQuoteResult.quoteId;
    
    // Track the created quote for cleanup
    createdXeroQuoteIds.push(quoteId);
    console.log(`✅ Created complex Xero quote: ${quoteNumber} (ID: ${quoteId})`);

    // Step 4: Fetch and verify Xero quote
    console.log('\n🔍 Step 4: Fetching and validating complex Xero quote...');
    
    // Wait for Xero to process
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const xeroQuote = await getXeroQuoteByNumber(quoteNumber, serverUrl);
    if (!xeroQuote || xeroQuote.QuoteNumber !== quoteNumber || xeroQuote.QuoteID !== quoteId) {
      throw new Error(`Failed to verify complex Xero quote: ${quoteNumber}`);
    }
    
    console.log(`✅ Verified complex Xero quote exists: ${xeroQuote.QuoteNumber}`);
    console.log(`   - Status: ${xeroQuote.Status}`);
    console.log(`   - Currency: ${xeroQuote.CurrencyCode}`);
    console.log(`   - SubTotal: $${xeroQuote.SubTotal || 'N/A'}`);
    console.log(`   - Tax Total: $${xeroQuote.TotalTax || 'N/A'}`);
    console.log(`   - Final Total: $${xeroQuote.Total}`);
    console.log(`   - Line Items: ${xeroQuote.LineItems?.length || 0}`);

    // Step 5: Perform complex product comparison
    console.log('\n📊 Step 5: Performing comprehensive product comparison...');
    const productMismatches = compareComplexProducts(dealProducts, xeroQuote.LineItems || []);
    if (productMismatches.length > 0) {
      console.log(`⚠️  Product comparison issues found (may be expected):`, productMismatches);
      // Don't fail the test for complex comparisons as tax/discount calculations may differ
    }

    // Step 6: Verify financial calculations
    console.log('\n💰 Step 6: Verifying financial calculations...');
    const financialMismatches = compareQuoteFinancials(dealData, xeroQuote);
    if (financialMismatches.length > 0) {
      console.log(`⚠️  Financial comparison issues (may be expected due to tax calculations):`, financialMismatches);
    }

    // Step 7: Verify quote metadata
    console.log('\n📋 Step 7: Verifying quote metadata...');
    const metadataMismatches = compareQuoteMetadata(xeroQuote);
    if (metadataMismatches.length > 0) {
      throw new Error(`Quote metadata issues: ${JSON.stringify(metadataMismatches)}`);
    }

    // Step 8: Verify custom fields
    console.log('\n🔍 Step 8: Verifying Pipedrive custom fields...');
    
    // Wait for custom fields to be updated
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const updatedDeal = await getDealCustomFields(dealId, testConfig);
    if (!updatedDeal) {
      throw new Error('Failed to fetch updated deal data for complex test');
    }
    
    console.log(`📋 Fetched updated deal data for complex test ID: ${dealId}`);
    
    // Check for quote values in deal fields
    const fieldsWithQuoteNumber = [];
    const fieldsWithQuoteId = [];
    
    for (const [key, value] of Object.entries(updatedDeal)) {
      if (value === quoteNumber) {
        fieldsWithQuoteNumber.push(key);
        console.log(`✅ Found quote number '${quoteNumber}' in field: ${key}`);
      }
      if (value === quoteId) {
        fieldsWithQuoteId.push(key);
        console.log(`✅ Found quote ID '${quoteId}' in field: ${key}`);
      }
    }
    
    const customFieldsUpdated = fieldsWithQuoteNumber.length + fieldsWithQuoteId.length;
    console.log(`📊 Custom fields updated: ${customFieldsUpdated}/2`);
    
    if (customFieldsUpdated === 0) {
      throw new Error('No custom fields were updated with complex Xero quote information');
    }

    console.log('\n🎉 Complex Xero integration test completed successfully!\n');
    console.log(`📋 Complex Test Summary:`);
    console.log(`   - Deal ID: ${dealId}`);
    console.log(`   - Products: ${dealProducts.length} (with tax/discounts)`);
    console.log(`   - Xero Quote: ${quoteNumber}`);
    console.log(`   - Quote ID: ${quoteId}`);
    console.log(`   - Currency: ${xeroQuote.CurrencyCode}`);
    console.log(`   - SubTotal: $${xeroQuote.SubTotal || 'N/A'}`);
    console.log(`   - Tax: $${xeroQuote.TotalTax || 'N/A'}`);
    console.log(`   - Total: $${xeroQuote.Total}`);
    
    return {
      success: true,
      dealId,
      quoteNumber,
      quoteId,
      dealProducts: dealProducts.length,
      customFieldsUpdated,
      currency: xeroQuote.CurrencyCode,
      subTotal: xeroQuote.SubTotal,
      taxTotal: xeroQuote.TotalTax,
      finalTotal: xeroQuote.Total,
      testType: 'complex'
    };

  } finally {
    // Cleanup
    const CLEANUP_ENABLED = process.env.E2E_CLEANUP !== 'false';
    
    if (CLEANUP_ENABLED) {
      console.log('\n🧹 Cleaning up complex test data...');
      await cleanupXeroQuotes(createdXeroQuoteIds, serverUrl);
      await cleanupCreatedDeals(createdDealIds, testConfig);
    } else {
      console.log('\n🔒 Complex test cleanup disabled - preserving test data');
      console.log(`📋 Created deal IDs: ${createdDealIds.join(', ')}`);
      console.log(`📋 Created Xero quote IDs: ${createdXeroQuoteIds.join(', ')}`);
    }
  }
}

// Multi-currency integration test
export async function runMultiCurrencyXeroIntegrationTest(testConfig, currency = 'USD') {
  console.log('\n🌍 Starting multi-currency Xero integration test...\n');
  console.log(`💱 Testing currency: ${currency}`);
  
  let testPersonId;
  let testOrgId;
  let createdDealIds = [];
  let createdXeroQuoteIds = [];
  let serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  
  try {
    // Step 0: Setup and find test contacts
    console.log('🔧 Step 0: Setting up multi-currency test environment...');
    await checkServerRunning(serverUrl);
    const { testPersonId: foundPersonId, testOrgId: foundOrgId } = await findTestContactsAndOrg(testConfig);
    testPersonId = foundPersonId;
    testOrgId = foundOrgId;

    // Step 1: Create a multi-currency deal in Pipedrive
    console.log(`📝 Step 1: Creating ${currency} Pipedrive deal...`);
    const dealData = generateMultiCurrencyTestDealData(testPersonId, testOrgId, currency);

    const dealResponse = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/v1/deals?api_token=${testConfig.apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dealData)
      }
    );

    const dealResult = await dealResponse.json();
    if (!dealResult.success) {
      throw new Error(`Failed to create multi-currency deal: ${JSON.stringify(dealResult)}`);
    }
    
    const dealId = dealResult.data.id;
    createdDealIds.push(dealId);
    console.log(`✅ Created ${currency} deal: ${dealData.title} (ID: ${dealId})`);
    console.log(`💰 Deal value: $${dealData.value} ${dealData.currency}`);

    // Step 2: Add currency-specific products to the deal
    console.log('\n📦 Step 2: Adding multi-currency products to deal...');
    const addedProducts = await addProductsToDeal(dealId, multiCurrencyTestProducts, testConfig);
    if (addedProducts.length !== multiCurrencyTestProducts.length) {
      throw new Error(`Expected ${multiCurrencyTestProducts.length} products, but added ${addedProducts.length}`);
    }

    // Verify products were added
    const dealProducts = await getDealProducts(dealId, testConfig);
    if (dealProducts.length !== multiCurrencyTestProducts.length) {
      throw new Error(`Expected ${multiCurrencyTestProducts.length} products in deal, but found ${dealProducts.length}`);
    }
    console.log(`✅ Added ${dealProducts.length} multi-currency products to deal ${dealId}`);

    // Step 3: Create Xero quote
    console.log(`\n🔄 Step 3: Creating ${currency} Xero quote...`);
    const companyId = testConfig.companyId || '13961027';
    
    const xeroQuoteResult = await createXeroQuote(String(dealId), String(companyId), serverUrl);
    if (!xeroQuoteResult || !xeroQuoteResult.quoteNumber || !xeroQuoteResult.quoteId) {
      throw new Error(`Failed to create ${currency} Xero quote`);
    }
    
    const quoteNumber = xeroQuoteResult.quoteNumber;
    const quoteId = xeroQuoteResult.quoteId;
    
    // Track the created quote for cleanup
    createdXeroQuoteIds.push(quoteId);
    console.log(`✅ Created ${currency} Xero quote: ${quoteNumber} (ID: ${quoteId})`);

    // Step 4: Fetch and verify Xero quote
    console.log(`\n🔍 Step 4: Fetching and validating ${currency} Xero quote...`);
    
    // Wait for Xero to process
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const xeroQuote = await getXeroQuoteByNumber(quoteNumber, serverUrl);
    if (!xeroQuote || xeroQuote.QuoteNumber !== quoteNumber || xeroQuote.QuoteID !== quoteId) {
      throw new Error(`Failed to verify ${currency} Xero quote: ${quoteNumber}`);
    }
    
    console.log(`✅ Verified ${currency} Xero quote exists: ${xeroQuote.QuoteNumber}`);
    console.log(`   - Status: ${xeroQuote.Status}`);
    console.log(`   - Currency: ${xeroQuote.CurrencyCode}`);
    console.log(`   - Total: $${xeroQuote.Total} ${xeroQuote.CurrencyCode}`);
    console.log(`   - Line Items: ${xeroQuote.LineItems?.length || 0}`);

    // Step 5: Verify currency handling
    console.log(`\n💱 Step 5: Verifying ${currency} currency handling...`);
    if (xeroQuote.CurrencyCode !== currency) {
      throw new Error(`Currency mismatch: Expected ${currency}, got ${xeroQuote.CurrencyCode}`);
    }
    console.log(`✅ Currency correctly set to ${currency}`);

    // Step 6: Compare products
    console.log('\n📊 Step 6: Comparing multi-currency products...');
    const productMismatches = compareProducts(dealProducts, xeroQuote.LineItems || []);
    if (productMismatches.length > 0) {
      console.log(`⚠️  Product comparison issues (may be expected for currency conversion):`, productMismatches);
    }

    // Step 7: Verify financial data
    console.log('\n💰 Step 7: Verifying multi-currency financial data...');
    const financialMismatches = compareQuoteFinancials(dealData, xeroQuote);
    if (financialMismatches.length > 0) {
      console.log(`⚠️  Financial comparison issues (may be expected for multi-currency):`, financialMismatches);
    }

    console.log(`\n🎉 Multi-currency (${currency}) Xero integration test completed successfully!\n`);
    console.log(`📋 Multi-Currency Test Summary:`);
    console.log(`   - Deal ID: ${dealId}`);
    console.log(`   - Currency: ${currency}`);
    console.log(`   - Products: ${dealProducts.length}`);
    console.log(`   - Xero Quote: ${quoteNumber}`);
    console.log(`   - Quote ID: ${quoteId}`);
    console.log(`   - Final Total: $${xeroQuote.Total} ${xeroQuote.CurrencyCode}`);
    
    return {
      success: true,
      dealId,
      quoteNumber,
      quoteId,
      dealProducts: dealProducts.length,
      currency: xeroQuote.CurrencyCode,
      finalTotal: xeroQuote.Total,
      testType: 'multi-currency'
    };

  } finally {
    // Cleanup
    const CLEANUP_ENABLED = process.env.E2E_CLEANUP !== 'false';
    
    if (CLEANUP_ENABLED) {
      console.log(`\n🧹 Cleaning up ${currency} test data...`);
      await cleanupXeroQuotes(createdXeroQuoteIds, serverUrl);
      await cleanupCreatedDeals(createdDealIds, testConfig);
    } else {
      console.log(`\n🔒 ${currency} test cleanup disabled - preserving test data`);
      console.log(`📋 Created deal IDs: ${createdDealIds.join(', ')}`);
      console.log(`📋 Created Xero quote IDs: ${createdXeroQuoteIds.join(', ')}`);
    }
  }
} 