/**
 * Full End-to-End Workflow Tests
 * 
 * Tests complete user journeys through the application:
 * 1. Authentication flows
 * 2. Quote creation workflow
 * 3. Project creation workflow
 * 4. Quote update and acceptance
 * 5. Error handling scenarios
 */

import { jest } from '@jest/globals';
import { TestEnvironment, waitForServer } from '../config/test-environment.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('E2E: Full Workflow Tests', () => {
  let testEnv;
  let serverProcess;
  let testConfig;
  const baseUrl = 'http://localhost:3000';

  beforeAll(async () => {
    // Set up test environment
    testEnv = new TestEnvironment();
    await testEnv.setup();

    // Get test configuration
    testConfig = await testEnv.getTestConfig();

    // Start the server
    serverProcess = spawn('node', ['index.js'], {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, PORT: '3000' }
    });

    // Wait for server to be ready
    await waitForServer(baseUrl);
  }, 60000);

  afterAll(async () => {
    // Kill server process
    if (serverProcess) {
      serverProcess.kill();
    }

    // Clean up test environment
    await testEnv.cleanup();
  });

  afterEach(async () => {
    // Reset database state between tests
    await testEnv.resetDatabase();
  });

  describe('Authentication Status', () => {
    test('should verify Pipedrive authentication', async () => {
      const response = await fetch(`${baseUrl}/auth/status?companyId=${testConfig.companyId}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.authenticated).toBe(true);
      expect(data.services.pipedrive).toBe(true);
      expect(data.companyId).toBe(testConfig.companyId);
    });

    test('should verify Xero authentication if configured', async () => {
      const response = await fetch(`${baseUrl}/auth/status?companyId=${testConfig.companyId}`);
      const data = await response.json();

      if (testConfig.xeroTenantId) {
        expect(data.services.xero).toBe(true);
      }
    });

    test('should handle missing companyId', async () => {
      const response = await fetch(`${baseUrl}/auth/status`);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Company ID is required');
    });
  });

  describe('Pipedrive Data Retrieval', () => {
    test('should fetch deal data successfully', async () => {
      const response = await fetch(`${baseUrl}/api/pipedrive-data?companyId=${testConfig.companyId}&dealId=${testConfig.dealId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.deal).toBeDefined();
      expect(data.deal.id).toBe(parseInt(testConfig.dealId));
    });

    test('should include organization and person data', async () => {
      const response = await fetch(`${baseUrl}/api/pipedrive-data?companyId=${testConfig.companyId}&dealId=${testConfig.dealId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      
      if (data.deal.org_id) {
        expect(data.organization).toBeDefined();
        expect(data.organization.id).toBe(data.deal.org_id.value);
      }

      if (data.deal.person_id) {
        expect(data.person).toBeDefined();
        expect(data.person.id).toBe(data.deal.person_id.value);
      }
    });
  });

  describe('Quote Creation Workflow', () => {
    test('should create quote in Xero successfully', async () => {
      // Skip if Xero not configured
      if (!testConfig.xeroTenantId) {
        console.log('⏭️  Skipping Xero quote test - Xero not configured');
        return;
      }

      const response = await fetch(`${baseUrl}/api/xero/create-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveCompanyId: testConfig.companyId,
          pipedriveDealId: testConfig.dealId
        })
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.quoteNumber).toBeDefined();
      expect(data.quoteId).toBeDefined();
      expect(data.contactName).toBeDefined();
      expect(data.pipedriveDealUpdated).toBe(true);
    });

    test('should handle missing organization on deal', async () => {
      // Create a test deal without organization
      const dealWithoutOrg = '99998'; // Test deal ID

      const response = await fetch(`${baseUrl}/api/xero/create-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveCompanyId: testConfig.companyId,
          pipedriveDealId: dealWithoutOrg
        })
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      const data = await response.json();
      expect(data.error).toContain('organization');
    });

    test('should require Xero authentication', async () => {
      // Test with company that doesn't have Xero auth
      const unauthCompanyId = '99999';

      const response = await fetch(`${baseUrl}/api/xero/create-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveCompanyId: unauthCompanyId,
          pipedriveDealId: testConfig.dealId
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toContain('Xero authentication required');
    });
  });

  describe('Project Creation Workflow', () => {
    test('should create project with new project number', async () => {
      const response = await fetch(`${baseUrl}/api/project/create-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveDealId: testConfig.dealId,
          pipedriveCompanyId: testConfig.companyId
        })
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.projectNumber).toMatch(/^[A-Z]{2}\d{5}$/); // Format: NY25001
      expect(data.deal).toBeDefined();
      expect(data.metadata.isNewProject).toBe(true);
    });

    test('should link to existing project number', async () => {
      const existingProjectNumber = 'NY25001';

      const response = await fetch(`${baseUrl}/api/project/create-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveDealId: testConfig.dealId,
          pipedriveCompanyId: testConfig.companyId,
          existingProjectNumberToLink: existingProjectNumber
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.projectNumber).toBe(existingProjectNumber);
      expect(data.metadata.isNewProject).toBe(false);
    });

    test('should create Xero project if authenticated', async () => {
      // Skip if Xero not configured
      if (!testConfig.xeroTenantId) {
        console.log('⏭️  Skipping Xero project test - Xero not configured');
        return;
      }

      const response = await fetch(`${baseUrl}/api/project/create-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveDealId: testConfig.dealId,
          pipedriveCompanyId: testConfig.companyId
        })
      });

      const data = await response.json();

      expect(data.xero).toBeDefined();
      expect(data.xero.projectCreated).toBe(true);
      expect(data.xero.projectId).toBeDefined();
      expect(data.xero.tasksCreated).toBeInstanceOf(Array);
      expect(data.xero.tasksCreated.length).toBeGreaterThan(0);
    });

    test('should handle missing department', async () => {
      // Test with deal that has no department
      const dealWithoutDept = '99997'; // Test deal ID

      const response = await fetch(`${baseUrl}/api/project/create-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveDealId: dealWithoutDept,
          pipedriveCompanyId: testConfig.companyId
        })
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      const data = await response.json();
      expect(data.error).toContain('department');
    });
  });

  describe('Quote Update Workflow', () => {
    test('should get quotation data for update', async () => {
      const response = await fetch(`${baseUrl}/api/pipedrive/get-quotation-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId: testConfig.dealId,
          companyId: testConfig.companyId
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.deal).toBeDefined();
      expect(data.metadata.dealId).toBe(testConfig.dealId);
      expect(data.metadata.companyId).toBe(testConfig.companyId);
    });

    test('should include Xero quotation if exists', async () => {
      // Skip if Xero not configured
      if (!testConfig.xeroTenantId) {
        return;
      }

      // First create a quote
      await fetch(`${baseUrl}/api/xero/create-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveCompanyId: testConfig.companyId,
          pipedriveDealId: testConfig.dealId
        })
      });

      // Then get quotation data
      const response = await fetch(`${baseUrl}/api/pipedrive/get-quotation-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId: testConfig.dealId,
          companyId: testConfig.companyId
        })
      });

      const data = await response.json();

      if (data.quotationNumber) {
        expect(data.xeroQuotation).toBeDefined();
        expect(data.comparison).toBeDefined();
        expect(data.metadata.canUpdate).toBeDefined();
      }
    });
  });

  describe('Error Scenarios', () => {
    test('should handle invalid deal ID', async () => {
      const response = await fetch(`${baseUrl}/api/pipedrive-data?companyId=${testConfig.companyId}&dealId=invalid-deal-id`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should handle network timeouts gracefully', async () => {
      // This would require mocking network conditions
      // For now, we test with a non-existent deal
      const response = await fetch(`${baseUrl}/api/pipedrive-data?companyId=${testConfig.companyId}&dealId=99999999`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should validate required fields', async () => {
      const response = await fetch(`${baseUrl}/api/project/create-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required fields
          pipedriveCompanyId: testConfig.companyId
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('required');
    });
  });

  describe('Database Operations', () => {
    test('should check database health', async () => {
      const response = await fetch(`${baseUrl}/api/database/health`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.status).toBe('healthy');
      expect(data.database.connected).toBe(true);
      expect(data.collections).toBeDefined();
    });

    test('should get collection statistics', async () => {
      const response = await fetch(`${baseUrl}/api/database/collections`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.collections).toBeInstanceOf(Array);
      expect(data.collections).toContainEqual(
        expect.objectContaining({
          name: 'auth_tokens',
          count: expect.any(Number)
        })
      );
    });
  });

  describe('Complete User Journey', () => {
    test('should complete full quote to project workflow', async () => {
      // Skip if Xero not configured
      if (!testConfig.xeroTenantId) {
        console.log('⏭️  Skipping full journey test - Xero not configured');
        return;
      }

      // Step 1: Check authentication
      const authResponse = await fetch(`${baseUrl}/auth/status?companyId=${testConfig.companyId}`);
      expect(authResponse.status).toBe(200);
      const authData = await authResponse.json();
      expect(authData.authenticated).toBe(true);

      // Step 2: Get deal data
      const dealResponse = await fetch(`${baseUrl}/api/pipedrive-data?companyId=${testConfig.companyId}&dealId=${testConfig.dealId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      expect(dealResponse.status).toBe(200);
      const dealData = await dealResponse.json();
      expect(dealData.success).toBe(true);

      // Step 3: Create quote
      const quoteResponse = await fetch(`${baseUrl}/api/xero/create-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveCompanyId: testConfig.companyId,
          pipedriveDealId: testConfig.dealId
        })
      });
      expect(quoteResponse.status).toBe(201);
      const quoteData = await quoteResponse.json();
      expect(quoteData.success).toBe(true);
      const quoteId = quoteData.quoteId;

      // Step 4: Create project
      const projectResponse = await fetch(`${baseUrl}/api/project/create-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveDealId: testConfig.dealId,
          pipedriveCompanyId: testConfig.companyId
        })
      });
      expect(projectResponse.status).toBe(201);
      const projectData = await projectResponse.json();
      expect(projectData.success).toBe(true);
      expect(projectData.projectNumber).toBeDefined();

      // Step 5: Verify quote was accepted (if configured)
      if (projectData.xero && projectData.xero.quoteAccepted !== undefined) {
        expect(projectData.xero.quoteAccepted).toBe(true);
      }
    });
  });
}); 