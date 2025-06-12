import 'dotenv/config'; // Changed from require('dotenv').config()
import express, { json } from 'express';
import cors from 'cors';
import logger, { httpLogger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logRouteError, logRoute, logProcessing, logSuccess } from './middleware/routeLogger.js';

// Import route files
import authRoutes from './routes/authRoutes.js'; // Added .js
import pipedriveRoutes from './routes/pipedriveRoutes.js'; // Added .js
import xeroRoutes from './routes/xeroRoutes.js'; // Added .js
import projectRoutes from './routes/projectRoutes.js'; // Added .js


const app = express();

// Enable CORS - configure appropriately for production
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            process.env.FRONTEND_BASE_URL || 'http://localhost:3001',
            ...(process.env.NODE_ENV === 'development' ? [
                'http://localhost:3001', // Next.js dev server
                'http://localhost:3000', // This server
            ] : [])
        ];
        
        // In development, be more permissive for Next.js internal requests
        if (process.env.NODE_ENV !== 'production') {
            if (origin.includes('localhost')) {
                return callback(null, true);
            }
        }
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Allow cookies and credentials
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // Allow all common HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'], // Allow common headers
    optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Add HTTP logging middleware (must be before other middleware) - TEMPORARILY DISABLED
// app.use(httpLogger);

app.use(json()); // Add this line to parse JSON request bodies

const port = process.env.PORT || 3000;

// Health check endpoint with clean logging
app.get('/health', (req, res) => {
    const healthStatus = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requestId: req.id
    };
    
    res.status(200).json(healthStatus);
});

// System status endpoint
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'running', 
        requestId: req.id,
        timestamp: new Date().toISOString() 
    });
});

// Test endpoint to demonstrate enhanced logging
app.get('/api/test-logging', 
    logRoute('Test Enhanced Logging'),
    (req, res) => {
        logProcessing(req, 'Processing test request', {
            queryParams: req.query,
            headers: {
                userAgent: req.get('User-Agent'),
                contentType: req.get('Content-Type')
            }
        });
        
        logProcessing(req, 'Generating test response', {
            responseType: 'json',
            includeTimestamp: true
        });
        
        const responseData = {
            message: 'Test endpoint working successfully!',
            requestId: req.id,
            timestamp: new Date().toISOString(),
            receivedQuery: req.query,
            serverInfo: {
                nodeVersion: process.version,
                platform: process.platform,
                uptime: process.uptime()
            }
        };
        
        logSuccess(req, 'Test request completed successfully', {
            responseSize: JSON.stringify(responseData).length,
            queryParamsCount: Object.keys(req.query).length
        });
        
        res.json(responseData);
    }
);

// Basic test endpoint (no middleware)
app.get('/basic-test', (req, res) => {
    res.json({ 
        message: 'Basic server is working!', 
        timestamp: new Date().toISOString(),
        query: req.query
    });
});

// Simple test endpoint to demonstrate enhanced logging (no dependencies)
app.get('/api/test-simple', 
    logRoute('Simple Test'),
    (req, res) => {
        logProcessing(req, 'Processing simple test', {
            hasQuery: Object.keys(req.query).length > 0,
            timestamp: new Date().toISOString()
        });
        
        const result = {
            message: 'Enhanced logging is working!',
            requestId: req.id,
            query: req.query,
            timestamp: new Date().toISOString()
        };
        
        logSuccess(req, 'Simple test completed', {
            queryParams: Object.keys(req.query).length,
            responseSize: JSON.stringify(result).length
        });
        
        res.json(result);
    }
);

// Use the imported routes
app.use('/auth', authRoutes); // Mount auth routes under /auth prefix
app.use('/', pipedriveRoutes); // Mount Pipedrive routes (includes /pipedrive-action and /api/pipedrive-data)
app.use('/', xeroRoutes); // Mount Xero routes (includes /api/xero/status and /api/xero/create-quote)
app.use('/', projectRoutes); // Mount project routes (includes /api/project/create-full)
// Temporarily comment out database routes that might be causing issues
// app.use('/api/database', databaseRoutes); // Mount database administration routes

// Error handling middleware (must be after all routes)
app.use(logRouteError); // Log route errors with context
app.use(notFoundHandler); // Handle 404s
app.use(errorHandler); // Handle all other errors


// --- Start Server and Load Tokens ---
async function startServer() {
    try {
        app.listen(port, () => {
            logger.info({
                port,
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                url: `http://localhost:${port}`
            }, `🔧 Server started on port ${port}`);
        });
    } catch (error) {
        logger.error({
            error: error.message,
            operation: 'Server startup'
        }, `❌ Server startup failed: ${error.message}`);
        process.exit(1);
    }
}

startServer();
