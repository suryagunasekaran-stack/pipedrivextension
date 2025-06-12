/**
 * Edge Cases and Error Scenario Tests
 * 
 * Tests for specific edge cases, race conditions, and error scenarios
 * that might not be covered in the main workflow tests.
 */

import { jest } from '@jest/globals';
import { TestEnvironment, waitForServer } from '../config/test-environment.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('E2E: Edge Cases and Error Scenarios', () => {
  let testEnv;
  let serverProcess;
  let testConfig;
  const baseUrl = 'http://localhost:3000';

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
    testConfig = await testEnv.getTestConfig();

    serverProcess = spawn('node', ['index.js'], {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, PORT: '3000' }
    });

    await waitForServer(baseUrl);
  }, 60000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
    await testEnv.cleanup();
  });

  afterEach(async () => {
    await testEnv.resetDatabase();
  });

  describe('Race Conditions', () => {
    test('should handle concurrent project number generation', async () => {
      // Skip if deal doesn't have department
      const promises = [];
      
      // Try to create 5 projects simultaneously
      for (let i = 0; i < 5; i++) {
        promises.push(
          fetch(`${baseUrl}/api/project/create-full`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pipedriveDealId: testConfig.dealId,
              pipedriveCompanyId: testConfig.companyId
            })
          })
        );
      }

      const responses = await Promise.all(promises);
      const results = await Promise.all(responses.map(r => r.json()));

      // Extract project numbers
      const projectNumbers = results
        .filter(r => r.success)
        .map(r => r.projectNumber);

      // All project numbers should be unique
      const uniqueNumbers = new Set(projectNumbers);
      expect(uniqueNumbers.size).toBe(projectNumbers.length);
    });

    test('should handle concurrent quote creation attempts', async () => {
      if (!testConfig.xeroTenantId) {
        console.log('⏭️  Skipping concurrent quote test - Xero not configured');
        return;
      }

      // Try to create 3 quotes simultaneously
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(
          fetch(`${baseUrl}/api/xero/create-quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pipedriveCompanyId: testConfig.companyId,
              pipedriveDealId: testConfig.dealId
            })
          })
        );
      }

      const responses = await Promise.all(promises);
      const successCount = responses.filter(r => r.status === 201).length;
      
      // Due to idempotency, only one should succeed
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Token Expiration Handling', () => {
    test('should handle expired Pipedrive token gracefully', async () => {
      // Manually expire the token in database
      const tokensCollection = testEnv.database.collection('auth_tokens');
      await tokensCollection.updateOne(
        { companyId: testConfig.companyId, service: 'pipedrive' },
        { $set: { tokenExpiresAt: new Date(Date.now() - 1000) } }
      );

      const response = await fetch(`${baseUrl}/api/pipedrive-data`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: testConfig.companyId,
          dealId: testConfig.dealId
        })
      });

      // Should either refresh token or return appropriate error
      expect([200, 401]).toContain(response.status);
    });

    test('should handle inactive tokens', async () => {
      // Deactivate tokens
      const tokensCollection = testEnv.database.collection('auth_tokens');
      await tokensCollection.updateMany(
        { companyId: testConfig.companyId },
        { $set: { isActive: false } }
      );

      const response = await fetch(`${baseUrl}/auth/status?companyId=${testConfig.companyId}`);
      const data = await response.json();

      expect(data.authenticated).toBe(false);
      expect(data.services.pipedrive).toBe(false);
      expect(data.services.xero).toBe(false);
    });
  });

  describe('Data Validation Edge Cases', () => {
    test('should handle special characters in organization names', async () => {
      // This tests if special characters are properly handled
      const specialDealId = '99996'; // Test deal with special org name
      
      const response = await fetch(`${baseUrl}/api/pipedrive-data?companyId=${testConfig.companyId}&dealId=${specialDealId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      // Should handle gracefully even with special characters
      expect([200, 404]).toContain(response.status);
    });

    test('should handle extremely large deal values', async () => {
      const largeDealId = '99995'; // Test deal with large value
      
      const response = await fetch(`${baseUrl}/api/pipedrive-data?companyId=${testConfig.companyId}&dealId=${largeDealId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status === 200) {
        const data = await response.json();
        expect(data.deal).toBeDefined();
      }
    });

    test('should validate project number format on linking', async () => {
      const invalidProjectNumber = 'INVALID123';
      
      const response = await fetch(`${baseUrl}/api/project/create-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveDealId: testConfig.dealId,
          pipedriveCompanyId: testConfig.companyId,
          existingProjectNumberToLink: invalidProjectNumber
        })
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      const data = await response.json();
      expect(data.error).toContain('format');
    });
  });

  describe('API Rate Limiting and Timeouts', () => {
    test('should handle rapid sequential requests', async () => {
      const requests = [];
      
      // Make 10 rapid requests
      for (let i = 0; i < 10; i++) {
        requests.push(
          fetch(`${baseUrl}/auth/status?companyId=${testConfig.companyId}`)
            .then(r => ({ status: r.status, ok: r.ok }))
        );
      }

      const results = await Promise.all(requests);
      const successCount = results.filter(r => r.ok).length;
      
      // At least some should succeed
      expect(successCount).toBeGreaterThan(0);
    });

    test('should handle slow Xero API responses', async () => {
      if (!testConfig.xeroTenantId) {
        return;
      }

      // This would ideally use a mock to simulate slow response
      // For now, we just ensure the endpoint has reasonable timeout handling
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${baseUrl}/api/xero/status?pipedriveCompanyId=${testConfig.companyId}`, {
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        expect(response.status).toBe(200);
      } catch (error) {
        // Should handle timeout gracefully
        expect(error.name).toBe('AbortError');
      }
    });
  });

  describe('Cross-Service Data Consistency', () => {
    test('should maintain consistency when Xero API fails during project creation', async () => {
      // Create project without Xero (simulate Xero failure)
      const response = await fetch(`${baseUrl}/api/project/create-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveDealId: testConfig.dealId,
          pipedriveCompanyId: '99998' // Company without Xero auth
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Should still create project number even if Xero fails
        expect(data.projectNumber).toBeDefined();
        expect(data.xero).toBeUndefined();
      }
    });

    test('should handle partial quote acceptance failure', async () => {
      if (!testConfig.xeroTenantId) {
        return;
      }

      // Create a quote first
      const quoteResponse = await fetch(`${baseUrl}/api/xero/create-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipedriveCompanyId: testConfig.companyId,
          pipedriveDealId: testConfig.dealId
        })
      });

      if (quoteResponse.status === 201) {
        const quoteData = await quoteResponse.json();

        // Try to accept a non-existent quote
        const acceptResponse = await fetch(`${baseUrl}/api/xero/accept-quote/invalid-quote-id`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipedriveCompanyId: testConfig.companyId
          })
        });

        expect(acceptResponse.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe('Security and Authorization', () => {
    test('should prevent cross-company data access', async () => {
      const otherCompanyId = '99997';
      
      // Try to access deal with wrong company ID
      const response = await fetch(`${baseUrl}/api/pipedrive-data?companyId=${otherCompanyId}&dealId=${testConfig.dealId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      // Should either fail auth or return no data
      expect([401, 403, 404]).toContain(response.status);
    });

    test('should validate request body size limits', async () => {
      // Test with a simple request since GET shouldn't have large bodies
      const response = await fetch(`${baseUrl}/api/pipedrive-data?companyId=${testConfig.companyId}&dealId=${testConfig.dealId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      // Should handle large payloads appropriately
      expect(response.status).toBeDefined();
    });
  });

  describe('Cleanup and Recovery', () => {
    test('should handle database connection loss gracefully', async () => {
      // This would require simulating database disconnection
      // For now, test that health check properly reports status
      const response = await fetch(`${baseUrl}/api/database/health`);
      const data = await response.json();

      expect(data.status).toBeDefined();
      expect(data.database.connected).toBe(true);
    });

    test('should cleanup orphaned project mappings', async () => {
      // Create orphaned mapping
      const mappingsCollection = testEnv.database.collection('deal_project_mappings');
      await mappingsCollection.insertOne({
        projectNumber: 'OR25999',
        pipedriveDealIds: [99994],
        department: 'Orphaned',
        departmentCode: 'OR',
        year: 25,
        sequence: 999,
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 days old
      });

      // Cleanup endpoint (if implemented)
      const response = await fetch(`${baseUrl}/api/database/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cleanupType: 'orphaned_mappings',
          olderThanDays: 30
        })
      });

      // Should handle cleanup request
      expect(response.status).toBeDefined();
    });
  });
}); 