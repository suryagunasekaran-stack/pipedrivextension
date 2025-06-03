// Centralized error handling middleware
import logger from '../lib/logger.js';

// Async error wrapper for route handlers
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Centralized error handling middleware
export const errorHandler = (err, req, res, next) => {
    // Prepare context data with potential sensitive information
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
            'authorization': req.get('Authorization'), // Will be redacted by pino
            'x-forwarded-for': req.get('X-Forwarded-For'),
            'cookie': req.get('Cookie') // Will be redacted by pino
        },
        // Additional sensitive fields that might be in the error
        accessToken: err.accessToken, // Will be redacted
        apiKey: err.apiKey, // Will be redacted
        token: err.token // Will be redacted
    };

    // Log the error with full context - pino redaction will handle sensitive data
    req.log.error(err, errorContext, 'Unhandled error occurred');

    // Determine error status code
    let statusCode = err.statusCode || err.status || 500;
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
    } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
        statusCode = 401;
    } else if (err.name === 'CastError') {
        statusCode = 400;
    }

    // Prepare error response
    const errorResponse = {
        error: true,
        message: statusCode === 500 ? 'Internal server error' : err.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
    };

    // Add stack trace only in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = err.stack;
        errorResponse.details = err.details || null;
    }

    // Log the response being sent
    req.log.warn('Error response sent', {
        statusCode,
        errorMessage: errorResponse.message,
        requestId: req.id
    });

    res.status(statusCode).json(errorResponse);
};

// 404 handler for unmatched routes
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
