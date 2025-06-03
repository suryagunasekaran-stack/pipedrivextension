/**
 * Authentication Routes
 * 
 * Handles OAuth authentication flows for both Pipedrive and Xero integrations.
 * This module defines routes for initiating OAuth flows and handling callbacks
 * for external service authentication.
 * 
 * Routes (mounted under /auth):
 * - GET /auth/ - Initiate Pipedrive OAuth authentication (redirects to frontend)
 * - GET /auth/callback - Handle Pipedrive OAuth callback
 * - GET /auth/auth-url - Get Pipedrive OAuth URL for frontend
 * - GET /auth/status - Check authentication status for a company
 * - POST /auth/logout - Clear authentication tokens for a company
 * - GET /auth/connect-xero - Initiate Xero OAuth authentication  
 * - GET /auth/xero-callback - Handle Xero OAuth callback
 * 
 * @module routes/authRoutes
 */

import express from 'express';
import * as authController from '../controllers/authController.js';
import { checkAuthRequirements } from '../middleware/authMiddleware.js';

const router = express.Router();

// Pipedrive OAuth Routes
router.get('/', authController.initiatePipedriveAuth);
router.get('/callback', authController.handlePipedriveCallback);
router.get('/auth-url', authController.getPipedriveAuthUrl);
router.post('/auth-url', authController.getPipedriveAuthUrl); // Support POST for frontend

// Authentication Status and Management
router.get('/status', authController.checkAuthStatus);
router.post('/status', authController.checkAuthStatus); // Support POST calls for status

router.get('/check-auth', authController.checkAuthStatus); // Alias for frontend compatibility
router.post('/check-auth', authController.checkAuthStatus); // Support POST calls from frontend

router.get('/checkAuth', authController.checkAuthStatus); // Alias for camelCase frontend call
router.post('/checkAuth', authController.checkAuthStatus);

router.get('/requirements', checkAuthRequirements);
router.post('/requirements', checkAuthRequirements); // Support POST for requirements
router.post('/logout', authController.logout);

// Xero OAuth Routes
router.get('/connect-xero', authController.initiateXeroAuth);
router.get('/xero-callback', authController.handleXeroCallback);

export default router;
