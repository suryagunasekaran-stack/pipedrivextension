/**
 * Route Logging Examples
 * 
 * This module demonstrates best practices for implementing structured logging
 * in Express.js route handlers using the centralized logger. Examples include
 * request-scoped logging, error handling, performance tracking, and context
 * enrichment patterns.
 * 
 * Key patterns demonstrated:
 * - Request-scoped logging with automatic request ID correlation
 * - Error logging with context preservation and sensitive data redaction
 * - Performance and timing information capture
 * - System-level vs request-level logging distinction
 * - Proper error handling middleware integration
 * - Context enrichment with user agent, client info, and business data
 * 
 * @module examples/route-logging-examples
 */

import express from 'express';
import logger from '../lib/logger.js';

const router = express.Router();

/**
 * Example 1: Basic request-scoped logging with business context
 */
router.get('/api/example', (req, res) => {
    req.log.info('Processing example request', { 
        userId: req.body.userId,
        action: 'example' 
    });
    
    try {
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

/**
 * Example 2: Async operation logging with timing and context enrichment
 */
router.post('/api/create-project', async (req, res) => {    const { projectName, clientId } = req.body;
    
    req.log.info('Creating new project', { 
        projectName, 
        clientId,
        userAgent: req.get('User-Agent')
    });
    
    try {
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

/**
 * Example 3: System-level logging vs request-scoped logging
 */
router.get('/api/system-status', (req, res) => {
    logger.info('System status check requested', { 
        endpoint: '/api/system-status',
        timestamp: new Date().toISOString()
    });
    
    const status = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    };
    
    req.log.debug('System status retrieved', { uptime: status.uptime });
    
    res.json(status);
});

/**
 * Example 4: Comprehensive error handling with context preservation
 */
router.use((error, req, res, next) => {
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
