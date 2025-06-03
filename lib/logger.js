/**
 * Centralized Logging Service
 * 
 * This module provides a comprehensive logging solution using Pino for high-performance
 * structured logging. It includes automatic redaction of sensitive data, environment-specific
 * configurations, HTTP request/response logging, and specialized logging methods for different
 * use cases.
 * 
 * Key features:
 * - Automatic redaction of sensitive data (tokens, passwords, API keys)
 * - Environment-specific log levels and formatting
 * - HTTP request/response middleware with unique request IDs
 * - Performance logging with configurable thresholds
 * - Enhanced error logging with stack trace management
 * - Request ID generation and propagation
 * 
 * @module lib/logger
 */

import pino from 'pino';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Main application logger with automatic sensitive data redaction
 */
const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["x-auth-token"]',
      'req.headers["x-access-token"]',
      'req.body.password',
      'req.body.token',
      'req.body.secret',
      'req.body.apiKey',
      'req.body.accessToken',
      'req.body.refreshToken',
      'req.body.clientSecret',
      'res.headers["set-cookie"]',
      'res.headers.authorization',
      'password',
      'token',
      'secret',
      'apiKey',
      'accessToken',
      'refreshToken',
      'clientSecret',
      'authToken',
      'sessionId'
    ],
    censor: '[REDACTED]'
  },
  
  transport: isDevelopment ? {
        target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: false,
      includeObject: true
    }
  } : undefined,
  
  base: {
    service: 'pipedrive-application',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  },
  
  timestamp: !isDevelopment ? pino.stdTimeFunctions.isoTime : undefined
});

/**
 * Logs HTTP request details with request tracking
 * 
 * @param {Object} req - Express request object
 * @param {string} [message='HTTP Request'] - Log message
 * @returns {Object} Log entry
 */
logger.request = (req, message = 'HTTP Request') => {
  return logger.info({
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    requestId: req.id
  }, message);
};

/**
 * Logs HTTP response details with timing information
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} responseTime - Response time in milliseconds
 * @param {string} [message='HTTP Response'] - Log message
 * @returns {Object} Log entry
 */
logger.response = (req, res, responseTime, message = 'HTTP Response') => {
  return logger.info({
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    requestId: req.id
  }, message);
};

/**
 * Enhanced error logging with stack trace management
 * 
 * @param {Error} err - Error object to log
 * @param {Object} [context={}] - Additional context data
 * @param {string} [message='Error occurred'] - Log message
 * @returns {Object} Log entry
 */
logger.error = (err, context = {}, message = 'Error occurred') => {
  const errorData = {
    error: {
      name: err.name,
      message: err.message,
      stack: isDevelopment ? err.stack : undefined
    },
    ...context
  };
  
  return logger.error(errorData, message);
};

/**
 * Development-only debug logging that converts to trace in production
 * 
 * @param {Object} data - Data to log
 * @param {string} [message='Debug info'] - Log message
 * @returns {Object} Log entry
 */
logger.debugDev = (data, message = 'Debug info') => {
  if (isDevelopment) {
    return logger.debug(data, message);
  }
  return logger.trace(data, message);
};

/**
 * Secure logging method with automatic sensitive data redaction
 * 
 * @param {Object} data - Data to log
 * @param {string} message - Log message
 * @param {string} [level='info'] - Log level
 * @returns {Object} Log entry
 */
logger.secure = (data, message, level = 'info') => {
  return logger[level](data, message);
};

/**
 * Performance logging with environment-specific thresholds
 * 
 * @param {string} operation - Operation name
 * @param {number} duration - Duration in milliseconds
 * @param {Object} [context={}] - Additional context data
 * @returns {Object|undefined} Log entry or undefined if not logged
 */
logger.performance = (operation, duration, context = {}) => {
  const perfData = {
    operation,
    duration: `${duration}ms`,
    ...context
  };
  
  if (isDevelopment) {
    return logger.debug(perfData, `Performance: ${operation}`);
  } else {
    if (duration > 1000) {
      return logger.info(perfData, `Slow operation: ${operation}`);
    }
  }
};

export default logger;

/**
 * HTTP middleware logger with request ID generation and environment-specific serialization
 */
export const httpLogger = pinoHttp({
  logger: logger,
  
  /**
   * Generates unique request IDs with header propagation
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {string} Request ID
   */
  genReqId: (req, res) => {
    const existingId = req.get('X-Request-ID');
    if (existingId) return existingId;
    
    const requestId = uuidv4();
    res.set('X-Request-ID', requestId);
    return requestId;
  },
  
  serializers: {
    req: (req) => {
      const baseReq = pinoHttp.stdSerializers.req(req);
      
      if (!isDevelopment) {
        return {
          ...baseReq,
          headers: {
            'host': req.headers.host,
            'user-agent': req.headers['user-agent'],
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length'],
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-request-id': req.headers['x-request-id'],
            'authorization': req.headers.authorization ? '[REDACTED]' : undefined,
            'cookie': req.headers.cookie ? '[REDACTED]' : undefined
          },
          body: req.body ? '[BODY_PRESENT]' : undefined
        };
      }
      
      return {
        ...baseReq,
        body: req.body,
        query: req.query,
        params: req.params
      };
    },
    
    res: pinoHttp.stdSerializers.res,
    err: pinoHttp.stdSerializers.err
  },
  
  customSuccessMessage: (req, res, responseTime) => {
    if (isDevelopment) {
      return `${req.method} ${req.url} - ${res.statusCode} - ${responseTime}ms`;
    }
    return `${req.method} ${req.url.split('?')[0]} - ${res.statusCode}`;
  },
  
  customErrorMessage: (req, res, error) => {
    return `${req.method} ${req.url} - ${res.statusCode} - ${error.message}`;
  },
  
  customLogLevel: (req, res, error) => {
    if (isDevelopment) {
      if (res.statusCode >= 400 && res.statusCode < 500) {
        return 'warn';
      } else if (res.statusCode >= 500 || error) {
        return 'error';
      }
      return 'info';
    }
    
    if (res.statusCode >= 500 || error) {
      return 'error';
    } else if (res.statusCode >= 400) {
      return 'warn';
    } else if (res.statusCode >= 300) {
      return 'debug';
    }
    return 'info';
  },
  
  autoLogging: {
    ignore: (req) => {
      if (req.url === '/ping') return true;
      
      if (!isDevelopment) {
        return ['/health', '/metrics', '/status'].includes(req.url);
      }
      
      return false;
    }
  }
});
