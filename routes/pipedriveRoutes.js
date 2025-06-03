/**
 * Pipedrive Integration Routes
 * 
 * Handles all Pipedrive-related API endpoints including deal management,
 * project creation, and data retrieval. This module provides the REST API
 * interface for Pipedrive operations and webhook handling.
 * 
 * Routes:
 * - GET /pipedrive-action - Handle Pipedrive app extension actions
 * - GET /api/pipedrive-data - Retrieve Pipedrive data for frontend
 * - POST /api/pipedrive/create-project - Create project from Pipedrive deal
 * 
 * @module routes/pipedriveRoutes
 */

import express from 'express';
import { getPipedriveData, createProject, handlePipedriveAction } from '../controllers/pipedriveController.js';

const router = express.Router();

// Pipedrive Action URL (from App Extensions)
router.get('/pipedrive-action', handlePipedriveAction);

// API to get Pipedrive data for frontend
router.get('/api/pipedrive-data', getPipedriveData);

// Route to handle the Pipedrive action for creating a project
router.post('/api/pipedrive/create-project', createProject);

export default router;
