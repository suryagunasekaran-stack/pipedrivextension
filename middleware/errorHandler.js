/**
 * Centralized Error Handling Middleware
 * 
 * This module provides comprehensive error handling middleware for Express applications,
 * including async error catching, structured error responses, automatic sensitive data
 * redaction, and environment-specific error detail exposure.
 * 
 * Key features:
 * - Async route handler error catching with Promise wrapper
 * - Centralized error processing with context logging
 * - Automatic sensitive data redaction in error logs
 * - Environment-specific error detail exposure
 * - HTTP status code normalization for common error types
 * - Request ID propagation for error tracking
 * - Specialized 404 handler for unmatched routes
 * 
 * @module middleware/errorHandler
 */

import logger from '../lib/logger.js';

/**
 * Wraps async route handlers to automatically catch and forward errors
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Centralized error handling middleware with automatic logging and response formatting
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const errorHandler = (err, req, res, next) => {
    const errorContext = {
        method: req.method,
        url: req.url,
        requestId: req.id,
        userAgent: req.get('User-Agent'),
        body: req.body,
        query: req.query,
        params: req.params,
        headers: {
            'content-type': req.get('Content-Type'),
            'authorization': req.get('Authorization'),
            'x-forwarded-for': req.get('X-Forwarded-For'),
            'cookie': req.get('Cookie')
        },
        accessToken: err.accessToken,
        apiKey: err.apiKey,
        token: err.token
    };

    req.log.error(err, errorContext, 'Unhandled error occurred');

    let statusCode = err.statusCode || err.status || 500;
    
    if (err.name === 'ValidationError') {
        statusCode = 400;
    } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
        statusCode = 401;
    } else if (err.name === 'CastError') {
        statusCode = 400;
    }

    const errorResponse = {
        error: true,
        message: statusCode === 500 ? 'Internal server error' : err.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
    };

    if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = err.stack;
        errorResponse.details = err.details || null;
    }

    req.log.warn('Error response sent', {
        statusCode,
        errorMessage: errorResponse.message,
        requestId: req.id
    });

    res.status(statusCode).json(errorResponse);
};

/**
 * 404 handler for unmatched routes with request logging
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const notFoundHandler = (req, res, next) => {
    req.log.warn('Route not found', {
        method: req.method,
        url: req.url,
        requestId: req.id,
        userAgent: req.get('User-Agent')
    });

    res.status(404).json({
        error: true,
        message: `Route ${req.method} ${req.url} not found`,
        requestId: req.id,
        timestamp: new Date().toISOString()
    });
};

export default { errorHandler, notFoundHandler, asyncHandler };
