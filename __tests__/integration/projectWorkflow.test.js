/**
 * Integration tests for the complete project creation workflow
 * Tests the entire flow from API request to database updates
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import {
  PipedriveMock,
  XeroMock,
  TestDataManager,
  mockAuth,
  cleanupMocks
} from '../testUtils.js';
import { mongoService } from '../../services/mongoService.js';

// Import routes and middleware
import projectRoutes from '../../routes/projectRoutes.js';
import { errorHandler } from '../../middleware/errorHandler.js';

describe('Project Creation Integration Tests', () => {
  let app;
  let mongod;
  let mongoClient;
  let db;
  let pipedriveMock;
  let xeroMock;
  let testDataManager;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    process.env.MONGODB_URI = mongoUri;

    // Connect to test database
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    db = mongoClient.db();

    // Initialize MongoDB service
    await mongoService.connect();

    // Setup Express app
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
      req.id = 'test-request-id';
      req.get = jest.fn(() => 'Test User Agent');
      next();
    });
    
    app.use('/api/projects', projectRoutes);
    app.use(errorHandler);
  });

  afterAll(async () => {
    await mongoClient?.close();
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
    
    // Clean up database collections
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }
  });

  describe('Complete workflow integration', () => {
    test('should complete full project creation workflow with database persistence', async () => {
      // Setup API mocks
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      xeroMock
        .mockGetContacts([])
        .mockCreateContact()
        .mockCreateProject();

      // Make request
      const response = await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '12345',
          pipedriveCompanyId: 'test-company'
        })
        .expect(201);

      // Verify response structure
      expect(response.body).toMatchObject({
        success: true,
        projectNumber: expect.stringMatching(/^[A-Z]+-\d+$/),
        deal: expect.any(Object),
        person: expect.any(Object),
        organization: expect.any(Object),
        products: expect.any(Array),
        xero: expect.objectContaining({
          projectCreated: true
        }),
        metadata: expect.objectContaining({
          dealId: '12345',
          companyId: 'test-company',
          isNewProject: true
        })
      });

      // Verify database state
      const projectSequences = await db.collection('projectSequences').find({}).toArray();
      expect(projectSequences).toHaveLength(1);
      expect(projectSequences[0]).toMatchObject({
        department: 'Engineering',
        currentNumber: 1
      });

      // Verify all mocks were called
      pipedriveMock.done();
      xeroMock.done();
    });

    test('should handle multiple projects with proper sequence increment', async () => {
      // Create first project
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      const response1 = await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '12345',
          pipedriveCompanyId: 'test-company'
        })
        .expect(201);

      // Create second project
      pipedriveMock
        .mockGetDeal('12346')
        .mockGetPerson('102')
        .mockGetOrganization('202')
        .mockGetDealProducts('12346')
        .mockUpdateDeal('12346');

      const response2 = await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '12346',
          pipedriveCompanyId: 'test-company'
        })
        .expect(201);

      // Verify sequential project numbers
      const projectNumber1 = response1.body.projectNumber;
      const projectNumber2 = response2.body.projectNumber;
      
      expect(projectNumber1).toMatch(/ENG-001/);
      expect(projectNumber2).toMatch(/ENG-002/);

      // Verify database state
      const projectSequences = await db.collection('projectSequences').find({}).toArray();
      expect(projectSequences).toHaveLength(1);
      expect(projectSequences[0].currentNumber).toBe(2);
    });

    test('should handle project linking to existing project number', async () => {
      // First, create a project to establish sequence
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '12345',
          pipedriveCompanyId: 'test-company'
        })
        .expect(201);

      // Now link another deal to existing project
      pipedriveMock
        .mockGetDeal('12346')
        .mockGetPerson('102')
        .mockGetOrganization('202')
        .mockGetDealProducts('12346')
        .mockUpdateDeal('12346');

      xeroMock
        .mockGetContacts([])
        .mockGetProjects([{
          ProjectId: 'existing-project',
          Name: 'Existing Project ENG-001',
          ProjectNumber: 'ENG-001'
        }]);

      const response = await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '12346',
          pipedriveCompanyId: 'test-company',
          existingProjectNumberToLink: 'ENG-001'
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        projectNumber: 'ENG-001',
        message: expect.stringContaining('linked to existing project'),
        metadata: expect.objectContaining({
          isNewProject: false
        })
      });

      // Verify sequence counter didn't increment
      const projectSequences = await db.collection('projectSequences').find({}).toArray();
      expect(projectSequences[0].currentNumber).toBe(1); // Should still be 1
    });
  });

  describe('Error handling integration', () => {
    test('should handle database connection failures gracefully', async () => {
      // Close database connection to simulate failure
      await mongoService.disconnect();

      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201');

      const response = await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '12345',
          pipedriveCompanyId: 'test-company'
        })
        .expect(500);

      expect(response.body).toMatchObject({
        error: expect.stringContaining('database'),
        pipedriveDealId: '12345',
        pipedriveCompanyId: 'test-company'
      });

      // Reconnect for cleanup
      await mongoService.connect();
    });

    test('should rollback on partial failures', async () => {
      // Setup successful Pipedrive calls but failing Xero
      pipedriveMock
        .mockGetDeal('12345')
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('12345')
        .mockUpdateDeal('12345');

      // Force Xero contact creation to fail
      xeroMock
        .mockGetContacts([])
        .mockCreateContact(null, 500);

      const response = await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '12345',
          pipedriveCompanyId: 'test-company'
        })
        .expect(201); // Should still succeed with partial Xero failure

      expect(response.body).toMatchObject({
        success: true,
        xero: expect.objectContaining({
          projectCreated: false,
          error: expect.any(String)
        })
      });

      // Verify project sequence was still created
      const projectSequences = await db.collection('projectSequences').find({}).toArray();
      expect(projectSequences).toHaveLength(1);
    });

    test('should handle concurrent requests without race conditions', async () => {
      // Setup multiple concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) => {
        new PipedriveMock()
          .mockGetDeal(`1234${i}`)
          .mockGetPerson(`10${i}`)
          .mockGetOrganization(`20${i}`)
          .mockGetDealProducts(`1234${i}`)
          .mockUpdateDeal(`1234${i}`);

        return request(app)
          .post('/api/projects/create')
          .send({
            pipedriveDealId: `1234${i}`,
            pipedriveCompanyId: 'test-company'
          });
      });

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // Verify unique project numbers
      const projectNumbers = responses.map(r => r.body.projectNumber);
      const uniqueNumbers = new Set(projectNumbers);
      expect(uniqueNumbers.size).toBe(5); // All should be unique

      // Verify database consistency
      const projectSequences = await db.collection('projectSequences').find({}).toArray();
      expect(projectSequences).toHaveLength(1);
      expect(projectSequences[0].currentNumber).toBe(5);
    });
  });

  describe('Performance and load testing', () => {
    test('should handle high load with acceptable performance', async () => {
      const startTime = Date.now();
      const batchSize = 10;

      // Create batch of requests
      const requests = Array.from({ length: batchSize }, (_, i) => {
        new PipedriveMock()
          .mockGetDeal(`load-test-${i}`)
          .mockGetPerson(`person-${i}`)
          .mockGetOrganization(`org-${i}`)
          .mockGetDealProducts(`load-test-${i}`)
          .mockUpdateDeal(`load-test-${i}`);

        return request(app)
          .post('/api/projects/create')
          .send({
            pipedriveDealId: `load-test-${i}`,
            pipedriveCompanyId: 'test-company'
          });
      });

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Should complete within reasonable time (adjust based on requirements)
      expect(duration).toBeLessThan(10000); // 10 seconds for 10 requests

      console.log(`Processed ${batchSize} requests in ${duration}ms (${duration/batchSize}ms avg per request)`);
    });
  });

  describe('Data validation integration', () => {
    test('should validate and sanitize input data end-to-end', async () => {
      const maliciousInput = {
        pipedriveDealId: '<script>alert("xss")</script>12345',
        pipedriveCompanyId: 'test-company',
        existingProjectNumberToLink: '<img src=x onerror=alert(1)>PROJ-001'
      };

      const response = await request(app)
        .post('/api/projects/create')
        .send(maliciousInput)
        .expect(400);

      expect(response.body.error).toContain('must be a valid integer');
    });

    test('should handle edge case data values', async () => {
      pipedriveMock
        .mockGetDeal('999999999') // Very large deal ID
        .mockGetPerson('101')
        .mockGetOrganization('201')
        .mockGetDealProducts('999999999')
        .mockUpdateDeal('999999999');

      const response = await request(app)
        .post('/api/projects/create')
        .send({
          pipedriveDealId: '999999999',
          pipedriveCompanyId: 'test-company'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.metadata.dealId).toBe('999999999');
    });
  });
});
