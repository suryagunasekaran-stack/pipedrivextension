// Example showing how to use the logger in your existing routes
import express from 'express';
import logger from '../lib/logger.js';

const router = express.Router();

// Example 1: Basic logging in route handlers
router.get('/api/example', (req, res) => {
    // Use req.log (provided by pino-http middleware) for request-scoped logging
    req.log.info('Processing example request', { 
        userId: req.body.userId,
        action: 'example' 
    });
    
    try {
        // Your business logic here
        const result = { message: 'Success', requestId: req.id };
        
        req.log.info('Example request completed successfully', { 
            result: result.message 
        });
        
        res.json(result);
    } catch (error) {
        req.log.error(error, { action: 'example' }, 'Example request failed');
        res.status(500).json({ error: 'Internal server error', requestId: req.id });
    }
});

// Example 2: Logging with additional context
router.post('/api/create-project', async (req, res) => {
    const { projectName, clientId } = req.body;
    
    req.log.info('Creating new project', { 
        projectName, 
        clientId,
        userAgent: req.get('User-Agent')
    });
    
    try {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const projectId = `proj_${Date.now()}`;
        
        req.log.info('Project created successfully', { 
            projectId, 
            projectName,
            duration: '100ms'
        });
        
        res.status(201).json({ 
            success: true, 
            projectId, 
            requestId: req.id 
        });
        
    } catch (error) {
        req.log.error(error, { 
            projectName, 
            clientId 
        }, 'Failed to create project');
        
        res.status(500).json({ 
            error: 'Failed to create project', 
            requestId: req.id 
        });
    }
});

// Example 3: Using the standalone logger (not request-scoped)
router.get('/api/system-status', (req, res) => {
    // Use standalone logger for system-level events
    logger.info('System status check requested', { 
        endpoint: '/api/system-status',
        timestamp: new Date().toISOString()
    });
    
    const status = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    };
    
    // Still use req.log for request-specific logging
    req.log.debug('System status retrieved', { uptime: status.uptime });
    
    res.json(status);
});

// Example 4: Error handling middleware
router.use((error, req, res, next) => {
    // Log unhandled errors with full context
    req.log.error(error, {
        url: req.url,
        method: req.method,
        body: req.body,
        query: req.query,
        userAgent: req.get('User-Agent')
    }, 'Unhandled error in route');
    
    res.status(500).json({
        error: 'Something went wrong',
        requestId: req.id,
        timestamp: new Date().toISOString()
    });
});

export default router;
