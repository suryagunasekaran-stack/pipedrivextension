/**
 * Xero Integration Routes
 * 
 * Handles all Xero accounting software integration endpoints including
 * connection status, quote management, and project creation. This module
 * provides the REST API interface for Xero operations.
 * 
 * Routes:
 * - GET /api/xero/status - Check Xero connection status
 * - POST /api/xero/create-quote - Create new quote in Xero
 * - PUT /api/xero/accept-quote/:quoteId - Accept existing Xero quote
 * - POST /api/xero/create-project - Create project in Xero
 * - PUT /api/xero/update-quotation - Update quotation on Xero using Pipedrive deal data
 * 
 * @module routes/xeroRoutes
 */

import express from 'express';
import * as xeroController from '../controllers/xeroController.js';
import { requirePipedriveWithOptionalXero, requireXeroAuth, requireBothPipedriveAndXero } from '../middleware/authMiddleware.js';
import { logRoute } from '../middleware/routeLogger.js';

const router = express.Router();

// API to check Xero connection status (no auth required, just checks status)
router.get('/api/xero/status', 
    logRoute('Check Xero Status'), 
    xeroController.getXeroStatus
);

// API to create Xero Quote (requires both Pipedrive and Xero auth)
router.post('/api/xero/create-quote', 
    logRoute('Create Xero Quote'), 
    requireBothPipedriveAndXero, 
    xeroController.createXeroQuote
);

// API to accept a Xero Quote (requires Xero auth)
router.put('/api/xero/accept-quote/:quoteId', 
    logRoute('Accept Xero Quote'), 
    requireXeroAuth, 
    xeroController.acceptXeroQuote
);

// API to create a Xero Project (requires Xero auth)
router.post('/api/xero/create-project', 
    logRoute('Create Xero Project'), 
    requireXeroAuth, 
    xeroController.createXeroProject
);

// Debug endpoint to test quote acceptance (no auth middleware for easier testing)
router.post('/api/xero/debug-quote-acceptance', 
    logRoute('Debug Quote Acceptance'), 
    xeroController.debugQuoteAcceptance
);

// API to update quotation on Xero using Pipedrive deal data (requires both Pipedrive and Xero auth)
router.put('/api/xero/update-quotation', 
    logRoute('Update Quotation on Xero'), 
    requireBothPipedriveAndXero, 
    xeroController.updateQuotationOnXero
);

export default router;
