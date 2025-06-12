/**
 * Basic Deal Tests
 * 
 * Simple deal creation and fetching tests without products or discounts
 */

import { jest } from '@jest/globals';
import { TestEnvironment } from '../config/test-environment.js';

describe('E2E: Basic Deal Tests', () => {
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

  test('should create a basic deal successfully', async () => {
    const dealNumber = Math.floor(Math.random() * 9999) + 1;
    const dealData = {
      title: `e2e test ${dealNumber} - basic`,
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

    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    expect(result.data.title).toBe(dealData.title);

    // Track deal for cleanup
    createdDealIds.push(result.data.id);
    console.log(`✅ Created basic deal with ID: ${result.data.id}`);
  });

  test('should fetch the created deal', async () => {
    // First create a deal
    const dealNumber = Math.floor(Math.random() * 9999) + 1;
    const dealData = {
      title: `e2e test ${dealNumber} - fetch test`,
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
    expect(fetchResult.data.value).toBe(dealData.value);

    console.log(`✅ Successfully fetched deal: ${fetchResult.data.title}`);
  });

  test('should create deals with different values and currencies', async () => {
    const testCases = [
      { value: 100, currency: 'USD', suffix: 'small USD' },
      { value: 5000, currency: 'USD', suffix: 'large USD' },
      { value: 1500.50, currency: 'USD', suffix: 'decimal USD' }
    ];

    for (const testCase of testCases) {
      const dealNumber = Math.floor(Math.random() * 9999) + 1;
      const dealData = {
        title: `e2e test ${dealNumber} - ${testCase.suffix}`,
        value: testCase.value,
        currency: testCase.currency
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
      expect(result.success).toBe(true);
      expect(result.data.value).toBe(testCase.value);
      expect(result.data.currency).toBe(testCase.currency);

      createdDealIds.push(result.data.id);
      console.log(`✅ Created ${testCase.suffix} deal: $${testCase.value} ${testCase.currency}`);
    }
  });

  test('should handle deal creation with special characters', async () => {
    const dealNumber = Math.floor(Math.random() * 9999) + 1;
    const dealData = {
      title: `e2e test ${dealNumber} - Special: "Quotes" & Symbols (ñ, é, ü)`,
      value: 750,
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
    expect(result.success).toBe(true);
    expect(result.data.title).toBe(dealData.title);

    createdDealIds.push(result.data.id);
    console.log(`✅ Created deal with special characters: ${result.data.title}`);
  });
}); 