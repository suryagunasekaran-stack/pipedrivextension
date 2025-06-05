/**
 * Route Logging Middleware
 * 
 * This middleware provides consistent route-level logging across all endpoints.
 * It logs route entry, tracks request processing, and handles success/error outcomes.
 * 
 * Key features:
 * - Consistent route entry logging with operation names
 * - Input data logging (body, query, params)
 * - Automatic success/error logging with results
 * - Request duration tracking
 * - Error context preservation
 * - Clean, structured log output
 * 
 * @module middleware/routeLogger
 */

import logger from '../lib/logger.js';

/**
 * Safely serializes data for logging, handling circular references and functions
 * 
 * @param {any} data - Data to serialize
 * @param {number} maxDepth - Maximum depth for object traversal
 * @returns {any} Serializable data
 */
const safeSerialize = (data, maxDepth = 3) => {
  if (maxDepth <= 0) return '[MAX_DEPTH]';
  
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'function') return '[FUNCTION]';
  
  if (typeof data !== 'object') return data;
  
  if (data instanceof Date) return data.toISOString();
  
  if (Array.isArray(data)) {
    return data.slice(0, 10).map(item => safeSerialize(item, maxDepth - 1));
  }
  
  const result = {};
  const keys = Object.keys(data).slice(0, 20); // Limit keys to prevent huge logs
  
  for (const key of keys) {
    try {
      result[key] = safeSerialize(data[key], maxDepth - 1);
    } catch (error) {
      result[key] = '[SERIALIZE_ERROR]';
    }
  }
  
  return result;
};

/**
 * Extracts relevant input data from request
 * 
 * @param {Object} req - Express request object
 * @returns {Object} Input data summary
 */
const getInputData = (req) => {
  const input = {};
  
  try {
    // Query parameters
    if (req.query && Object.keys(req.query).length > 0) {
      input.query = safeSerialize(req.query);
    }
    
    // Route parameters
    if (req.params && Object.keys(req.params).length > 0) {
      input.params = safeSerialize(req.params);
    }
    
    // Body data (limit size for logging)
    if (req.body && Object.keys(req.body).length > 0) {
      input.body = safeSerialize(req.body);
    }
    
    // Headers (only relevant ones)
    const relevantHeaders = {};
    const headerKeys = ['content-type', 'user-agent', 'authorization'];
    headerKeys.forEach(key => {
      if (req.headers && req.headers[key]) {
        relevantHeaders[key] = key === 'authorization' ? '[REDACTED]' : req.headers[key];
      }
    });
    if (Object.keys(relevantHeaders).length > 0) {
      input.headers = relevantHeaders;
    }
  } catch (error) {
    input.error = 'Failed to extract input data';
  }
  
  return Object.keys(input).length > 0 ? input : { message: 'No input data' };
};

/**
 * Creates a route logging middleware for specific operations
 * 
 * @param {string} operationName - Name of the operation being performed
 * @returns {Function} Express middleware function
 */
export const logRoute = (operationName) => {
  return (req, res, next) => {
    try {
      // Get input data
      const inputData = getInputData(req);
      
      // Log route entry with input data
      logger.info({
        operation: operationName,
        method: req.method,
        path: req.route?.path || req.url,
        requestId: req.id,
        input: inputData,
        timestamp: new Date().toISOString()
      }, `🚀 ${operationName}`);
      
      // Store start time for duration calculation
      req.startTime = Date.now();
      req.operationName = operationName;
      
      // Store original json method to capture response data
      const originalJson = res.json;
      let responseData = null;
      
      res.json = function(data) {
        try {
          responseData = safeSerialize(data, 2); // Limit depth for response logging
        } catch (error) {
          responseData = { error: 'Failed to serialize response' };
        }
        return originalJson.call(this, data);
      };
      
      // Store original end method to log completion
      const originalEnd = res.end;
      res.end = function(...args) {
        try {
          const duration = Date.now() - req.startTime;
          
          const logData = {
            operation: operationName,
            method: req.method,
            path: req.route?.path || req.url,
            requestId: req.id,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString()
          };
          
          // Add response data if available
          if (responseData) {
            logData.response = responseData;
          }
          
          if (res.statusCode >= 400) {
            logger.warn(logData, `⚠️ ${operationName} completed with error`);
          } else {
            logger.info(logData, `✅ ${operationName} completed`);
          }
        } catch (error) {
          logger.error({ error: error.message }, `❌ Failed to log completion for ${operationName}`);
        }
        
        originalEnd.apply(this, args);
      };
      
      next();
    } catch (error) {
      logger.error({ error: error.message, operation: operationName }, `❌ Failed to setup route logging for ${operationName}`);
      next();
    }
  };
};

