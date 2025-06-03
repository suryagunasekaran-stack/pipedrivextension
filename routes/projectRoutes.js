/**
 * Project Management Routes
 * 
 * Handles project creation and management operations including deal linking,
 * project number generation, and full project creation workflows. This module
 * provides endpoints for complex project operations that span multiple services.
 * 
 * Routes:
 * - POST /api/project/create-full - Create complete project with deal linking (requires Pipedrive auth)
 * 
 * @module routes/projectRoutes
 */

import express from 'express';
import { createFullProject } from '../controllers/projectController.js';
import { requirePipedriveWithOptionalXero } from '../middleware/authMiddleware.js';

const router = express.Router();

// Route for creating a full project with deal linking and project number generation
// Requires Pipedrive authentication, Xero is optional
router.post('/api/project/create-full', requirePipedriveWithOptionalXero, createFullProject);

export default router;
