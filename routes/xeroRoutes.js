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

const router = express.Router();

// API to check Xero connection status
router.get('/api/xero/status', xeroController.getXeroStatus);

// API to create Xero Quote
router.post('/api/xero/create-quote', xeroController.createXeroQuote);

// API to accept a Xero Quote
router.put('/api/xero/accept-quote/:quoteId', xeroController.acceptXeroQuote);

// API to create a Xero Project
router.post('/api/xero/create-project', xeroController.createXeroProject);

export default router;