/**
 * Error logging middleware that works with route logger
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const logRouteError = (err, req, res, next) => {
  try {
    const operationName = req.operationName || 'Unknown operation';
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    
    const inputData = getInputData(req);
    
    logger.error({
      operation: operationName,
      error: err.message,
      method: req.method,
      path: req.route?.path || req.url,
      requestId: req.id,
      input: inputData,
      duration: `${duration}ms`,
      statusCode: err.statusCode || 500,
      timestamp: new Date().toISOString(),
      stack: err.stack
    }, `❌ ${operationName} failed: ${err.message}`);
  } catch (logError) {
    console.error('Failed to log route error:', logError);
  }
  
  next(err);
};

/**
 * Success logging helper for controllers with detailed data
 * 
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 * @param {Object} [data={}] - Additional data to log
 */
export const logSuccess = (req, message, data = {}) => {
  try {
    const operationName = req.operationName || 'Unknown operation';
    logger.info({
      operation: operationName,
      method: req.method,
      path: req.route?.path || req.url,
      requestId: req.id,
      ...safeSerialize(data, 2),
      timestamp: new Date().toISOString()
    }, `✅ ${operationName} - ${message}`);
  } catch (error) {
    console.error('Failed to log success:', error);
  }
};

/**
 * Warning logging helper for controllers
 * 
 * @param {Object} req - Express request object
 * @param {string} message - Warning message
 * @param {Object} [data={}] - Additional data to log
 */
export const logWarning = (req, message, data = {}) => {
  try {
    logger.warn({
      method: req.method,
      path: req.route?.path || req.url,
      requestId: req.id,
      ...safeSerialize(data, 2),
      timestamp: new Date().toISOString()
    }, `⚠️ ${message}`);
  } catch (error) {
    console.error('Failed to log warning:', error);
  }
};

/**
 * Info logging helper for controllers with processing details
 * 
 * @param {Object} req - Express request object
 * @param {string} message - Info message
 * @param {Object} [data={}] - Additional data to log
 */
export const logInfo = (req, message, data = {}) => {
  try {
    const operationName = req.operationName || 'Unknown operation';
    logger.info({
      operation: operationName,
      method: req.method,
      path: req.route?.path || req.url,
      requestId: req.id,
      ...safeSerialize(data, 2),
      timestamp: new Date().toISOString()
    }, `📝 ${operationName} - ${message}`);
  } catch (error) {
    console.error('Failed to log info:', error);
  }
};

/**
 * Logs data processing steps within controllers
 * 
 * @param {Object} req - Express request object
 * @param {string} step - Processing step name
 * @param {Object} [data={}] - Data being processed
 */
export const logProcessing = (req, step, data = {}) => {
  try {
    const operationName = req.operationName || 'Unknown operation';
    logger.info({
      operation: operationName,
      step,
      method: req.method,
      path: req.route?.path || req.url,
      requestId: req.id,
      data: safeSerialize(data, 2),
      timestamp: new Date().toISOString()
    }, `🔄 ${operationName} - ${step}`);
  } catch (error) {
    console.error('Failed to log processing step:', error);
  }
};

export default { logRoute, logRouteError, logSuccess, logWarning, logInfo, logProcessing }; 