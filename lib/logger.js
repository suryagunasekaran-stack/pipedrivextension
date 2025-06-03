import pino from 'pino';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

// Configure Pino logger
const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  // Redact sensitive fields across all environments
  redact: {
    paths: [
      // Request headers that might contain sensitive data
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["x-auth-token"]',
      'req.headers["x-access-token"]',
      
      // Request body fields that might contain sensitive data
      'req.body.password',
      'req.body.token',
      'req.body.secret',
      'req.body.apiKey',
      'req.body.accessToken',
      'req.body.refreshToken',
      'req.body.clientSecret',
      
      // Response headers that might contain sensitive data
      'res.headers["set-cookie"]',
      'res.headers.authorization',
      
      // Custom context fields that might contain sensitive data
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
    // How to replace redacted values
    censor: '[REDACTED]'
  },
  
  // Pretty print in development, raw JSON in production
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: false,
      // Show more verbose output in development
      includeObject: true
    }
  } : undefined,
  
  // Base fields to include in all log entries
  base: {
    service: 'pipedrive-application',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  },
  
  // Format timestamp for production logs
  timestamp: !isDevelopment ? pino.stdTimeFunctions.isoTime : undefined
});

// Add convenience methods for common patterns
logger.request = (req, message = 'HTTP Request') => {
  return logger.info({
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    requestId: req.id
  }, message);
};

logger.response = (req, res, responseTime, message = 'HTTP Response') => {
  return logger.info({
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    requestId: req.id
  }, message);
};

// Enhanced error logging with redaction awareness
logger.error = (err, context = {}, message = 'Error occurred') => {
  const errorData = {
    error: {
      name: err.name,
      message: err.message,
      stack: isDevelopment ? err.stack : undefined // Only show stack traces in development
    },
    ...context
  };
  
  return logger.error(errorData, message);
};

// Environment-specific debug logging
logger.debugDev = (data, message = 'Debug info') => {
  if (isDevelopment) {
    return logger.debug(data, message);
  }
  // In production, convert debug to trace level (typically not logged)
  return logger.trace(data, message);
};

// Secure logging method that ensures sensitive data is redacted
logger.secure = (data, message, level = 'info') => {
  // This method can be used when you want to ensure data is logged securely
  // The redact configuration will automatically handle sensitive fields
  return logger[level](data, message);
};

// Performance logging with environment-specific detail
logger.performance = (operation, duration, context = {}) => {
  const perfData = {
    operation,
    duration: `${duration}ms`,
    ...context
  };
  
  if (isDevelopment) {
    // More verbose performance logging in development
    return logger.debug(perfData, `Performance: ${operation}`);
  } else {
    // Only log slow operations in production
    if (duration > 1000) { // Only log operations > 1 second
      return logger.info(perfData, `Slow operation: ${operation}`);
    }
  }
};

export default logger;

// Create HTTP middleware using pino-http
export const httpLogger = pinoHttp({
  logger: logger,
  
  // Generate unique request ID
  genReqId: (req, res) => {
    // Check for existing X-Request-ID header, otherwise generate new UUID
    const existingId = req.get('X-Request-ID');
    if (existingId) return existingId;
    
    const requestId = uuidv4();
    res.set('X-Request-ID', requestId);
    return requestId;
  },
  
  // Enhanced serializers with environment-specific detail levels
  serializers: {
    req: (req) => {
      const baseReq = pinoHttp.stdSerializers.req(req);
      
      // In production, limit the headers we log and ensure sensitive data is redacted
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
            // Explicitly redact authorization headers
            'authorization': req.headers.authorization ? '[REDACTED]' : undefined,
            'cookie': req.headers.cookie ? '[REDACTED]' : undefined
          },
          // Limit body logging in production for security
          body: req.body ? '[BODY_PRESENT]' : undefined
        };
      }
      
      // In development, show more details but still redact sensitive fields
      return {
        ...baseReq,
        body: req.body, // Will be automatically redacted by pino redact config
        query: req.query,
        params: req.params
      };
    },
    
    res: pinoHttp.stdSerializers.res,
    err: pinoHttp.stdSerializers.err
  },
  
  // Custom success message with environment-specific verbosity
  customSuccessMessage: (req, res, responseTime) => {
    if (isDevelopment) {
      return `${req.method} ${req.url} - ${res.statusCode} - ${responseTime}ms`;
    }
    // More concise in production
    return `${req.method} ${req.url.split('?')[0]} - ${res.statusCode}`;
  },
  
  // Custom error message
  customErrorMessage: (req, res, error) => {
    return `${req.method} ${req.url} - ${res.statusCode} - ${error.message}`;
  },
  
  // Environment-aware log levels
  customLogLevel: (req, res, error) => {
    // In development, be more verbose
    if (isDevelopment) {
      if (res.statusCode >= 400 && res.statusCode < 500) {
        return 'warn';
      } else if (res.statusCode >= 500 || error) {
        return 'error';
      }
      return 'info';
    }
    
    // In production, reduce noise
    if (res.statusCode >= 500 || error) {
      return 'error';
    } else if (res.statusCode >= 400) {
      return 'warn';
    } else if (res.statusCode >= 300) {
      return 'debug'; // Redirects as debug in production
    }
    return 'info';
  },
  
  // Environment-specific route filtering
  autoLogging: {
    ignore: (req) => {
      // Always skip ping endpoint
      if (req.url === '/ping') return true;
      
      // In production, skip health checks and other monitoring endpoints
      if (!isDevelopment) {
        return ['/health', '/metrics', '/status'].includes(req.url);
      }
      
      return false;
    }
  }
});
