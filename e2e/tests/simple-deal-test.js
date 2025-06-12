/**
 * Simple Deal Creation Test
 * 
 * Basic test to verify we can create a deal in Pipedrive sandbox
 */

import { jest } from '@jest/globals';
import { TestEnvironment } from '../config/test-environment.js';

describe('E2E: Simple Deal Creation', () => {
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

  // Helper function to find and delete ALL e2e test deals
  async function cleanupAllE2EDeals() {
    console.log('🔍 Searching for all e2e test deals...');
    
    try {
      // Search for deals with "e2e test" in title
      const searchResponse = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/deals/search?term=e2e test&api_token=${testConfig.apiToken}`
      );
      
      const searchResult = await searchResponse.json();
      
      if (searchResult.success && searchResult.data && searchResult.data.items) {
        const e2eDeals = searchResult.data.items;
        console.log(`🎯 Found ${e2eDeals.length} e2e test deals`);
        
        for (const dealItem of e2eDeals) {
          const dealId = dealItem.item.id;
          const dealTitle = dealItem.item.title;
          
          try {
            const deleteResponse = await fetch(
              `https://${testConfig.companyDomain}.pipedrive.com/v1/deals/${dealId}?api_token=${testConfig.apiToken}`,
              { method: 'DELETE' }
            );
            
            if (deleteResponse.ok) {
              console.log(`✅ Deleted: "${dealTitle}" (ID: ${dealId})`);
            } else {
              console.log(`⚠️  Failed to delete: "${dealTitle}" (ID: ${dealId})`);
            }
          } catch (error) {
            console.log(`❌ Error deleting deal "${dealTitle}":`, error.message);
          }
        }
        
        console.log('🧹 Mass cleanup complete');
      } else {
        console.log('📭 No e2e test deals found');
      }
    } catch (error) {
      console.log('❌ Error during mass cleanup:', error.message);
    }
  }

  test('should create a deal in Pipedrive successfully', async () => {
    // Create a test deal with TEST person and organization
    const dealNumber = Math.floor(Math.random() * 9999) + 1;
    const dealData = {
      title: `e2e test ${dealNumber}`,
      value: 1000,
      currency: 'USD',
      status: 'open'
    };

    // Add person and org if found
    if (testPersonId) {
      dealData.person_id = testPersonId;
    }
    if (testOrgId) {
      dealData.org_id = testOrgId;
    }

    const response = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/v1/deals?api_token=${testConfig.apiToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dealData)
      }
    );

    console.log('Response status:', response.status);
    const result = await response.json();
    console.log('Response body:', JSON.stringify(result, null, 2));

    expect(response.status).toBe(201);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    expect(result.data.title).toBe(dealData.title);

    // Track deal for cleanup
    createdDealIds.push(result.data.id);
    console.log(`✅ Created deal with ID: ${result.data.id}`);
  });

  test('should fetch the created deal', async () => {
    // First create a deal
    const dealNumber = Math.floor(Math.random() * 9999) + 1;
    const dealData = {
      title: `e2e test ${dealNumber}`,
      value: 500,
      currency: 'USD'
    };

    // Add person and org if found
    if (testPersonId) {
      dealData.person_id = testPersonId;
    }
    if (testOrgId) {
      dealData.org_id = testOrgId;
    }

    const createResponse = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/v1/deals?api_token=${testConfig.apiToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dealData)
      }
    );

    const createResult = await createResponse.json();
    const dealId = createResult.data.id;
    
    // Track deal for cleanup
    createdDealIds.push(dealId);

    // Now fetch the deal
    const fetchResponse = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/v1/deals/${dealId}?api_token=${testConfig.apiToken}`
    );

    const fetchResult = await fetchResponse.json();

    expect(fetchResponse.status).toBe(200);
    expect(fetchResult.success).toBe(true);
    expect(fetchResult.data.id).toBe(dealId);
    expect(fetchResult.data.title).toBe(dealData.title);

    console.log(`✅ Successfully fetched deal ID: ${dealId}`);
  });

  // Helper function to create a product first, then add it to a deal
  async function createProduct(productData) {
    try {
      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/api/v2/products?api_token=${testConfig.apiToken}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: productData.name,
            description: productData.product_description || '',
            prices: [{
              price: productData.item_price,
              currency: 'USD'
            }]
          })
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
    
    for (const productData of products) {
      try {
        // First create the product
        const createdProduct = await createProduct(productData);
        if (!createdProduct) {
          continue;
        }

        // Then add it to the deal
        const response = await fetch(
          `https://${testConfig.companyDomain}.pipedrive.com/api/v2/deals/${dealId}/products?api_token=${testConfig.apiToken}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              product_id: createdProduct.id,
              item_price: productData.item_price,
              quantity: productData.quantity,
              comments: productData.product_description || ''
            })
          }
        );

        const result = await response.json();
        if (result.success) {
          addedProducts.push(result.data);
          console.log(`✅ Added product to deal: ${productData.name} (Qty: ${productData.quantity}, Price: ${productData.item_price})`);
        } else {
          console.log(`⚠️  Failed to add product to deal: ${productData.name}`, result);
        }
      } catch (error) {
        console.log(`❌ Error adding product ${productData.name}:`, error.message);
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

  // Helper function to add discounts to a deal
  async function addDiscountsToDeal(dealId, discounts) {
    const addedDiscounts = [];
    
    for (const discount of discounts) {
      try {
        const response = await fetch(
          `https://${testConfig.companyDomain}.pipedrive.com/api/v2/deals/${dealId}/discounts?api_token=${testConfig.apiToken}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(discount)
          }
        );

        const result = await response.json();
        if (result.success) {
          addedDiscounts.push(result.data);
          console.log(`✅ Added discount: ${discount.description} (${discount.type === 'percentage' ? discount.amount + '%' : '$' + discount.amount})`);
        } else {
          console.log(`⚠️  Failed to add discount: ${discount.description}`, result);
        }
      } catch (error) {
        console.log(`❌ Error adding discount ${discount.description}:`, error.message);
      }
    }
    
    return addedDiscounts;
  }

  // Helper function to get deal discounts
  async function getDealDiscounts(dealId) {
    try {
      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/api/v2/deals/${dealId}/discounts?api_token=${testConfig.apiToken}`
      );
      
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (error) {
      console.log(`❌ Error fetching deal discounts:`, error.message);
      return [];
    }
  }

  // Product test scenarios
  describe('Deal with Products', () => {
    test('should create deal with basic products', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - basic products`,
        value: 2500,
        currency: 'USD'
      };

      if (testPersonId) dealData.person_id = testPersonId;
      if (testOrgId) dealData.org_id = testOrgId;

      // Create deal
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
          product_description: 'Assorted marine engine parts and materials required for standard maintenance. Includes gaskets, seals, and consumable items.'
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
          product_description: 'High-quality marine engine oil filters. Compatible with most diesel and gasoline marine engines. Recommended replacement every 100 hours of operation.'
        },
        {
          name: 'Hydraulic Hoses',
          quantity: 10,
          item_price: 45,
          sum: 450,
          product_description: 'Reinforced hydraulic hoses rated for marine applications. 3/8" diameter, 1000 PSI working pressure. Includes fittings and clamps.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(3);

      console.log(`✅ Created deal ${dealId} with quantity variations`);
    });

    test('should create deal with pricing scenarios', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - pricing scenarios`,
        value: 5000,
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
          product_description: 'Complete engine overhaul service including cylinder head rebuild, piston replacement, valve timing adjustment, and comprehensive testing. 12-month warranty included.'
        },
        {
          name: 'Discounted Parts (20% off)',
          quantity: 1,
          item_price: 800,
          sum: 800,
          product_description: 'Bulk purchase discount applied. Includes alternator, starter motor, and associated wiring harness. Original retail value $1000, discounted to $800.'
        },
        {
          name: 'Consultation (Free)',
          quantity: 1,
          item_price: 0,
          sum: 0,
          product_description: 'Complimentary initial consultation and system assessment. Includes visual inspection, basic diagnostics, and written recommendations for required work.'
        },
        {
          name: 'High-value Equipment',
          quantity: 1,
          item_price: 25000,
          sum: 25000,
          product_description: 'Professional marine propulsion system upgrade. Includes new engine, transmission, propeller, and complete installation with sea trials. Premium warranty package.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(4);

      console.log(`✅ Created deal ${dealId} with pricing scenarios`);
    });

    test('should create deal with service vs product mix', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - service product mix`,
        value: 4200,
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
          product_description: 'Skilled marine technician labor for engine repair work. Rate includes diagnostic time, repair execution, and post-repair testing. Certified marine mechanic with 15+ years experience.'
        },
        {
          name: 'Service - Diagnostic Testing',
          quantity: 1,
          item_price: 200,
          sum: 200,
          product_description: 'Comprehensive engine diagnostic service using professional marine diagnostic equipment. Includes computer analysis, compression testing, and detailed report with recommendations.'
        },
        {
          name: 'Product - Replacement Engine Part',
          quantity: 2,
          item_price: 750,
          sum: 1500,
          product_description: 'OEM replacement engine components - turbocharger assembly and intercooler unit. Genuine manufacturer parts with full warranty. Includes gaskets and mounting hardware.'
        },
        {
          name: 'Service - Installation & Setup',
          quantity: 1,
          item_price: 500,
          sum: 500,
          product_description: 'Professional installation service for replacement parts. Includes proper torque specifications, system calibration, and post-installation testing to ensure optimal performance.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(4);

      console.log(`✅ Created deal ${dealId} with service/product mix`);
    });

    test('should create deal with special characters and edge cases', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - special cases`,
        value: 1500,
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
          product_description: 'Specialized marine component (Part #A-123/B) with mounting accessories. Includes brackets, bolts & washers. Compatible with 2019+ models. Stainless steel construction.'
        },
        {
          name: 'Service: "Premium" Maintenance (50% deposit)',
          quantity: 1,
          item_price: 800.50,
          sum: 800.50,
          product_description: 'Premium maintenance package with 50% deposit required. Includes: engine service, hull cleaning, electrical check & safety inspection. Balance due on completion.'
        },
        {
          name: 'Emergency Call-Out (24/7)',
          quantity: 1,
          item_price: 150.25,
          sum: 150.25,
          product_description: 'Emergency marine service call-out available 24/7. Includes initial assessment and up to 1 hour on-site diagnosis. Additional work quoted separately.'
        },
        {
          name: 'Parts with ñ, é, ü characters',
          quantity: 2,
          item_price: 75.33,
          sum: 150.66,
          product_description: 'International marine parts with special characters: Señal indicators, Étanchéité seals, and Überwachung sensors. Imported from European suppliers.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(4);

      console.log(`✅ Created deal ${dealId} with special characters`);
    });

    test('should create complex deal with many products', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - complex deal`,
        value: 15000,
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

      // Large number of products (realistic scenario)
      const products = [
        { 
          name: 'Main Engine Service', 
          quantity: 1, 
          item_price: 2500, 
          sum: 2500,
          product_description: 'Complete main engine service including oil change, filter replacement, cooling system flush, fuel system service, and comprehensive performance testing.'
        },
        { 
          name: 'Auxiliary Engine Check', 
          quantity: 1, 
          item_price: 800, 
          sum: 800,
          product_description: 'Auxiliary engine inspection and service. Includes generator testing, battery charging system check, and minor adjustments as needed.'
        },
        { 
          name: 'Oil Change & Filters', 
          quantity: 1, 
          item_price: 300, 
          sum: 300,
          product_description: 'Premium marine engine oil change with high-quality filters. Includes oil analysis and disposal of used materials in accordance with environmental regulations.'
        },
        { 
          name: 'Fuel System Cleaning', 
          quantity: 1, 
          item_price: 450, 
          sum: 450,
          product_description: 'Professional fuel system cleaning service. Includes fuel tank cleaning, line flushing, filter replacement, and fuel quality testing.'
        },
        { 
          name: 'Electrical System Test', 
          quantity: 1, 
          item_price: 200, 
          sum: 200,
          product_description: 'Comprehensive electrical system testing including battery condition, charging system, navigation lights, and safety equipment functionality.'
        },
        { 
          name: 'Hull Inspection', 
          quantity: 1, 
          item_price: 500, 
          sum: 500,
          product_description: 'Professional hull inspection including underwater survey, through-hull fitting check, and structural integrity assessment with detailed report.'
        },
        { 
          name: 'Safety Equipment Check', 
          quantity: 1, 
          item_price: 150, 
          sum: 150,
          product_description: 'Complete safety equipment inspection including life jackets, flares, fire extinguishers, and emergency signaling devices. Compliance certification included.'
        },
        { 
          name: 'Parts - Various', 
          quantity: 20, 
          item_price: 45, 
          sum: 900,
          product_description: 'Assorted marine parts and consumables including gaskets, seals, hose clamps, electrical connectors, and maintenance supplies.'
        },
        { 
          name: 'Labor - Additional Hours', 
          quantity: 15, 
          item_price: 120, 
          sum: 1800,
          product_description: 'Additional skilled technician labor hours for complex repairs and installations. Includes specialized marine system work and troubleshooting.'
        },
        { 
          name: 'Emergency Repair Kit', 
          quantity: 1, 
          item_price: 350, 
          sum: 350,
          product_description: 'Comprehensive emergency repair kit including temporary patches, sealants, spare parts, and tools for common marine emergencies.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(10);

      // Verify total calculations
      const dealProducts = await getDealProducts(dealId);
      const totalSum = dealProducts.reduce((sum, product) => sum + (product.sum || 0), 0);
      
      console.log(`✅ Created complex deal ${dealId} with ${dealProducts.length} products (Total: $${totalSum})`);
      expect(dealProducts.length).toBe(10);
    });

    test('should create deal with products and percentage discounts', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - with percentage discounts`,
        value: 3000,
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

      // Add products first
      const products = [
        {
          name: 'Marine Engine Maintenance Package',
          quantity: 1,
          item_price: 2000,
          sum: 2000,
          product_description: 'Comprehensive marine engine maintenance package including oil change, filter replacement, and system diagnostics.'
        },
        {
          name: 'Premium Parts Bundle',
          quantity: 1,
          item_price: 1500,
          sum: 1500,
          product_description: 'Premium quality marine parts bundle including gaskets, seals, and high-performance components.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(2);

      // Add percentage discounts
      const discounts = [
        {
          description: 'Early Bird Discount',
          amount: 10,
          type: 'percentage'
        },
        {
          description: 'Loyalty Customer Discount',
          amount: 5,
          type: 'percentage'
        }
      ];

      const addedDiscounts = await addDiscountsToDeal(dealId, discounts);
      expect(addedDiscounts.length).toBe(2);

      // Verify discounts were added
      const dealDiscounts = await getDealDiscounts(dealId);
      expect(dealDiscounts.length).toBe(2);
      
      console.log(`✅ Created deal ${dealId} with ${addedProducts.length} products and ${dealDiscounts.length} percentage discounts`);
    });

    test('should create deal with products and fixed amount discounts', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - with fixed discounts`,
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

      // Add products first
      const products = [
        {
          name: 'Emergency Marine Repair Service',
          quantity: 1,
          item_price: 1800,
          sum: 1800,
          product_description: 'Emergency marine repair service available 24/7. Includes emergency call-out, initial diagnosis, and temporary repairs.'
        },
        {
          name: 'Replacement Parts Kit',
          quantity: 1,
          item_price: 900,
          sum: 900,
          product_description: 'Essential replacement parts kit for emergency repairs. Includes common failure items and emergency supplies.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(2);

      // Add fixed amount discounts
      const discounts = [
        {
          description: 'Volume Purchase Discount',
          amount: 200,
          type: 'amount'
        },
        {
          description: 'Referral Credit',
          amount: 100,
          type: 'amount'
        }
      ];

      const addedDiscounts = await addDiscountsToDeal(dealId, discounts);
      expect(addedDiscounts.length).toBe(2);

      // Verify discounts were added
      const dealDiscounts = await getDealDiscounts(dealId);
      expect(dealDiscounts.length).toBe(2);
      
      console.log(`✅ Created deal ${dealId} with ${addedProducts.length} products and ${dealDiscounts.length} fixed amount discounts`);
    });

    test('should create deal with mixed products and discount types', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - mixed discounts`,
        value: 5000,
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

      // Add diverse products
      const products = [
        {
          name: 'Complete Engine Overhaul Service',
          quantity: 1,
          item_price: 3500,
          sum: 3500,
          product_description: 'Complete marine engine overhaul including cylinder head rebuild, piston replacement, valve timing, and comprehensive testing with warranty.'
        },
        {
          name: 'Navigation System Upgrade',
          quantity: 1,
          item_price: 1200,
          sum: 1200,
          product_description: 'Professional navigation system upgrade with GPS, radar integration, and marine chart plotting capabilities.'
        },
        {
          name: 'Safety Equipment Package',
          quantity: 2,
          item_price: 300,
          sum: 600,
          product_description: 'Comprehensive safety equipment package including life jackets, flares, emergency beacons, and first aid supplies.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(3);

      // Add mixed discount types
      const discounts = [
        {
          description: 'Seasonal Promotion (15% off)',
          amount: 15,
          type: 'percentage'
        },
        {
          description: 'Trade-in Credit',
          amount: 500,
          type: 'amount'
        },
        {
          description: 'Multi-service Bundle Discount',
          amount: 8,
          type: 'percentage'
        },
        {
          description: 'Cash Payment Discount',
          amount: 250,
          type: 'amount'
        }
      ];

      const addedDiscounts = await addDiscountsToDeal(dealId, discounts);
      expect(addedDiscounts.length).toBe(4);

      // Verify everything was added
      const dealProducts = await getDealProducts(dealId);
      const dealDiscounts = await getDealDiscounts(dealId);
      
      expect(dealProducts.length).toBe(3);
      expect(dealDiscounts.length).toBe(4);
      
      console.log(`✅ Created complex deal ${dealId} with ${dealProducts.length} products and ${dealDiscounts.length} mixed discounts`);
    });

    test('should create deal with edge case discount scenarios', async () => {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - edge case discounts`,
        value: 1500,
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

      // Add products first
      const products = [
        {
          name: 'Consultation & Assessment Service',
          quantity: 1,
          item_price: 800,
          sum: 800,
          product_description: 'Professional marine system consultation and assessment. Includes detailed report with recommendations and cost estimates.'
        },
        {
          name: 'Minor Repair & Adjustment',
          quantity: 1,
          item_price: 450,
          sum: 450,
          product_description: 'Minor repair and adjustment service for marine systems. Includes basic maintenance and performance optimization.'
        }
      ];

      const addedProducts = await addProductsToDeal(dealId, products);
      expect(addedProducts.length).toBe(2);

      // Add edge case discounts
      const discounts = [
        {
          description: 'Special Characters: "Quote" & Symbols (50% off)',
          amount: 50,
          type: 'percentage'
        },
        {
          description: 'Discount with ñ, é, ü characters',
          amount: 75.50,
          type: 'amount'
        },
        {
          description: 'Very Long Discount Description That Tests The Maximum Length Limits And Special Handling Of Extended Text Fields In The API',
          amount: 25,
          type: 'percentage'
        }
      ];

      const addedDiscounts = await addDiscountsToDeal(dealId, discounts);
      expect(addedDiscounts.length).toBe(3);

      // Verify discounts were added
      const dealDiscounts = await getDealDiscounts(dealId);
      expect(dealDiscounts.length).toBe(3);
      
      console.log(`✅ Created deal ${dealId} with ${addedProducts.length} products and ${dealDiscounts.length} edge case discounts`);
    });
  });

  // Manual cleanup test - run only when needed
  test.skip('should cleanup all e2e test deals (manual)', async () => {
    // This test is skipped by default
    // Remove .skip to run mass cleanup manually
    await cleanupAllE2EDeals();
  });
}); 