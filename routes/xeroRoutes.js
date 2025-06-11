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
 * - POST /api/xero/accept-quote - Accept existing Xero quote
 * - POST /api/xero/create-project - Create project in Xero
 * - PUT /api/xero/update-quotation - Update quotation on Xero using Pipedrive deal data
 * 
 * @module routes/xeroRoutes
 */

import express from 'express';
import * as xeroController from '../controllers/xeroController.js';
import { requirePipedriveWithOptionalXero, requireXeroAuth, requireBothPipedriveAndXero } from '../middleware/authMiddleware.js';
import { logRoute } from '../middleware/routeLogger.js';
import { validate, sanitizeAll } from '../middleware/inputValidation.js';
import { attachRequestCache } from '../services/batchOperationsService.js';

const router = express.Router();

// API to check Xero connection status (no auth required, just checks status)
router.get('/api/xero/status', 
    logRoute('Check Xero Status'), 
    xeroController.getXeroStatus
);

// API to create Xero Quote (requires both Pipedrive and Xero auth)
router.post('/api/xero/create-quote', 
    logRoute('Create Xero Quote'), 
    sanitizeAll,
    validate('createXeroQuote'),
    attachRequestCache,  // Add caching to reduce redundant API calls
    requireBothPipedriveAndXero, 
    xeroController.createXeroQuote
);

// API to accept a Xero Quote (requires both Pipedrive and Xero auth)
router.post('/api/xero/accept-quote', 
    logRoute('Accept Xero Quote'), 
    sanitizeAll,
    validate('acceptXeroQuote'),
    requireBothPipedriveAndXero, 
    xeroController.acceptXeroQuote
);

// API to create a Xero Project (requires Xero auth)
router.post('/api/xero/create-project', 
    logRoute('Create Xero Project'), 
    sanitizeAll,
    validate('createXeroProject'),
    requireXeroAuth, 
    xeroController.createXeroProject
);

// API to update quotation on Xero using Pipedrive deal data (requires both Pipedrive and Xero auth)
router.put('/api/xero/update-quotation', 
    logRoute('Update Quotation on Xero'), 
    sanitizeAll,
    validate('updateQuotationOnXero'),
    attachRequestCache,  // Add caching to reduce redundant API calls
    requireBothPipedriveAndXero, 
    xeroController.updateQuotationOnXero
);

// API to update quote with versioning (requires both Pipedrive and Xero auth)
router.put('/api/xero/update-quote', 
    logRoute('Update Quote with Versioning'), 
    sanitizeAll,
    validate('updateQuoteWithVersioning'),
    attachRequestCache,  // Add caching to reduce redundant API calls
    requireBothPipedriveAndXero, 
    xeroController.updateQuoteWithVersioning
);

// API to create invoice from quote (requires both Pipedrive and Xero auth)
router.post('/api/xero/create-invoice-from-quote', 
    logRoute('Create Invoice from Quote'), 
    sanitizeAll,
    validate('createInvoiceFromQuote'),
    requireBothPipedriveAndXero, 
    xeroController.createInvoiceFromQuote
);

// API to create partial invoice from quote (requires both Pipedrive and Xero auth)
router.post('/api/xero/create-partial-invoice-from-quote', 
    logRoute('Create Partial Invoice from Quote'), 
    sanitizeAll,
    validate('createPartialInvoiceFromQuote'),
    requireBothPipedriveAndXero, 
    xeroController.createPartialInvoiceFromQuote
);

export default router;
