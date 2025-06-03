/**
 * End-to-end test scenarios
 * Tests complete workflows from user request to final response
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  PipedriveMock,
  XeroMock,
  TestDataManager,
  mockAuth,
  mockData,
  cleanupMocks
} from '../testUtils.js';
import { mongoService } from '../../services/mongoService.js';

// Import your main app or create a test app
import projectRoutes from '../../routes/projectRoutes.js';
import { errorHandler } from '../../middleware/errorHandler.js';

describe('End-to-End Test Scenarios', () => {
  let app;
  let mongod;
  let pipedriveMock;
  let xeroMock;
  let testDataManager;

  beforeAll(async () => {
    // Setup test database
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    await mongoService.connect();

    // Setup Express app for testing
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use('/api/projects', (req, res, next) => {
      req.pipedriveAuth = mockAuth.validPipedriveAuth;
      req.xeroAuth = mockAuth.validXeroAuth;
      req.log = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
      };
      req.id = `test-${Date.now()}`;
      req.get = jest.fn(() => 'Test User Agent');
      next();
    });
    
    app.use('/api/projects', projectRoutes);
    app.use(errorHandler);
  });

  afterAll(async () => {
    await mongod?.stop();
    await mongoService.disconnect();
  });

  beforeEach(() => {
    pipedriveMock = new PipedriveMock();
    xeroMock = new XeroMock();
    testDataManager = new TestDataManager();
  });

  afterEach(async () => {
    cleanupMocks();
    await testDataManager.cleanup();
  });

  describe('Scenario 1: New customer, new deal, new project', () => {
    test('Complete new project creation workflow', async () => {
      console.log('🧪 Running Scenario 1: New customer, new deal, new project');

      // Setup: New deal with all required fields
      const dealData = mockData.pipedriveDeal('12345', {
        title: 'New Customer Project',
        value: 50000,
        custom_fields: {
          department: 'Engineering',
          vessel: 'Vessel Alpha',
          person_in_charge: 'John Smith',
          location: 'Port of Miami'
        }
      });

      // Mock API calls
      pipedriveMock
        .mockGetDeal('12345', dealData)
        .mockGetPerson('101', mockData.pipedrivePerson('101'))
        .mockGetOrganization('201', mockData.pipedriveOrganization('201'))
        .mockGetDealProducts('12345', [
          { id: 1, product_id: 301, item_price: 25000, quantity: 2, name: 'Premium Service' }
        ])
        .mockUpdateDeal('12345');

      xeroMock
        .mockGetContacts([]) // No existing contact
        .mockCreateContact(mockData.xeroContact())
        .mockCreateProject(mockData.xeroProject());

      // Execute workflow
      const response = await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '12345',
          pipedriveCompanyId: 'test-company'
        })
        .expect(201);

      // Verify complete response
      expect(response.body).toMatchObject({
        success: true,
        projectNumber: 'ENG-001',
        message: expect.stringContaining('New project created successfully'),
        deal: expect.objectContaining({
          title: 'New Customer Project',
          value: 50000,
          departmentName: 'Engineering',
          projectNumber: 'ENG-001'
        }),
        person: expect.objectContaining({
          name: 'John Doe'
        }),
        organization: expect.objectContaining({
          name: 'Test Company'
        }),
        products: expect.arrayContaining([
          expect.objectContaining({
            name: 'Premium Service',
            item_price: 25000
          })
        ]),
        xero: expect.objectContaining({
          projectCreated: true,
          contact: expect.any(Object),
          project: expect.any(Object)
        }),
        metadata: expect.objectContaining({
          dealId: '12345',
          companyId: 'test-company',
          isNewProject: true,
          generatedAt: expect.any(String)
        })
      });

      console.log('✅ Scenario 1 completed successfully');
    });
  });

  describe('Scenario 2: Existing customer, link to existing project', () => {
    test('Link deal to existing project workflow', async () => {
      console.log('🧪 Running Scenario 2: Existing customer, link to existing project');

      // Setup: Deal to be linked to existing project
      const dealData = mockData.pipedriveDeal('12346', {
        title: 'Additional Work for Existing Project',
        value: 15000
      });

      // Mock API calls
      pipedriveMock
        .mockGetDeal('12346', dealData)
        .mockGetPerson('102', mockData.pipedrivePerson('102'))
        .mockGetOrganization('201', mockData.pipedriveOrganization('201'))
        .mockGetDealProducts('12346', [])
        .mockUpdateDeal('12346');

      xeroMock
        .mockGetContacts([mockData.xeroContact()])
        .mockGetProjects([mockData.xeroProject('existing-project', 'ENG-005')]);

      // Execute workflow with existing project number
      const response = await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '12346',
          pipedriveCompanyId: 'test-company',
          existingProjectNumberToLink: 'ENG-005'
        })
        .expect(201);

      // Verify linking response
      expect(response.body).toMatchObject({
        success: true,
        projectNumber: 'ENG-005',
        message: expect.stringContaining('linked to existing project'),
        metadata: expect.objectContaining({
          isNewProject: false
        })
      });

      console.log('✅ Scenario 2 completed successfully');
    });
  });

  describe('Scenario 3: Partial failures and recovery', () => {
    test('Handle Xero failure gracefully while completing Pipedrive operations', async () => {
      console.log('🧪 Running Scenario 3: Partial failures and recovery');

      // Setup: Valid deal but Xero will fail
      const dealData = mockData.pipedriveDeal('12347');

      pipedriveMock
        .mockGetDeal('12347', dealData)
        .mockGetPerson('101', mockData.pipedrivePerson('101'))
        .mockGetOrganization('201', mockData.pipedriveOrganization('201'))
        .mockGetDealProducts('12347', mockData.dealProducts('12347'))
        .mockUpdateDeal('12347');

      xeroMock
        .mockGetContacts([])
        .mockCreateContact(null, 500); // Xero contact creation fails

      // Execute workflow
      const response = await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '12347',
          pipedriveCompanyId: 'test-company'
        })
        .expect(201); // Should still succeed

      // Verify partial success
      expect(response.body).toMatchObject({
        success: true,
        projectNumber: expect.any(String),
        deal: expect.any(Object),
        xero: expect.objectContaining({
          projectCreated: false,
          error: expect.any(String)
        })
      });

      console.log('✅ Scenario 3 completed successfully');
    });
  });

  describe('Scenario 4: High volume concurrent requests', () => {
    test('Handle multiple simultaneous project creation requests', async () => {
      console.log('🧪 Running Scenario 4: High volume concurrent requests');

      const concurrentRequests = 5;
      const requests = [];

      // Setup multiple concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        const dealId = `concurrent-${i}`;
        const dealData = mockData.pipedriveDeal(dealId, {
          title: `Concurrent Deal ${i}`,
          custom_fields: {
            department: i % 2 === 0 ? 'Engineering' : 'Sales'
          }
        });

        // Setup mocks for each request
        new PipedriveMock()
          .mockGetDeal(dealId, dealData)
          .mockGetPerson(`person-${i}`, mockData.pipedrivePerson(`person-${i}`))
          .mockGetOrganization(`org-${i}`, mockData.pipedriveOrganization(`org-${i}`))
          .mockGetDealProducts(dealId, [])
          .mockUpdateDeal(dealId);

        requests.push(
          request(app)
            .post('/api/projects/create')
            .send({
              pipedriveDealId: dealId,
              pipedriveCompanyId: 'test-company'
            })
        );
      }

      // Execute all requests concurrently
      const responses = await Promise.all(requests);

      // Verify all succeeded
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.projectNumber).toBeDefined();
      });

      // Verify unique project numbers
      const projectNumbers = responses.map(r => r.body.projectNumber);
      const uniqueNumbers = new Set(projectNumbers);
      expect(uniqueNumbers.size).toBe(concurrentRequests);

      console.log('✅ Scenario 4 completed successfully');
    });
  });

  describe('Scenario 5: Data validation and sanitization', () => {
    test('Handle edge cases in input data', async () => {
      console.log('🧪 Running Scenario 5: Data validation and sanitization');

      // Test various edge cases
      const edgeCases = [
        {
          name: 'Very large deal ID',
          input: { pipedriveDealId: '999999999', pipedriveCompanyId: 'test-company' },
          expectedStatus: 201
        },
        {
          name: 'Invalid deal ID format',
          input: { pipedriveDealId: 'invalid-id', pipedriveCompanyId: 'test-company' },
          expectedStatus: 400
        },
        {
          name: 'Missing required fields',
          input: { pipedriveDealId: '12345' },
          expectedStatus: 400
        },
        {
          name: 'Empty company ID',
          input: { pipedriveDealId: '12345', pipedriveCompanyId: '' },
          expectedStatus: 400
        }
      ];

      for (const edgeCase of edgeCases) {
        console.log(`  Testing: ${edgeCase.name}`);

        if (edgeCase.expectedStatus === 201) {
          // Setup mocks for successful cases
          pipedriveMock
            .mockGetDeal(edgeCase.input.pipedriveDealId)
            .mockGetPerson('101')
            .mockGetOrganization('201')
            .mockGetDealProducts(edgeCase.input.pipedriveDealId)
            .mockUpdateDeal(edgeCase.input.pipedriveDealId);
        }

        const response = await request(app)
          .post('/api/projects/create')
          .send(edgeCase.input)
          .expect(edgeCase.expectedStatus);

        if (edgeCase.expectedStatus === 400) {
          expect(response.body.error).toBeDefined();
        }
      }

      console.log('✅ Scenario 5 completed successfully');
    });
  });

  describe('Scenario 6: Different department workflows', () => {
    test('Handle projects from different departments with proper numbering', async () => {
      console.log('🧪 Running Scenario 6: Different department workflows');

      const departments = ['Engineering', 'Sales', 'Marketing', 'Operations'];
      const responses = [];

      for (let i = 0; i < departments.length; i++) {
        const department = departments[i];
        const dealId = `dept-${i}`;
        
        const dealData = mockData.pipedriveDeal(dealId, {
          title: `${department} Project`,
          custom_fields: {
            department: department,
            vessel: `Vessel ${department}`,
            person_in_charge: `Manager ${department}`,
            location: `Location ${department}`
          }
        });

        pipedriveMock
          .mockGetDeal(dealId, dealData)
          .mockGetPerson(`person-${i}`, mockData.pipedrivePerson(`person-${i}`))
          .mockGetOrganization(`org-${i}`, mockData.pipedriveOrganization(`org-${i}`))
          .mockGetDealProducts(dealId, [])
          .mockUpdateDeal(dealId);

        const response = await request(app)
          .post('/api/projects/create')
          .send({
            pipedriveDealId: dealId,
            pipedriveCompanyId: 'test-company'
          })
          .expect(201);

        responses.push(response);
      }

      // Verify department-specific project numbers
      const expectedPrefixes = {
        'Engineering': 'ENG',
        'Sales': 'SAL', 
        'Marketing': 'MKT',
        'Operations': 'OPE'
      };

      responses.forEach((response, index) => {
        const department = departments[index];
        const expectedPrefix = expectedPrefixes[department];
        expect(response.body.projectNumber).toMatch(new RegExp(`^${expectedPrefix}-001$`));
      });

      console.log('✅ Scenario 6 completed successfully');
    });
  });
});
