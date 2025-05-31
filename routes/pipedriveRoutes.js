import express from 'express';
const router = express.Router();
import * as pipedriveController from '../controllers/pipedriveController.js'; // Added .js and changed import style

// Pipedrive Action URL (from App Extensions)
router.get('/pipedrive-action', pipedriveController.handlePipedriveAction);

// API to get Pipedrive data for frontend
router.get('/api/pipedrive-data', pipedriveController.getPipedriveData);

export default router; // Changed to export default
