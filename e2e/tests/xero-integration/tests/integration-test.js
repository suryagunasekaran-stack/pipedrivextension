/**
 * Xero Integration Tests
 * 
 * Tests the integration between Pipedrive deals and Xero quotes
 * Focus: Deal → Products → Xero Quote → Verification
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
import { compareProducts, compareQuoteMetadata } from '../utils/comparison-utils.js';
import { testProducts, generateTestDealData } from '../fixtures/test-data.js';

export async function runXeroIntegrationTest(testConfig) {
  console.log('\n🚀 Starting Xero integration test...\n');
  
  let testPersonId;
  let testOrgId;
  let createdDealIds = [];
  let createdXeroQuoteIds = [];
  let serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  
  try {
    // Step 0: Setup and find test contacts
    console.log('🔧 Step 0: Setting up test environment...');
    await checkServerRunning(serverUrl);
    const { testPersonId: foundPersonId, testOrgId: foundOrgId } = await findTestContactsAndOrg(testConfig);
    testPersonId = foundPersonId;
    testOrgId = foundOrgId;

    // Step 1: Create a deal in Pipedrive
    console.log('📝 Step 1: Creating Pipedrive deal...');
    const dealData = generateTestDealData(testPersonId, testOrgId);

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
      throw new Error(`Failed to create deal: ${JSON.stringify(dealResult)}`);
    }
    
    const dealId = dealResult.data.id;
    createdDealIds.push(dealId);
    console.log(`✅ Created deal: ${dealData.title} (ID: ${dealId})`);

    // Step 2: Add products to the deal
    console.log('\n📦 Step 2: Adding products to deal...');
    const addedProducts = await addProductsToDeal(dealId, testProducts, testConfig);
    if (addedProducts.length !== 2) {
      throw new Error(`Expected 2 products, but added ${addedProducts.length}`);
    }

    // Verify products were added
    const dealProducts = await getDealProducts(dealId, testConfig);
    if (dealProducts.length !== 2) {
      throw new Error(`Expected 2 products in deal, but found ${dealProducts.length}`);
    }
    console.log(`✅ Added ${dealProducts.length} products to deal ${dealId}`);

    // Step 3: Create Xero quote
    console.log('\n🔄 Step 3: Creating Xero quote...');
    const companyId = testConfig.companyId || '13961027';
    console.log(`📋 Using company ID: ${companyId}`);
    
    const xeroQuoteResult = await createXeroQuote(String(dealId), String(companyId), serverUrl);
    if (!xeroQuoteResult || !xeroQuoteResult.quoteNumber || !xeroQuoteResult.quoteId) {
      throw new Error('Failed to create Xero quote or missing quote details');
    }
    
    const quoteNumber = xeroQuoteResult.quoteNumber;
    const quoteId = xeroQuoteResult.quoteId;
    
    // Track the created quote for cleanup
    createdXeroQuoteIds.push(quoteId);
    console.log(`✅ Created Xero quote: ${quoteNumber} (ID: ${quoteId})`);

    // Step 4: Fetch and verify Xero quote
    console.log('\n🔍 Step 4: Fetching Xero quote for verification...');
    
    // Wait for Xero to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const xeroQuote = await getXeroQuoteByNumber(quoteNumber, serverUrl);
    if (!xeroQuote || xeroQuote.QuoteNumber !== quoteNumber || xeroQuote.QuoteID !== quoteId) {
      throw new Error(`Failed to verify Xero quote: ${quoteNumber}`);
    }
    
    console.log(`✅ Verified Xero quote exists: ${xeroQuote.QuoteNumber}`);
    console.log(`   - Status: ${xeroQuote.Status}`);
    console.log(`   - Total: ${xeroQuote.Total}`);
    console.log(`   - Line Items: ${xeroQuote.LineItems?.length || 0}`);

    // Step 5: Compare products
    console.log('\n📊 Step 5: Comparing products between Pipedrive and Xero...');
    const productMismatches = compareProducts(dealProducts, xeroQuote.LineItems || []);
    if (productMismatches.length > 0) {
      throw new Error(`Product mismatches found: ${JSON.stringify(productMismatches)}`);
    }

    // Step 5.5: Verify quote metadata
    console.log('\n📋 Step 5.5: Verifying quote metadata...');
    const metadataMismatches = compareQuoteMetadata(xeroQuote, { dealId });
    if (metadataMismatches.length > 0) {
      throw new Error(`Quote metadata issues: ${JSON.stringify(metadataMismatches)}`);
    }

    // Step 6: Verify custom fields
    console.log('\n🔍 Step 6: Verifying Pipedrive custom fields...');
    
    // Wait for custom fields to be updated
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const updatedDeal = await getDealCustomFields(dealId, testConfig);
    if (!updatedDeal) {
      throw new Error('Failed to fetch updated deal data');
    }
    
    console.log(`📋 Fetched updated deal data for ID: ${dealId}`);
    
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
      throw new Error('No custom fields were updated with Xero quote information');
    }

    console.log('\n🎉 Xero integration test completed successfully!\n');
    console.log(`📋 Summary:`);
    console.log(`   - Deal ID: ${dealId}`);
    console.log(`   - Products: ${dealProducts.length}`);
    console.log(`   - Xero Quote: ${quoteNumber}`);
    console.log(`   - Quote ID: ${quoteId}`);
    console.log(`   - Total Value: $${dealData.value}`);
    
    return {
      success: true,
      dealId,
      quoteNumber,
      quoteId,
      dealProducts: dealProducts.length,
      customFieldsUpdated
    };

  } finally {
    // Cleanup
    const CLEANUP_ENABLED = process.env.E2E_CLEANUP !== 'false';
    
    if (CLEANUP_ENABLED) {
      console.log('\n🧹 Cleaning up test data...');
      await cleanupXeroQuotes(createdXeroQuoteIds, serverUrl);
      await cleanupCreatedDeals(createdDealIds, testConfig);
    } else {
      console.log('\n🔒 Cleanup disabled - preserving test data');
      console.log(`📋 Created deal IDs: ${createdDealIds.join(', ')}`);
      console.log(`📋 Created Xero quote IDs: ${createdXeroQuoteIds.join(', ')}`);
    }
  }
} 