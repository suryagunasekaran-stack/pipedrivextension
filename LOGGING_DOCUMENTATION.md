# Comprehensive Structured Logging Documentation

## Overview

This project implements a comprehensive structured logging system using Pino with the following key features:

- **Environment-specific configuration** (pretty-printed in development, JSON in production)
- **Automatic sensitive data redaction** for security compliance
- **Request traceability** with unique UUID request IDs
- **Centralized error handling** with full context logging
- **Performance monitoring** capabilities
- **HTTP middleware integration** for automatic request/response logging

## Architecture

### Core Components

1. **`/lib/logger.js`** - Main logger configuration and setup
2. **`/middleware/errorHandler.js`** - Centralized error handling with logging
3. **HTTP Middleware** - Automatic request/response logging with pino-http
4. **Controller Integration** - Request-scoped logging throughout the application

## Key Features

### 1. Environment-Specific Behavior

#### Development Mode
- Pretty-printed logs with colors and formatting
- Debug level logging enabled
- Full stack traces in error responses
- Verbose request/response details
- Request body and query parameters logged

#### Production Mode
- Structured JSON logs for log aggregation systems
- Info level logging (debug logs filtered out)
- No stack traces in responses (security)
- Reduced verbosity to minimize noise
- Request bodies marked as `[BODY_PRESENT]` for security

### 2. Automatic Sensitive Data Redaction

The logger automatically redacts sensitive fields across all log levels:

```javascript
// Automatically redacted fields:
- req.headers.authorization
- req.headers.cookie
- req.headers["x-api-key"]
- req.body.password
- req.body.token
- req.body.secret
- req.body.apiKey
- password, token, secret, apiKey (any context)
```

**Example:**
```json
{
  "headers": {
    "authorization": "[REDACTED]",
    "cookie": "[REDACTED]"
  },
  "body": {
    "username": "testuser",
    "password": "[REDACTED]"
  }
}
```

### 3. Request Traceability

Every HTTP request gets a unique UUID that follows the request through the entire application:

- **X-Request-ID header** added to responses
- **Request ID** included in all log entries for that request
- **Request-scoped logging** via `req.log` in controllers

### 4. Centralized Error Handling

The `errorHandler` middleware provides:

- **Full context logging** with request details
- **Automatic sensitive data redaction** in error logs
- **Environment-specific error responses**
- **Proper HTTP status code handling**
- **Request ID tracking** for debugging

## Usage Examples

### Basic Logging in Controllers

```javascript
export const someController = asyncHandler(async (req, res) => {
    req.log.info('Starting operation', { 
        userId: req.user?.id,
        operation: 'create-project' 
    });
    
    try {
        // Business logic here
        req.log.info('Operation completed successfully');
        res.json({ success: true });
    } catch (error) {
        req.log.error(error, { userId: req.user?.id }, 'Operation failed');
        throw error; // Will be handled by centralized error handler
    }
});
```

### Custom Logger Methods

```javascript
// Performance logging
logger.performance('database-query', 150, { 
    query: 'SELECT * FROM users',
    resultCount: 25 
});

// Development-only debug logs
logger.debugDev({ complexObject: data }, 'Debug info');

// Secure logging with guaranteed redaction
logger.secure({ 
    user: userData,
    token: 'sensitive-token' 
}, 'User authenticated');
```

### Error Handling with Context

```javascript
export const riskyOperation = asyncHandler(async (req, res) => {
    const { companyId, dealId } = req.body;
    
    req.log.info('Starting risky operation', { companyId, dealId });
    
    // The asyncHandler will catch any errors and pass them to errorHandler
    // The errorHandler will log full context including sensitive data (redacted)
    const result = await someAsyncOperation();
    
    res.json(result);
});
```

## Log Levels and Environment Behavior

| Level | Development | Production | Use Case |
|-------|-------------|------------|----------|
| `error` | Always shown | Always shown | Critical errors requiring immediate attention |
| `warn` | Always shown | Always shown | Warning conditions that should be monitored |
| `info` | Always shown | Always shown | General application flow information |
| `debug` | Always shown | **Filtered out** | Detailed debugging information |
| `trace` | Always shown | **Filtered out** | Very verbose debugging |

## HTTP Request Logging

### Automatic Request/Response Logging

Every HTTP request is automatically logged with:

- **Request method and URL**
- **Response status code and timing**
- **Request ID for traceability**
- **User agent and IP information**
- **Sensitive headers automatically redacted**

### Example Development Log Output

```
INFO: GET /api/users - 200 - 45ms
    service: "pipedrive-application"
    environment: "development"
    req: {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "method": "GET",
      "url": "/api/users",
      "headers": {
        "authorization": "[REDACTED]"
      }
    }
```

### Example Production Log Output

```json
{
  "level": 30,
  "time": "2025-06-03T02:53:41.683Z",
  "service": "pipedrive-application",
  "environment": "production",
  "req": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "method": "GET",
    "url": "/api/users",
    "headers": {
      "authorization": "[REDACTED]"
    }
  },
  "res": {
    "statusCode": 200
  },
  "responseTime": 45,
  "msg": "GET /api/users - 200"
}
```

## Security Features

### 1. Sensitive Data Redaction
- Automatic redaction of authentication headers, passwords, tokens
- Environment-agnostic security (works in both dev and prod)
- Configurable redaction paths for custom sensitive fields

### 2. Production Security
- No stack traces exposed in production error responses
- Limited request body logging in production
- Filtered headers to prevent accidental logging of sensitive data

### 3. Request ID Security
- Supports existing X-Request-ID headers from load balancers
- Generates cryptographically secure UUIDs for new requests
- Request IDs included in error responses for support debugging

## Testing the Implementation

### Development Mode Test
```bash
NODE_ENV=development npm start
curl -X POST http://localhost:3000/api/test-redaction \
  -H "Authorization: Bearer secret-token" \
  -d '{"password": "secret123"}'
```

### Production Mode Test
```bash
NODE_ENV=production npm start
# Same curl command - observe different log format
```

### Error Handling Test
```bash
curl -X GET http://localhost:3000/api/test-error
# Check logs for comprehensive error context
```

## Performance Considerations

- **Minimal overhead** in production with JSON serialization
- **Automatic filtering** of debug logs in production
- **Lazy evaluation** of log messages
- **Efficient redaction** using Pino's built-in redaction system
- **Request body logging limits** in production for memory efficiency

## Integration with External Systems

The structured JSON logs in production are ready for:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Splunk** log aggregation
- **CloudWatch** or other cloud logging services
- **Grafana** dashboards and alerting
- **Custom log analysis tools**

## Best Practices Implemented

1. **Consistent Structure** - All logs follow the same schema
2. **Request Correlation** - Every log entry can be traced to a specific request
3. **Security First** - Sensitive data automatically redacted
4. **Environment Awareness** - Different behavior for dev vs prod
5. **Error Context** - Rich context information for debugging
6. **Performance Monitoring** - Built-in performance logging capabilities
