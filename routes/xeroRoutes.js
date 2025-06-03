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
 * 
 * @module routes/xeroRoutes
 */

import express from 'express';
import * as xeroController from '../controllers/xeroController.js';
import { requirePipedriveWithOptionalXero, optionalXeroAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// API to check Xero connection status (no auth required, just checks status)
router.get('/api/xero/status', xeroController.getXeroStatus);

// API to create Xero Quote (requires both Pipedrive and Xero auth)
router.post('/api/xero/create-quote', requirePipedriveWithOptionalXero, xeroController.createXeroQuote);

// API to accept a Xero Quote (requires Xero auth)
router.put('/api/xero/accept-quote/:quoteId', optionalXeroAuth, xeroController.acceptXeroQuote);

// API to create a Xero Project (requires Xero auth)
router.post('/api/xero/create-project', optionalXeroAuth, xeroController.createXeroProject);

export default router;
