/**
 * Products Deal Tests
 * 
 * Deal creation tests with products but no discounts
 */

import { jest } from '@jest/globals';
import { TestEnvironment } from '../config/test-environment.js';

describe('E2E: Products Deal Tests', () => {
  let testEnv;
  let testConfig;
  let testPersonId;
  let testOrgId;
  let createdDealIds = []; // Track deals for cleanup
  
  // Cleanup configuration
  const CLEANUP_ENABLED = process.env.E2E_CLEANUP !== 'false'; // Default to true, set E2E_CLEANUP=false to disable

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
    testConfig = await testEnv.getTestConfig();
    
    // Find TEST person and organization
    await findTestContactsAndOrg();
    
    console.log(`🔧 Auto-cleanup is ${CLEANUP_ENABLED ? 'ENABLED' : 'DISABLED'}`);
    if (!CLEANUP_ENABLED) {
      console.log('💡 To enable cleanup, remove E2E_CLEANUP=false from environment');
    }
  }, 30000);

  afterAll(async () => {
    // Conditional cleanup
    if (CLEANUP_ENABLED) {
      await cleanupCreatedDeals();
    } else {
      console.log(`⏭️  Skipping cleanup. Created ${createdDealIds.length} deals: ${createdDealIds.join(', ')}`);
    }
    await testEnv.cleanup();
  });

  // Helper function to find TEST person and organization
  async function findTestContactsAndOrg() {
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
  }

  // Helper function to cleanup created deals
  async function cleanupCreatedDeals() {
    console.log(`🧹 Cleaning up ${createdDealIds.length} created deals...`);
    
    for (const dealId of createdDealIds) {
      try {
        const deleteResponse = await fetch(
          `https://${testConfig.companyDomain}.pipedrive.com/v1/deals/${dealId}?api_token=${testConfig.apiToken}`,
          { method: 'DELETE' }
        );
        
        if (deleteResponse.ok) {
          console.log(`✅ Deleted deal ID: ${dealId}`);
        } else {
          console.log(`⚠️  Failed to delete deal ID: ${dealId}`);
        }
      } catch (error) {
        console.log(`❌ Error deleting deal ID: ${dealId}`, error.message);
      }
    }
    
    createdDealIds = []; // Clear the array
    console.log('🧹 Cleanup complete');
  }

  // Helper function to create a product in Pipedrive
  async function createProduct(productData) {
    try {
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
          console.log(`✅ Added product: ${product.name} (Qty: ${product.quantity}, Price: ${product.item_price})`);
        } else {
          console.log(`⚠️  Failed to add product: ${product.name}`, result);
        }
      } catch (error) {
        console.log(`❌ Error adding product ${product.name}:`, error.message);
      }
    }
    
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

  describe('Basic Product Tests', () => {
    test('should create deal with basic products', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - basic products`,
        value: 2500,
        currency: 'USD'
      };

      if (testPersonId) dealData.person_id = testPersonId;
      if (testOrgId) dealData.org_id = testOrgId;

      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/deals?api_token=${testConfig.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dealData)
        }
      );

      const result = await response.json();
      const dealId = result.data.id;
      createdDealIds.push(dealId);

      // Add basic products
      const products = [
        {
          name: 'Marine Engine Service',
          quantity: 1,
          item_price: 1500,
          sum: 1500,
          product_description: 'Complete marine engine service including oil change, filter replacement, and performance diagnostics. Includes basic tune-up and safety inspection.'
        },
        {
          name: 'Parts & Materials',
          quantity: 1,
          item_price: 1000,
          sum: 1000,
          product_description: 'Assorted marine engine parts and materials required for service completion. Includes gaskets, seals, and consumables.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(2);

      // Verify products were added
      const dealProducts = await getDealProducts(dealId);
      expect(dealProducts.length).toBe(2);
      
      console.log(`✅ Created deal ${dealId} with ${dealProducts.length} basic products`);
    });

    test('should create deal with quantity variations', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - quantity variations`,
        value: 675,
        currency: 'USD'
      };

      if (testPersonId) dealData.person_id = testPersonId;
      if (testOrgId) dealData.org_id = testOrgId;

      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/deals?api_token=${testConfig.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dealData)
        }
      );

      const result = await response.json();
      const dealId = result.data.id;
      createdDealIds.push(dealId);

      // Add products with different quantities
      const products = [
        {
          name: 'Bolts & Fasteners',
          quantity: 50,
          item_price: 2,
          sum: 100,
          product_description: 'Marine-grade stainless steel bolts and fasteners. Various sizes (M6-M12) suitable for engine mounting and structural applications. Corrosion resistant.'
        },
        {
          name: 'Oil Filters',
          quantity: 5,
          item_price: 25,
          sum: 125,
          product_description: 'High-quality marine engine oil filters. Compatible with most marine diesel engines. Recommended replacement every 100 hours of operation.'
        },
        {
          name: 'Hydraulic Hoses',
          quantity: 10,
          item_price: 45,
          sum: 450,
          product_description: 'Marine hydraulic hoses rated for 3000 PSI. Includes fittings and clamps. Suitable for steering and trim systems.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(3);

      // Verify products were added
      const dealProducts = await getDealProducts(dealId);
      expect(dealProducts.length).toBe(3);
      
      console.log(`✅ Created deal ${dealId} with ${dealProducts.length} products (quantity variations)`);
    });

    test('should create deal with pricing scenarios', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - pricing scenarios`,
        value: 29300,
        currency: 'USD'
      };

      if (testPersonId) dealData.person_id = testPersonId;
      if (testOrgId) dealData.org_id = testOrgId;

      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/deals?api_token=${testConfig.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dealData)
        }
      );

      const result = await response.json();
      const dealId = result.data.id;
      createdDealIds.push(dealId);

      // Add products with different pricing scenarios
      const products = [
        {
          name: 'Premium Engine Overhaul',
          quantity: 1,
          item_price: 3500,
          sum: 3500,
          product_description: 'Complete engine overhaul service including cylinder head rebuild, piston replacement, valve timing adjustment, and comprehensive testing. Includes 12-month warranty.'
        },
        {
          name: 'Discounted Parts (20% off)',
          quantity: 1,
          item_price: 800,
          sum: 800,
          product_description: 'Marine parts bundle at discounted rate. Original price $1000, now $800 (20% off). Limited time offer for bulk purchase.'
        },
        {
          name: 'Consultation (Free)',
          quantity: 1,
          item_price: 0,
          sum: 0,
          product_description: 'Complimentary marine system consultation and assessment. Includes detailed report with recommendations and cost estimates for future work.'
        },
        {
          name: 'High-value Equipment',
          quantity: 1,
          item_price: 25000,
          sum: 25000,
          product_description: 'Professional marine navigation and communication equipment package. Includes GPS chartplotter, VHF radio, radar system, and installation services.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(4);

      // Verify products were added
      const dealProducts = await getDealProducts(dealId);
      expect(dealProducts.length).toBe(4);
      
      console.log(`✅ Created deal ${dealId} with ${dealProducts.length} products (pricing scenarios)`);
    });

    test('should create deal with service vs product mix', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - service product mix`,
        value: 3200,
        currency: 'USD'
      };

      if (testPersonId) dealData.person_id = testPersonId;
      if (testOrgId) dealData.org_id = testOrgId;

      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/deals?api_token=${testConfig.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dealData)
        }
      );

      const result = await response.json();
      const dealId = result.data.id;
      createdDealIds.push(dealId);

      // Mix of services and physical products
      const products = [
        {
          name: 'Labor - Engine Repair (8 hours)',
          quantity: 8,
          item_price: 125,
          sum: 1000,
          product_description: 'Skilled marine technician labor for engine repair work. Rate: $125/hour. Includes diagnostic time, repair execution, and testing.'
        },
        {
          name: 'Service - Diagnostic Testing',
          quantity: 1,
          item_price: 200,
          sum: 200,
          product_description: 'Comprehensive marine engine diagnostic service using professional diagnostic equipment. Includes detailed report and recommendations.'
        },
        {
          name: 'Product - Replacement Engine Part',
          quantity: 2,
          item_price: 750,
          sum: 1500,
          product_description: 'OEM replacement engine components. High-quality parts with manufacturer warranty. Includes installation hardware and documentation.'
        },
        {
          name: 'Service - Installation & Setup',
          quantity: 1,
          item_price: 500,
          sum: 500,
          product_description: 'Professional installation and setup service for marine equipment. Includes system integration, testing, and customer training.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(4);

      // Verify products were added
      const dealProducts = await getDealProducts(dealId);
      expect(dealProducts.length).toBe(4);
      
      console.log(`✅ Created deal ${dealId} with ${dealProducts.length} products (service/product mix)`);
    });

    test('should create deal with edge case products', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - edge case products`,
        value: 1401.23,
        currency: 'USD'
      };

      if (testPersonId) dealData.person_id = testPersonId;
      if (testOrgId) dealData.org_id = testOrgId;

      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/deals?api_token=${testConfig.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dealData)
        }
      );

      const result = await response.json();
      const dealId = result.data.id;
      createdDealIds.push(dealId);

      // Products with special characters and edge cases
      const products = [
        {
          name: 'Marine Part #A-123/B & Accessories',
          quantity: 1,
          item_price: 299.99,
          sum: 299.99,
          product_description: 'Specialized marine part with model number A-123/B. Includes mounting accessories and installation guide. Compatible with 2019+ models.'
        },
        {
          name: 'Service: "Premium" Maintenance (50% deposit)',
          quantity: 1,
          item_price: 800.50,
          sum: 800.50,
          product_description: 'Premium maintenance service package. This represents 50% deposit payment. Remaining balance due upon completion. Includes comprehensive service checklist.'
        },
        {
          name: 'Emergency Call-Out (24/7)',
          quantity: 1,
          item_price: 150.25,
          sum: 150.25,
          product_description: 'Emergency marine service call-out available 24/7. Includes travel time within 50-mile radius. Additional charges may apply for parts and extended labor.'
        },
        {
          name: 'Parts with ñ, é, ü characters',
          quantity: 2,
          item_price: 75.33,
          sum: 150.66,
          product_description: 'International marine parts with special characters in specifications. Manufactured in España with européen quality standards. Includes multilingual documentation.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(4);

      // Verify products were added
      const dealProducts = await getDealProducts(dealId);
      expect(dealProducts.length).toBe(4);
      
      console.log(`✅ Created deal ${dealId} with ${dealProducts.length} edge case products`);
    });
  });
}); 