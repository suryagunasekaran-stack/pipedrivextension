import express from 'express';
const router = express.Router();
import * as xeroController from '../controllers/xeroController.js'; // Added .js and changed import style

// API to check Xero connection status
router.get('/api/xero/status', xeroController.getXeroStatus);

// API to create Xero Quote
router.post('/api/xero/create-quote', xeroController.createXeroQuote);

// API to accept a Xero Quote
router.put('/api/xero/accept-quote/:quoteId', xeroController.acceptXeroQuote);

// API to create a Xero Project
router.post('/api/xero/create-project', xeroController.createXeroProject);

export default router; // Changed to export default
