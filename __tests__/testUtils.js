/**
 * Test utilities for mocking external APIs (Pipedrive and Xero)
 * This allows testing without making real API calls and handles OAuth flows
 */

import nock from 'nock';
import { jest } from '@jest/globals';

// Simple mock function for ES modules environment
const mockFn = (returnValue) => {
  return jest.fn().mockReturnValue(returnValue);
};

/**
 * Mock data generators for consistent test data
 */
const mockData = {
  pipedriveDeal: (dealId = '12345', customFields = {}) => ({
    id: dealId,
    title: `Test Deal ${dealId}`,
    value: 10000,
    currency: 'USD',
    stage_id: 1,
    person_id: { value: 101 },
    org_id: { value: 201 },
    status: 'open',
    expected_close_date: '2025-12-31',
    custom_fields: 'Engineering',
    department: 'Engineering',
    vessel: 'Test Vessel',
    person_in_charge: 'John Doe',
    location: 'Test Location',
    ...customFields
  }),

  pipedrivePerson: (personId = '101') => ({
    id: personId,
    name: 'John Doe',
    email: [{ value: 'john.doe@example.com', primary: true }],
    phone: [{ value: '+1234567890', primary: true }],
    org_id: 201
  }),

  pipedriveOrganization: (orgId = '201') => ({
    id: orgId,
    name: 'Test Company',
    address: '123 Test Street',
    country: 'United States'
  }),

  dealProducts: (dealId = '12345') => [
    {
      id: 1,
      product_id: 301,
      item_price: 5000,
      quantity: 2,
      name: 'Test Product 1'
    }
  ],

  xeroContact: (contactId = 'xero-contact-123') => ({
    ContactID: contactId,
    Name: 'Test Company',
    EmailAddress: 'contact@testcompany.com',
    ContactStatus: 'ACTIVE'
  }),

  xeroProject: (projectId = 'xero-project-123', projectNumber = 'PROJ-001') => ({
    ProjectId: projectId,
    Name: `Project ${projectNumber}`,
    ProjectNumber: projectNumber,
    Status: 'INPROGRESS',
    ContactId: 'xero-contact-123'
  })
};

/**
 * Pipedrive API mocking utilities
 */
class PipedriveMock {
  constructor(apiDomain = 'api.pipedrive.com') {
    this.apiDomain = apiDomain;
    this.scope = nock(`https://${apiDomain}`);
  }

  mockGetDeal(dealId, dealData = null, statusCode = 200) {
    const data = dealData || mockData.pipedriveDeal(dealId);
    this.scope
      .get(`/v1/deals/${dealId}`)
      .query(true)
      .reply(statusCode, statusCode === 200 ? { success: true, data } : { success: false, error: 'Deal not found' });
    return this;
  }

  mockGetPerson(personId, personData = null, statusCode = 200) {
    const data = personData || mockData.pipedrivePerson(personId);
    this.scope
      .get(`/v1/persons/${personId}`)
      .query(true)
      .reply(statusCode, statusCode === 200 ? { success: true, data } : { success: false, error: 'Person not found' });
    return this;
  }

  mockGetOrganization(orgId, orgData = null, statusCode = 200) {
    const data = orgData || mockData.pipedriveOrganization(orgId);
    this.scope
      .get(`/v1/organizations/${orgId}`)
      .query(true)
      .reply(statusCode, statusCode === 200 ? { success: true, data } : { success: false, error: 'Organization not found' });
    return this;
  }

  mockGetDealProducts(dealId, productsData = null, statusCode = 200) {
    const data = productsData || mockData.dealProducts(dealId);
    this.scope
      .get(`/v1/deals/${dealId}/products`)
      .query(true)
      .reply(statusCode, statusCode === 200 ? { success: true, data } : { success: false, error: 'Products not found' });
    return this;
  }

  mockUpdateDeal(dealId, statusCode = 200) {
    this.scope
      .put(`/v1/deals/${dealId}`)
      .reply(statusCode, statusCode === 200 ? { success: true, data: mockData.pipedriveDeal(dealId) } : { success: false, error: 'Update failed' });
    return this;
  }

  mockAuthTokenRefresh(newTokenData = null, statusCode = 200) {
    const tokenData = newTokenData || {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      api_domain: this.apiDomain
    };
    
    nock('https://oauth.pipedrive.com')
      .post('/oauth/token')
      .reply(statusCode, tokenData);
    return this;
  }

  done() {
    return this.scope.done();
  }
}

/**
 * Xero API mocking utilities
 */
