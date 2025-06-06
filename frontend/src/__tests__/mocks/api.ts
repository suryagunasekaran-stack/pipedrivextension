/**
 * Mock Service Worker (MSW) API Mocks
 * Used for testing API interactions without hitting the real backend
 */

import { rest } from 'msw';
import { setupServer } from 'msw/node';

const API_BASE_URL = 'http://localhost:3000';

export const handlers = [
  // Auth Status endpoint
  rest.get(`${API_BASE_URL}/auth/status`, (req, res, ctx) => {
    const companyId = req.url.searchParams.get('companyId');
    
    if (companyId === 'test-no-auth') {
      return res(
        ctx.json({
          authenticated: false,
          services: {
            pipedrive: false,
            xero: false,
          },
          companyId,
        })
      );
    }
    
    return res(
      ctx.json({
        authenticated: true,
        services: {
          pipedrive: true,
          xero: companyId === 'test-with-xero',
        },
        companyId,
      })
    );
  }),

  // Pipedrive Auth URL endpoint
  rest.get(`${API_BASE_URL}/auth/auth-url`, (req, res, ctx) => {
    return res(
      ctx.json({
        authUrl: 'https://oauth.pipedrive.com/oauth/authorize?client_id=test&redirect_uri=test',
      })
    );
  }),

  // Pipedrive Data endpoint
  rest.get(`${API_BASE_URL}/api/pipedrive-data`, (req, res, ctx) => {
    const companyId = req.url.searchParams.get('companyId');
    const dealId = req.url.searchParams.get('dealId');

    if (!companyId || !dealId) {
      return res(
        ctx.status(400),
        ctx.json({
          error: 'Missing required parameters',
        })
      );
    }

    return res(
      ctx.json({
        success: true,
        deal: {
          id: parseInt(dealId),
          title: 'Test Deal',
          value: 10000,
          currency: 'USD',
          status: 'open',
          org_id: {
            name: 'Test Company',
            value: 123,
          },
          person_id: {
            name: 'John Doe',
            email: [{ value: 'john@test.com', primary: true }],
          },
        },
        person: {
          id: 456,
          name: 'John Doe',
          email: [{ value: 'john@test.com', primary: true }],
          phone: [{ value: '+1234567890', primary: true }],
        },
        organization: {
          id: 123,
          name: 'Test Company',
          address: '123 Test St, Test City, TC 12345',
        },
        products: [
          {
            id: 1,
            name: 'Product A',
            quantity: 2,
            item_price: 2500,
            sum: 5000,
          },
          {
            id: 2,
            name: 'Product B',
            quantity: 1,
            item_price: 5000,
            sum: 5000,
          },
        ],
      })
    );
  }),

  // Xero Status endpoint
  rest.get(`${API_BASE_URL}/api/xero/status`, (req, res, ctx) => {
    const pipedriveCompanyId = req.url.searchParams.get('pipedriveCompanyId');
    
    if (pipedriveCompanyId === 'test-no-xero') {
      return res(
        ctx.json({
          connected: false,
        })
      );
    }
    
    return res(
      ctx.json({
        connected: true,
        tenantId: 'test-tenant-id',
        tenantName: 'Test Organization',
        tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      })
    );
  }),

  // Create Quote endpoint
  rest.post(`${API_BASE_URL}/api/xero/create-quote`, async (req, res, ctx) => {
    const body = await req.json();
    
    if (!body.pipedriveCompanyId || !body.pipedriveDealId) {
      return res(
        ctx.status(400),
        ctx.json({
          error: 'Missing required fields',
        })
      );
    }
    
    return res(
      ctx.json({
        success: true,
        quoteNumber: 'QU-0001',
        quoteId: 'test-quote-id',
        contactName: 'Test Company',
        totalAmount: 10000,
        lineItemsCount: 2,
        pipedriveDealUpdated: true,
      })
    );
  }),

  // Create Project endpoint
  rest.post(`${API_BASE_URL}/api/project/create-full`, async (req, res, ctx) => {
    const body = await req.json();
    
    if (!body.pipedriveDealId || !body.pipedriveCompanyId) {
      return res(
        ctx.status(400),
        ctx.json({
          error: 'Missing required fields',
        })
      );
    }
    
    return res(
      ctx.json({
        success: true,
        projectNumber: body.existingProjectNumberToLink || 'NY25001',
        deal: {
          id: body.pipedriveDealId,
          title: 'Test Deal',
          value: 10000,
          currency: 'USD',
        },
        organization: {
          name: 'Test Company',
        },
        xero: {
          projectCreated: true,
          projectId: 'test-project-id',
          projectName: 'Test Project',
          tasksCreated: ['Task 1', 'Task 2'],
          quoteAccepted: true,
        },
        metadata: {
          dealId: body.pipedriveDealId,
          companyId: body.pipedriveCompanyId,
          isNewProject: !body.existingProjectNumberToLink,
        },
      })
    );
  }),

  // Logout endpoint
  rest.post(`${API_BASE_URL}/auth/logout`, async (req, res, ctx) => {
    return res(ctx.status(200));
  }),
];

// Setup server instance
export const server = setupServer(...handlers);

// Reset handlers after each test
export function resetHandlers() {
  server.resetHandlers();
}

// Add custom handlers for specific tests
export function addHandler(handler: any) {
  server.use(handler);
}