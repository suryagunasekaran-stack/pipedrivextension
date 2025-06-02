import express from 'express';
const router = express.Router();

// Import controller functions
import { createFullProject } from '../controllers/projectController.js';

// Route for creating a full project with deal linking and project number generation
router.post('/api/project/create-full', createFullProject);

export default router;
