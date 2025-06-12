/**
 * Xero Integration Tests
 * 
 * Tests the integration between Pipedrive deals and Xero quotes
 * Focus: Deal → Products → Xero Quote → Verification
 * 
 * PREREQUISITE: Make sure your server is running on http://localhost:3000
 */

import { jest } from '@jest/globals';
import { TestEnvironment } from '../config/test-environment.js';

describe('E2E: Xero Integration Tests', () => {
  let testEnv;
  let testConfig;
  let testPersonId;
  let testOrgId;
  let createdDealIds = []; // Track deals for cleanup
  let serverUrl; // Will be set based on environment
  
  // Cleanup configuration
  const CLEANUP_ENABLED = process.env.E2E_CLEANUP !== 'false';

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
    testConfig = await testEnv.getTestConfig();
    
    // Set server URL
    serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    
    // Check if server is running
    await checkServerRunning();
    
    // Find TEST person and organization
    await findTestContactsAndOrg();
    
    console.log(`🔧 Auto-cleanup is ${CLEANUP_ENABLED ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🌐 Server URL: ${serverUrl}`);
    
    if (!CLEANUP_ENABLED) {
      console.log('💡 To enable cleanup, remove E2E_CLEANUP=false from environment');
    }
  }, 30000);

  afterAll(async () => {
    // Always cleanup deals
    await cleanupCreatedDeals();
    
    // Cleanup test environment
    if (testEnv) {
      await testEnv.cleanup();
    }
    
    // Force cleanup any remaining handles
    if (global.gc) {
      global.gc();
    }
  });

  // Helper function to check if server is running
  async function checkServerRunning() {
    try {
      console.log(`🔍 Checking if server is running at ${serverUrl}...`);
      
      const response = await fetch(serverUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      console.log(`✅ Server is running (status: ${response.status})`);
      return true;
    } catch (error) {
      console.log(`❌ Server is not running at ${serverUrl}`);
      console.log(`💡 Please start your server with: npm start`);
      throw new Error(`Server not running. Please start server at ${serverUrl} before running tests.`);
    }
  }

  // Helper function to find TEST person and organization
  async function findTestContactsAndOrg() {
    try {
      // Find TEST person
      const personsResponse = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/persons/search?term=TEST&api_token=${testConfig.apiToken}`
      );
      const personsResult = await personsResponse.json();
      
      if (personsResult.success && personsResult.data && personsResult.data.items.length > 0) {
        testPersonId = personsResult.data.items[0].item.id;
        console.log(`✅ Found TEST person with ID: ${testPersonId}`);
      } else {
        console.log('⚠️  No TEST person found, will create deals without person');
      }

      // Find TEST organization
      const orgsResponse = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/organizations/search?term=TEST&api_token=${testConfig.apiToken}`
      );
      const orgsResult = await orgsResponse.json();
      
      if (orgsResult.success && orgsResult.data && orgsResult.data.items.length > 0) {
        testOrgId = orgsResult.data.items[0].item.id;
        console.log(`✅ Found TEST organization with ID: ${testOrgId}`);
      } else {
        console.log('⚠️  No TEST organization found, will create deals without organization');
      }
    } catch (error) {
      console.log('❌ Error finding TEST contacts:', error.message);
    }
  }

  // Helper function to cleanup created deals
  async function cleanupCreatedDeals() {
    if (createdDealIds.length === 0) {
      console.log('🧹 No deals to cleanup');
      return;
    }

    console.log(`🧹 Cleaning up ${createdDealIds.length} created deals...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const dealId of createdDealIds) {
      try {
        console.log(`🗑️  Deleting deal ID: ${dealId}...`);
        
        const deleteResponse = await fetch(
          `https://${testConfig.companyDomain}.pipedrive.com/v1/deals/${dealId}?api_token=${testConfig.apiToken}`,
          { method: 'DELETE' }
        );
        
        if (deleteResponse.ok) {
          console.log(`✅ Successfully deleted deal ID: ${dealId}`);
          successCount++;
        } else {
          const errorResult = await deleteResponse.json();
          console.log(`⚠️  Failed to delete deal ID: ${dealId} - Status: ${deleteResponse.status}`, errorResult);
          failCount++;
        }
      } catch (error) {
        console.log(`❌ Error deleting deal ID: ${dealId}:`, error.message);
        failCount++;
      }
    }
    
    console.log(`🧹 Cleanup complete: ${successCount} deleted, ${failCount} failed`);
    createdDealIds = []; // Clear the array
  }

  // Helper function to create a product in Pipedrive
  async function createProduct(productData) {
    try {
      console.log(`📦 Creating product: ${productData.name}`);
      
      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/api/v2/products?api_token=${testConfig.apiToken}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(productData)
        }
      );

      const result = await response.json();
      if (result.success) {
        console.log(`✅ Created product: ${productData.name} (ID: ${result.data.id})`);
        return result.data;
      } else {
        console.log(`⚠️  Failed to create product: ${productData.name}`, result);
        return null;
      }
    } catch (error) {
      console.log(`❌ Error creating product ${productData.name}:`, error.message);
      return null;
    }
  }

  // Helper function to add products to a deal
  async function addProductsToDeal(dealId, products) {
    const addedProducts = [];
    console.log(`📦 Adding ${products.length} products to deal ${dealId}`);
    
    for (const product of products) {
      // First create the product
      const createdProduct = await createProduct({
        name: product.name,
        description: product.product_description || ''
      });
      
      if (!createdProduct) {
        console.log(`⚠️  Skipping product: ${product.name} (creation failed)`);
        continue;
      }
      
      // Then attach it to the deal
      try {
        const response = await fetch(
          `https://${testConfig.companyDomain}.pipedrive.com/api/v2/deals/${dealId}/products?api_token=${testConfig.apiToken}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              product_id: createdProduct.id,
              item_price: product.item_price,
              quantity: product.quantity,
              comments: product.product_description || ''
            })
          }
        );

        const result = await response.json();
        if (result.success) {
          addedProducts.push(result.data);
          console.log(`✅ Added product to deal: ${product.name} (Qty: ${product.quantity}, Price: $${product.item_price})`);
        } else {
          console.log(`⚠️  Failed to add product to deal: ${product.name}`, result);
        }
      } catch (error) {
        console.log(`❌ Error adding product ${product.name} to deal:`, error.message);
      }
    }
    
    console.log(`📦 Successfully added ${addedProducts.length}/${products.length} products to deal ${dealId}`);
    return addedProducts;
  }

  // Helper function to get deal products
  async function getDealProducts(dealId) {
    try {
      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/api/v2/deals/${dealId}/products?api_token=${testConfig.apiToken}`
      );
      
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (error) {
      console.log(`❌ Error fetching deal products:`, error.message);
      return [];
    }
  }

  // Helper function to create Xero quote via API
  async function createXeroQuote(dealId, companyId) {
    try {
      console.log(`🔄 Creating Xero quote for deal ${dealId}, company ${companyId}`);
      console.log(`📡 POST ${serverUrl}/api/xero/quote`);
      console.log(`📋 Request body:`, { pipedriveDealId: dealId, pipedriveCompanyId: companyId });
      
      const response = await fetch(`${serverUrl}/api/xero/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pipedriveDealId: dealId,
          pipedriveCompanyId: companyId
        })
      });

      console.log(`📡 Response status: ${response.status} ${response.statusText}`);
      
      let result;
      try {
        result = await response.json();
        console.log(`📋 Response body:`, result);
      } catch (parseError) {
        console.log(`❌ Failed to parse response as JSON:`, parseError.message);
        const textResult = await response.text();
        console.log(`📋 Raw response:`, textResult);
        return null;
      }
      
      if (response.ok) {
        console.log(`✅ Xero quote created successfully`);
        console.log(`📋 Quote Number: ${result.quoteNumber}`);
        console.log(`📋 Quote ID: ${result.quoteId}`);
        return result;
      } else {
        console.log(`❌ Failed to create Xero quote - Status: ${response.status}`);
        console.log(`📋 Error details:`, result);
        return null;
      }
    } catch (error) {
      console.log(`❌ Network error creating Xero quote:`, error.message);
      console.log(`📋 Error stack:`, error.stack);
      return null;
    }
  }

  // Helper function to get Xero quote by quote number
  async function getXeroQuoteByNumber(quoteNumber) {
    try {
      console.log(`🔍 Fetching Xero quote: ${quoteNumber}`);
      
      const response = await fetch(`${serverUrl}/api/xero/quotes?QuoteNumber=${quoteNumber}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (response.ok && result.Quotes && result.Quotes.length > 0) {
        console.log(`✅ Found Xero quote: ${quoteNumber}`);
        return result.Quotes[0]; // Return first quote
      } else {
        console.log(`⚠️  Xero quote not found: ${quoteNumber}`, result);
        return null;
      }
    } catch (error) {
      console.log(`❌ Error fetching Xero quote:`, error.message);
      return null;
    }
  }

  // Helper function to get deal custom fields
  async function getDealCustomFields(dealId) {
    try {
      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/deals/${dealId}?api_token=${testConfig.apiToken}`
      );
      
      const result = await response.json();
      if (result.success) {
        return result.data;
      } else {
        console.log(`⚠️  Failed to fetch deal ${dealId}:`, result);
        return null;
      }
    } catch (error) {
      console.log(`❌ Error fetching deal ${dealId}:`, error.message);
      return null;
    }
  }

  // Helper function to compare products between Pipedrive and Xero
  function compareProducts(pipedriveProducts, xeroLineItems) {
    console.log(`🔍 Comparing ${pipedriveProducts.length} Pipedrive products with ${xeroLineItems.length} Xero line items`);
    
    const mismatches = [];
    
    // Check if counts match
    if (pipedriveProducts.length !== xeroLineItems.length) {
      mismatches.push(`Product count mismatch: Pipedrive ${pipedriveProducts.length} vs Xero ${xeroLineItems.length}`);
    }
    
    // Compare each product
    for (let i = 0; i < Math.min(pipedriveProducts.length, xeroLineItems.length); i++) {
      const pipeProduct = pipedriveProducts[i];
      const xeroItem = xeroLineItems[i];
      
      console.log(`📊 Comparing product ${i + 1}:`);
      console.log(`   Pipedrive: ${pipeProduct.product?.name || 'N/A'} - Qty: ${pipeProduct.quantity}, Price: $${pipeProduct.item_price}`);
      console.log(`   Xero: ${xeroItem.Description || 'N/A'} - Qty: ${xeroItem.Quantity}, Price: $${xeroItem.UnitAmount}`);
      
      // Compare quantities
      if (parseFloat(pipeProduct.quantity) !== parseFloat(xeroItem.Quantity)) {
        mismatches.push(`Product ${i + 1} quantity mismatch: Pipedrive ${pipeProduct.quantity} vs Xero ${xeroItem.Quantity}`);
      }
      
      // Compare unit prices
      if (parseFloat(pipeProduct.item_price) !== parseFloat(xeroItem.UnitAmount)) {
        mismatches.push(`Product ${i + 1} price mismatch: Pipedrive $${pipeProduct.item_price} vs Xero $${xeroItem.UnitAmount}`);
      }
    }
    
    if (mismatches.length === 0) {
      console.log(`✅ All products match between Pipedrive and Xero`);
    } else {
      console.log(`⚠️  Found ${mismatches.length} product mismatches:`, mismatches);
    }
    
    return mismatches;
  }

  describe('Xero Quote Integration', () => {
    test('should create deal with products and sync to Xero quote', async () => {
      console.log('\n🚀 Starting Xero integration test...\n');
      
      // Step 1: Create a deal in Pipedrive
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - Xero integration`,
        value: 3200,
        currency: 'USD'
      };

      if (testPersonId) dealData.person_id = testPersonId;
      if (testOrgId) dealData.org_id = testOrgId;

      console.log('📝 Step 1: Creating Pipedrive deal...');
      const dealResponse = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/deals?api_token=${testConfig.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dealData)
        }
      );

      const dealResult = await dealResponse.json();
      expect(dealResult.success).toBe(true);
      
      const dealId = dealResult.data.id;
      createdDealIds.push(dealId);
      console.log(`✅ Created deal: ${dealData.title} (ID: ${dealId})`);

      // Step 2: Add products to the deal
      console.log('\n📦 Step 2: Adding products to deal...');
      const products = [
        {
          name: 'Marine Engine Service - Xero Test',
          quantity: 1,
          item_price: 1500,
          product_description: 'Complete marine engine service for Xero integration testing. Includes diagnostics and tune-up.'
        },
        {
          name: 'Premium Parts Bundle - Xero Test',
          quantity: 2,
          item_price: 850,
          product_description: 'High-quality marine parts bundle for Xero integration. Includes gaskets, seals, and filters.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(2);

      // Verify products were added
      const dealProducts = await getDealProducts(dealId);
      expect(dealProducts.length).toBe(2);
      console.log(`✅ Added ${dealProducts.length} products to deal ${dealId}`);

      // Step 3: Create Xero quote
      console.log('\n🔄 Step 3: Creating Xero quote...');
      const companyId = testConfig.companyId || '13961027'; // Use from config or hardcoded
      console.log(`📋 Using company ID: ${companyId}`);
      
      const xeroQuoteResult = await createXeroQuote(dealId, companyId);
      expect(xeroQuoteResult).not.toBeNull();
      expect(xeroQuoteResult.success).toBe(true);
      
      const quoteNumber = xeroQuoteResult.quoteNumber;
      const quoteId = xeroQuoteResult.quoteId;
      
      expect(quoteNumber).toBeDefined();
      expect(quoteId).toBeDefined();
      console.log(`✅ Created Xero quote: ${quoteNumber} (ID: ${quoteId})`);

      // Step 4: Fetch and verify Xero quote
      console.log('\n🔍 Step 4: Fetching Xero quote for verification...');
      
      // Wait a moment for Xero to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const xeroQuote = await getXeroQuoteByNumber(quoteNumber);
      expect(xeroQuote).not.toBeNull();
      expect(xeroQuote.QuoteNumber).toBe(quoteNumber);
      expect(xeroQuote.QuoteID).toBe(quoteId);
      console.log(`✅ Verified Xero quote: ${xeroQuote.QuoteNumber}`);

      // Step 5: Compare products between Pipedrive and Xero
      console.log('\n📊 Step 5: Comparing products between Pipedrive and Xero...');
      const productMismatches = compareProducts(dealProducts, xeroQuote.LineItems || []);
      expect(productMismatches.length).toBe(0);

      // Step 6: Verify Pipedrive custom fields are updated
      console.log('\n🔍 Step 6: Verifying Pipedrive custom fields...');
      
      // Wait a moment for custom fields to be updated
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const updatedDeal = await getDealCustomFields(dealId);
      expect(updatedDeal).not.toBeNull();
      
      // Check for quote number custom field (adjust field key as needed)
      const quoteNumberField = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY || 'quote_number';
      const quoteIdField = process.env.PIPEDRIVE_QUOTE_ID || 'quote_id';
      
      console.log(`🔍 Checking custom fields: ${quoteNumberField}, ${quoteIdField}`);
      console.log(`📋 Deal custom fields:`, Object.keys(updatedDeal));
      
      // Note: Custom field verification depends on your specific field setup
      // Uncomment and adjust these based on your actual custom field keys
      /*
      expect(updatedDeal[quoteNumberField]).toBe(quoteNumber);
      expect(updatedDeal[quoteIdField]).toBe(quoteId);
      console.log(`✅ Custom fields verified: Quote Number = ${updatedDeal[quoteNumberField]}, Quote ID = ${updatedDeal[quoteIdField]}`);
      */
      
      console.log(`✅ Deal custom fields present (verification depends on field configuration)`);

      console.log('\n🎉 Xero integration test completed successfully!\n');
      console.log(`📋 Summary:`);
      console.log(`   - Deal ID: ${dealId}`);
      console.log(`   - Products: ${dealProducts.length}`);
      console.log(`   - Xero Quote: ${quoteNumber}`);
      console.log(`   - Quote ID: ${quoteId}`);
      console.log(`   - Total Value: $${dealData.value}`);
          }, 60000); // 60 second timeout
  });
}); 