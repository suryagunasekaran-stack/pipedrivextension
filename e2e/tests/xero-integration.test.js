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
  let createdXeroQuoteIds = []; // Track Xero quotes for cleanup
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
    // Always cleanup Xero quotes to avoid cluttering Xero system
    console.log('\n🧹 Starting cleanup process...');
    await cleanupXeroQuotes();
    
    // Conditional cleanup for Pipedrive deals based on environment variable
    if (CLEANUP_ENABLED) {
      await cleanupCreatedDeals();
    } else {
      console.log('🔒 Pipedrive cleanup disabled - deals preserved for inspection');
      console.log(`📋 Created deal IDs: ${createdDealIds.join(', ')}`);
      console.log('💡 Xero quotes are always cleaned up to avoid system clutter');
    }
    
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
      
      // Try to get available routes for debugging
      await checkAvailableRoutes();
      
      return true;
    } catch (error) {
      console.log(`❌ Server is not running at ${serverUrl}`);
      console.log(`💡 Please start your server with: npm start`);
      throw new Error(`Server not running. Please start server at ${serverUrl} before running tests.`);
    }
  }

  // Helper function to check available routes (for debugging)
  async function checkAvailableRoutes() {
    const commonRoutes = [
      '/api/routes',
      '/routes',
      '/api/health',
      '/health',
      '/api/xero',
      '/xero'
    ];
    
    console.log(`🔍 Checking for available routes...`);
    
    for (const route of commonRoutes) {
      try {
        const response = await fetch(`${serverUrl}${route}`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
          console.log(`✅ Found route: ${route} (${response.status})`);
        }
      } catch (error) {
        // Route doesn't exist, that's fine
      }
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
    const endpoint = '/api/xero/create-quote';
    
    try {
      console.log(`🔄 Creating Xero quote using: ${serverUrl}${endpoint}`);
      console.log(`📋 Request body:`, { 
        pipedriveDealId: dealId, 
        pipedriveCompanyId: companyId,
        dealIdType: typeof dealId,
        companyIdType: typeof companyId
      });
      
      const response = await fetch(`${serverUrl}${endpoint}`, {
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
      console.log(`❌ Network error:`, error.message);
      console.log(`❌ Error stack:`, error.stack);
      return null;
    }
  }

  // Helper function to get Xero quote using backend endpoint
  async function getXeroQuoteByNumber(quoteNumber) {
    try {
      console.log(`🔍 Fetching Xero quote via backend: ${quoteNumber}`);
      
      const response = await fetch(`${serverUrl}/api/test/xero/quote/${quoteNumber}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`📡 Backend response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ Backend error:`, errorText);
        return null;
      }

      const result = await response.json();
      console.log(`📋 Backend response:`, {
        quoteNumber: result.QuoteNumber,
        quoteId: result.QuoteID,
        status: result.Status,
        total: result.Total,
        lineItems: result.LineItems?.length || 0
      });
      
      if (result.QuoteNumber === quoteNumber) {
        console.log(`✅ Found Xero quote via backend: ${result.QuoteNumber}`);
        return result;
      }
      
      console.log(`⚠️  Quote number mismatch: expected ${quoteNumber}, got ${result.QuoteNumber}`);
      return null;
    } catch (error) {
      console.log(`❌ Error fetching Xero quote via backend:`, error.message);
      return null;
    }
  }

  // Helper function to get Xero quote by ID
  async function getXeroQuoteById(quoteId) {
    try {
      console.log(`🔍 Fetching Xero quote by ID: ${quoteId}`);
      
      const response = await fetch(`${serverUrl}/api/test/xero/quote-by-id/${quoteId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`📡 Backend response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ Backend error:`, errorText);
        return null;
      }

      const result = await response.json();
      console.log(`📋 Backend response:`, {
        quoteNumber: result.QuoteNumber,
        quoteId: result.QuoteID,
        status: result.Status,
        total: result.Total,
        lineItems: result.LineItems?.length || 0
      });
      
      if (result.QuoteID === quoteId) {
        console.log(`✅ Found Xero quote by ID: ${result.QuoteNumber} (${result.QuoteID})`);
        return result;
      }
      
      console.log(`⚠️  Quote ID mismatch: expected ${quoteId}, got ${result.QuoteID}`);
      return null;
    } catch (error) {
      console.log(`❌ Error fetching Xero quote by ID:`, error.message);
      return null;
    }
  }

  // Helper function to cleanup Xero quotes
  async function cleanupXeroQuotes() {
    if (createdXeroQuoteIds.length === 0) {
      console.log('🧹 No Xero quotes to cleanup');
      return;
    }

    console.log(`🧹 Cleaning up ${createdXeroQuoteIds.length} created Xero quotes...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const quoteId of createdXeroQuoteIds) {
      try {
        console.log(`🗑️  Voiding Xero quote ID: ${quoteId}...`);
        
        const deleteResponse = await fetch(`${serverUrl}/api/test/xero/quote/${quoteId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        console.log(`📡 Delete response status: ${deleteResponse.status}`);
        
        if (deleteResponse.ok) {
          const result = await deleteResponse.json();
          console.log(`✅ Successfully voided Xero quote: ${result.deletedQuote?.QuoteNumber || quoteId}`);
          console.log(`   Quote status changed to: ${result.deletedQuote?.Status || 'VOIDED'}`);
          successCount++;
        } else {
          let errorResult;
          try {
            errorResult = await deleteResponse.json();
          } catch (parseError) {
            errorResult = { error: 'Failed to parse error response', text: await deleteResponse.text() };
          }
          console.log(`⚠️  Failed to void Xero quote ID: ${quoteId} - Status: ${deleteResponse.status}`);
          console.log(`   Error details:`, errorResult);
          failCount++;
        }
      } catch (error) {
        console.log(`❌ Error voiding Xero quote ID: ${quoteId}:`, error.message);
        console.log(`   Error stack:`, error.stack);
        failCount++;
      }
    }
    
    console.log(`🧹 Xero cleanup complete: ${successCount} voided, ${failCount} failed`);
    
    // If there were failures, list the quote IDs that couldn't be cleaned up
    if (failCount > 0) {
      console.log(`⚠️  Manual cleanup may be required for failed quotes`);
      console.log(`💡 You can manually void these quotes in Xero or use the test endpoints`);
    }
    
    createdXeroQuoteIds = []; // Clear the array regardless of success/failure
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
      
      const xeroQuoteResult = await createXeroQuote(String(dealId), String(companyId));
      expect(xeroQuoteResult).not.toBeNull();
      expect(xeroQuoteResult.quoteNumber).toBeDefined();
      expect(xeroQuoteResult.quoteId).toBeDefined();
      
      const quoteNumber = xeroQuoteResult.quoteNumber;
      const quoteId = xeroQuoteResult.quoteId;
      
      expect(quoteNumber).toBeDefined();
      expect(quoteId).toBeDefined();
      
      // Track the created quote for cleanup
      createdXeroQuoteIds.push(quoteId);
      console.log(`✅ Created Xero quote: ${quoteNumber} (ID: ${quoteId})`);

      // Step 4: Fetch and verify Xero quote directly from Xero API
      console.log('\n🔍 Step 4: Fetching Xero quote directly from Xero API for verification...');
      
      // Wait a moment for Xero to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const xeroQuote = await getXeroQuoteById(quoteId);
      expect(xeroQuote).not.toBeNull();
      expect(xeroQuote.QuoteID).toBe(quoteId);
      expect(xeroQuote.QuoteNumber).toBe(quoteNumber);
      console.log(`✅ Verified Xero quote exists: ${xeroQuote.QuoteNumber}`);
      console.log(`   - Status: ${xeroQuote.Status}`);
      console.log(`   - Total: ${xeroQuote.Total}`);
      console.log(`   - Line Items: ${xeroQuote.LineItems?.length || 0}`);

      // Step 5: Compare products between Pipedrive and Xero
      console.log('\n📊 Step 5: Comparing products between Pipedrive and Xero...');
      const productMismatches = compareProducts(dealProducts, xeroQuote.LineItems || []);
      expect(productMismatches.length).toBe(0);

      // Step 6: Verify Pipedrive custom fields are updated
      console.log('\n🔍 Step 6: Verifying Pipedrive custom fields...');
      
      // Wait a moment for custom fields to be updated
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const updatedDeal = await getDealCustomFields(dealId);
      expect(updatedDeal).not.toBeNull();
      
      console.log(`📋 Fetched updated deal data for ID: ${dealId}`);
      console.log(`📋 Deal title: ${updatedDeal.title}`);
      
      // Log all custom fields to see what's available
      const customFields = Object.keys(updatedDeal).filter(key => 
        key.includes('custom') || 
        key.includes('quote') || 
        key.includes('xero') ||
        updatedDeal[key] === quoteNumber ||
        updatedDeal[key] === quoteId
      );
      
      console.log(`🔍 Custom/quote-related fields found:`, customFields);
      
      // Log all fields that contain our quote values
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
      
      // Check environment variables for expected field names
      const expectedQuoteNumberField = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;
      const expectedQuoteIdField = process.env.PIPEDRIVE_QUOTE_ID;
      
      console.log(`🔍 Expected field names from env:`);
      console.log(`   PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY: ${expectedQuoteNumberField || 'not set'}`);
      console.log(`   PIPEDRIVE_QUOTE_ID: ${expectedQuoteIdField || 'not set'}`);
      
      let customFieldsUpdated = 0;
      
      // Verify quote number field
      if (fieldsWithQuoteNumber.length > 0) {
        console.log(`✅ Quote number '${quoteNumber}' found in ${fieldsWithQuoteNumber.length} field(s): ${fieldsWithQuoteNumber.join(', ')}`);
        customFieldsUpdated++;
        
        // If we have an expected field name, verify it specifically
        if (expectedQuoteNumberField && updatedDeal[expectedQuoteNumberField]) {
          expect(updatedDeal[expectedQuoteNumberField]).toBe(quoteNumber);
          console.log(`✅ Quote number correctly set in expected field '${expectedQuoteNumberField}'`);
        }
      } else {
        console.log(`⚠️  Quote number '${quoteNumber}' not found in any deal fields`);
      }
      
      // Verify quote ID field
      if (fieldsWithQuoteId.length > 0) {
        console.log(`✅ Quote ID '${quoteId}' found in ${fieldsWithQuoteId.length} field(s): ${fieldsWithQuoteId.join(', ')}`);
        customFieldsUpdated++;
        
        // If we have an expected field name, verify it specifically
        if (expectedQuoteIdField && updatedDeal[expectedQuoteIdField]) {
          expect(updatedDeal[expectedQuoteIdField]).toBe(quoteId);
          console.log(`✅ Quote ID correctly set in expected field '${expectedQuoteIdField}'`);
        }
      } else {
        console.log(`⚠️  Quote ID '${quoteId}' not found in any deal fields`);
      }
      
      console.log(`📊 Custom fields updated: ${customFieldsUpdated}/2`);
      
      // At least one custom field should be updated
      expect(customFieldsUpdated).toBeGreaterThan(0);

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