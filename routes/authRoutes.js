/**
 * Authentication Routes
 * 
 * Handles OAuth authentication flows for both Pipedrive and Xero integrations.
 * This module defines routes for initiating OAuth flows and handling callbacks
 * for external service authentication.
 * 
 * Routes:
 * - GET / - Initiate Pipedrive OAuth authentication
 * - GET /callback - Handle Pipedrive OAuth callback
 * - GET /connect-xero - Initiate Xero OAuth authentication  
 * - GET /xero-callback - Handle Xero OAuth callback
 * 
 * @module routes/authRoutes
 */

import express from 'express';
import * as authController from '../controllers/authController.js';

const router = express.Router();

// Pipedrive OAuth Routes
router.get('/', authController.initiatePipedriveAuth);
router.get('/callback', authController.handlePipedriveCallback);

// Xero OAuth Routes
router.get('/connect-xero', authController.initiateXeroAuth);
router.get('/xero-callback', authController.handleXeroCallback);

export default router;
