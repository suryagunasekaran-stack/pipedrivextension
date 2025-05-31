import express from 'express';
const router = express.Router();
import * as authController from '../controllers/authController.js'; // Added .js and changed import style

// Pipedrive OAuth Routes
router.get('/', authController.initiatePipedriveAuth);
router.get('/callback', authController.handlePipedriveCallback);

// Xero OAuth Routes
router.get('/connect-xero', authController.initiateXeroAuth);
router.get('/xero-callback', authController.handleXeroCallback);

export default router; // Changed to export default