class XeroMock {
  constructor() {
    this.scope = nock('https://api.xero.com');
  }

  mockGetContacts(contacts = null, statusCode = 200) {
    const data = contacts || [mockData.xeroContact()];
    this.scope
      .get('/api.xro/2.0/Contacts')
      .query(true)
      .reply(statusCode, statusCode === 200 ? { Contacts: data } : { ErrorNumber: 404, Type: 'NotFoundError' });
    return this;
  }

  mockCreateContact(contactData = null, statusCode = 200) {
    const data = contactData || mockData.xeroContact();
    this.scope
      .put('/api.xro/2.0/Contacts')
      .reply(statusCode, statusCode === 200 ? { Contacts: [data] } : { ErrorNumber: 400, Type: 'ValidationError' });
    return this;
  }

  mockCreateProject(projectData = null, statusCode = 200) {
    const data = projectData || mockData.xeroProject();
    this.scope
      .put('/projects.xro/2.0/Projects')
      .reply(statusCode, statusCode === 200 ? { Projects: [data] } : { ErrorNumber: 400, Type: 'ValidationError' });
    return this;
  }

  mockGetProjects(projects = null, statusCode = 200) {
    const data = projects || [mockData.xeroProject()];
    this.scope
      .get('/projects.xro/2.0/Projects')
      .query(true)
      .reply(statusCode, statusCode === 200 ? { Projects: data } : { ErrorNumber: 404, Type: 'NotFoundError' });
    return this;
  }

  mockAuthTokenRefresh(newTokenData = null, statusCode = 200) {
    const tokenData = newTokenData || {
      access_token: 'new-xero-access-token',
      refresh_token: 'new-xero-refresh-token',
      expires_in: 1800
    };
    
    nock('https://identity.xero.com')
      .post('/connect/token')
      .reply(statusCode, tokenData);
    return this;
  }

  done() {
    return this.scope.done();
  }
}

/**
 * Test data cleanup utilities
 */
class TestDataManager {
  constructor() {
    this.createdDeals = [];
    this.createdProjects = [];
    this.projectNumbers = [];
  }

  addDeal(dealId) {
    this.createdDeals.push(dealId);
  }

  addProject(projectNumber) {
    this.projectNumbers.push(projectNumber);
  }

  // Mock cleanup - in real scenario, you'd implement actual cleanup logic
  async cleanup() {
    // Reset project sequence counter for tests
    // This would typically reset to a test-specific starting point
    console.log(`Cleaning up test data: ${this.createdDeals.length} deals, ${this.projectNumbers.length} projects`);
    
    // Clear arrays
    this.createdDeals = [];
    this.createdProjects = [];
    this.projectNumbers = [];
  }
}

/**
 * Authentication mock utilities
 */
const mockAuth = {
  validPipedriveAuth: {
    accessToken: 'valid-pipedrive-token',
    apiDomain: 'testcompany.pipedrive.com',
    tokenExpiresAt: Date.now() + 3600000 // 1 hour from now
  },

  expiredPipedriveAuth: {
    accessToken: 'expired-pipedrive-token',
    apiDomain: 'testcompany.pipedrive.com',
    tokenExpiresAt: Date.now() - 1000 // Expired
  },

  validXeroAuth: {
    accessToken: 'valid-xero-token',
    refreshToken: 'valid-xero-refresh',
    tokenExpiresAt: Date.now() + 1800000 // 30 minutes from now
  },

  expiredXeroAuth: {
    accessToken: 'expired-xero-token',
    refreshToken: 'valid-xero-refresh',
    tokenExpiresAt: Date.now() - 1000 // Expired
  }
};

/**
 * Request mocking for testing middleware
 */
const createMockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
  pipedriveAuth: null,
  xeroAuth: null,
  log: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  },
  id: 'test-request-id',
  get: jest.fn(() => 'Test User Agent'),
  ...overrides
});

/**
 * Response mocking for testing controllers
 */
const createMockResponse = () => {
  const res = {
    statusCode: 200,
    data: null
  };
  
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  
  res.json = jest.fn((data) => {
    res.data = data;
    return res;
  });
  
  res.send = jest.fn((data) => {
    res.data = data;
    return res;
  });
  
  res.cookie = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  
  return res;
};

// Clean up nock after each test
const cleanupMocks = () => {
  nock.cleanAll();
};

// Export all utilities using ES modules syntax
export {
  mockData,
  PipedriveMock,
  XeroMock,
  TestDataManager,
  mockAuth,
  createMockRequest,
  createMockResponse,
  cleanupMocks,
  mockFn
}; 