/**
 * Pipedrive Integration Routes
 * 
 * Handles all Pipedrive-related API endpoints including deal management,
 * project creation, and data retrieval. This module provides the REST API
 * interface for Pipedrive operations and webhook handling.
 * 
 * Routes:
 * - GET /pipedrive-action - Handle Pipedrive app extension actions (requires auth)
 * - GET /api/pipedrive-data - Retrieve Pipedrive data for frontend (requires auth)
 * - POST /api/pipedrive/create-project - Create project from Pipedrive deal (requires auth)
 * - POST /api/pipedrive/create-invoice - Create invoice from Pipedrive deal (requires auth)
 * - POST /api/pipedrive/get-quotation-data - Get quotation data for updating (requires both Pipedrive and Xero auth)
 * 
 * @module routes/pipedriveRoutes
 */

import express from 'express';
import { getPipedriveData, createProject, createInvoice, handlePipedriveAction, getQuotationData } from '../controllers/pipedriveController.js';
import { requirePipedriveAuth, requireBothPipedriveAndXero } from '../middleware/authMiddleware.js';
import { logRoute } from '../middleware/routeLogger.js';

const router = express.Router();

// Pipedrive Action URL (from App Extensions) - requires auth but uses query params
router.get('/pipedrive-action', 
    logRoute('Handle Pipedrive Action'), 
    requirePipedriveAuth, 
    handlePipedriveAction
);

// API to get Pipedrive data for frontend - requires auth
router.get('/api/pipedrive-data', 
    logRoute('Get Pipedrive Data'), 
    requirePipedriveAuth, 
    getPipedriveData
);

// Route to handle the Pipedrive action for creating a project - requires auth
router.post('/api/pipedrive/create-project', 
    logRoute('Create Project from Deal'), 
    requirePipedriveAuth, 
    createProject
);

// Route to handle the Pipedrive action for creating an invoice - requires auth
router.post('/api/pipedrive/create-invoice', 
    logRoute('Create Invoice from Deal'), 
    requirePipedriveAuth, 
    createInvoice
);

// Route to get quotation data for updating - requires both Pipedrive and Xero auth
router.post('/api/pipedrive/get-quotation-data', 
    logRoute('Get Quotation Data for Update'), 
    requireBothPipedriveAndXero, 
    getQuotationData
);

export default router;
