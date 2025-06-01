import express from 'express';
const router = express.Router();
// Import specific functions from the controller
import { getPipedriveData, createProject, handlePipedriveAction } from '../controllers/pipedriveController.js';

// Pipedrive Action URL (from App Extensions)
// Use the directly imported function
router.get('/pipedrive-action', handlePipedriveAction);

// API to get Pipedrive data for frontend
// Use the directly imported function
router.get('/api/pipedrive-data', getPipedriveData);

// Route to handle the Pipedrive action for creating a project
router.post('/api/pipedrive/create-project', createProject);

export default router;
