import 'dotenv/config'; // Changed from require('dotenv').config()
import express, { json } from 'express';
import cors from 'cors';
import { loadAllTokensFromFile, loadAllXeroTokensFromFile } from './services/tokenService.js';
import logger, { httpLogger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Import route files
import authRoutes from './routes/authRoutes.js'; // Added .js
import pipedriveRoutes from './routes/pipedriveRoutes.js'; // Added .js
import xeroRoutes from './routes/xeroRoutes.js'; // Added .js
import projectRoutes from './routes/projectRoutes.js'; // Added .js
import databaseRoutes from './routes/databaseRoutes.js'; // Database administration routes

const app = express();

// Enable CORS - configure appropriately for production
app.use(cors({
    origin: 'http://localhost:3001' // Allow requests from your Next.js app's origin
}));

// Add HTTP logging middleware (must be before other middleware)
app.use(httpLogger);

app.use(json()); // Add this line to parse JSON request bodies

const port = process.env.PORT || 3000;

// Health check endpoint with logging
app.get('/health', (req, res) => {
    req.log.info('Health check requested', {
        userAgent: req.get('User-Agent'),
        remoteAddress: req.ip
    });
    
    const healthStatus = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requestId: req.id
    };
    
    req.log.info('Health check completed', {
        status: healthStatus.status,
        uptime: healthStatus.uptime
    });
    
    res.status(200).json(healthStatus);
});

// Example endpoint showing logger usage in routes
app.get('/api/status', (req, res) => {
    req.log.info('Status endpoint accessed', { 
        userAgent: req.get('User-Agent'),
        requestId: req.id 
    });
    
    res.json({ 
        status: 'running', 
        requestId: req.id,
        timestamp: new Date().toISOString() 
    });
});

// Test endpoint to demonstrate error handling and logging
app.get('/api/test-error', (req, res, next) => {
    req.log.info('Test error endpoint accessed');
    
    // Simulate an error
    const error = new Error('This is a test error for demonstration');
    error.statusCode = 500;
    
    next(error); // Pass error to centralized error handler
});

// Test endpoint to demonstrate sensitive data redaction
app.post('/api/test-redaction', (req, res) => {
    req.log.info('Testing sensitive data redaction', {
        // These will be automatically redacted by pino
        password: 'secret123',
        token: 'bearer-token-12345',
        apiKey: 'api-key-67890',
        userInfo: {
            username: req.body.username || 'testuser',
            // This password will be redacted
            password: req.body.password || 'userpassword123'
        }
    });
    
    // Log with debug level (visible in dev, hidden in prod by default)
    req.log.debug('Debug information with sensitive data', {
        accessToken: 'access-token-abc123',
        refreshToken: 'refresh-token-xyz789',
        sessionDetails: req.body
    });
    
    // Performance logging example
    const startTime = Date.now();
    setTimeout(() => {
        const duration = Date.now() - startTime;
        logger.performance('test-operation', duration, {
            userId: req.body.userId,
            operation: 'redaction-test'
        });
    }, 100);
    
    res.json({
        message: 'Redaction test completed',
        requestId: req.id,
        note: 'Check server logs to see redacted sensitive data'
    });
});

// Use the imported routes
app.use('/', authRoutes); // Mount auth routes at the root
app.use('/', pipedriveRoutes); // Mount Pipedrive routes (includes /pipedrive-action and /api/pipedrive-data)
app.use('/', xeroRoutes); // Mount Xero routes (includes /api/xero/status and /api/xero/create-quote)
app.use('/', projectRoutes); // Mount project routes (includes /api/project/create-full)
app.use('/api/database', databaseRoutes); // Mount database administration routes

// Error handling middleware (must be after all routes)
app.use(notFoundHandler); // Handle 404s
app.use(errorHandler); // Handle all other errors


// --- Start Server and Load Tokens ---
async function startServer() {
    await loadAllTokensFromFile(); // Load Pipedrive tokens
    await loadAllXeroTokensFromFile(); // Load Xero tokens
    
    app.listen(port, () => {
        logger.info(`Server is running on http://localhost:${port}`, {
            port,
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version
        });
    });
}

startServer().catch(error => {
    logger.error(error, {}, 'Failed to start the server');
    process.exit(1);
});
