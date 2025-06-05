/**
 * Centralized Logging Service
 * 
 * This module provides a comprehensive logging solution using Pino for high-performance
 * structured logging. Focuses on clean, structured logs with essential information only.
 * 
 * Key features:
 * - Clean, minimal log output focused on essential information
 * - Automatic redaction of sensitive data (tokens, passwords, API keys)
 * - Environment-specific log levels and formatting
 * - HTTP request/response middleware with unique request IDs
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
 * Main application logger with clean, minimal output
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
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
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname,service,environment,version',
      singleLine: true,
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

export default logger;

/**
 * HTTP middleware logger with clean, minimal output
 */
export const httpLogger = pinoHttp({
  logger: logger,
  
  genReqId: (req, res) => {
    const existingId = req.get('X-Request-ID');
    if (existingId) return existingId;
    
    const requestId = uuidv4();
    res.set('X-Request-ID', requestId);
    return requestId;
  },
  
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url.split('?')[0], // Remove query params for cleaner logs
      userAgent: req.headers['user-agent']?.split(' ')[0] || 'Unknown', // Just browser name
      ip: req.ip || req.connection.remoteAddress
    }),
    
    res: (res) => ({
      statusCode: res.statusCode
    }),
    
    err: pinoHttp.stdSerializers.err
  },
  
  customSuccessMessage: (req, res, responseTime) => {
    if (res.statusCode >= 400) {
      return `${req.method} ${req.url.split('?')[0]} → ${res.statusCode} (${responseTime}ms)`;
    }
    return `${req.method} ${req.url.split('?')[0]} → ${res.statusCode} (${responseTime}ms)`;
  },
  
  customErrorMessage: (req, res, error) => {
    return `${req.method} ${req.url.split('?')[0]} → ${res.statusCode} - ${error.message}`;
  },
  
  customLogLevel: (req, res, error) => {
    if (res.statusCode >= 500 || error) {
      return 'error';
    } else if (res.statusCode >= 400) {
      return 'warn';
    }
    return 'info';
  },
  
  autoLogging: {
    ignore: (req) => {
      // Skip logging for health check and monitoring endpoints
      const skipPaths = ['/health', '/ping', '/metrics', '/status'];
      return skipPaths.includes(req.url);
    }
  }
});
