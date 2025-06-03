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
 * 
 * @module routes/pipedriveRoutes
 */

import express from 'express';
import { getPipedriveData, createProject, handlePipedriveAction } from '../controllers/pipedriveController.js';
import { requirePipedriveAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Pipedrive Action URL (from App Extensions) - requires auth but uses query params
router.get('/pipedrive-action', requirePipedriveAuth, handlePipedriveAction);

// API to get Pipedrive data for frontend - requires auth
router.get('/api/pipedrive-data', requirePipedriveAuth, getPipedriveData);

// Route to handle the Pipedrive action for creating a project - requires auth
router.post('/api/pipedrive/create-project', requirePipedriveAuth, createProject);

export default router;
