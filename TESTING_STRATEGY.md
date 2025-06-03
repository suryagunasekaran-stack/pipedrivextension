# Testing Strategy for Pipedrive-Xero Integration

## Overview

This document outlines the comprehensive testing strategy for the Pipedrive-Xero integration application. The testing approach addresses the unique challenges of testing OAuth-based integrations with external APIs while maintaining test isolation and data consistency.

## Testing Architecture

### 1. Test Pyramid Structure

```
    E2E Tests (Scenarios)
         /\
        /  \
   Integration Tests
      /        \
     /          \
Unit Tests    API Tests
```

### 2. Test Categories

#### Unit Tests
- **Location**: `__tests__/**/*.test.js` (except integration/ and e2e/)
- **Purpose**: Test individual functions and modules in isolation
- **Scope**: Controllers, helpers, models, services
- **Mocking**: Heavy use of mocks for external dependencies

#### Integration Tests  
- **Location**: `__tests__/integration/*.test.js`
- **Purpose**: Test complete workflows with database integration
- **Scope**: Full request-response cycles with real database operations
- **Mocking**: External APIs only

#### End-to-End Tests
- **Location**: `__tests__/e2e/*.test.js` 
- **Purpose**: Test complete user scenarios and edge cases
- **Scope**: Real-world workflows from start to finish
- **Mocking**: All external APIs

## Key Testing Challenges Addressed

### 1. OAuth Token Management
- **Challenge**: Testing with OAuth requires valid tokens
- **Solution**: Mock token services and authentication middleware
- **Implementation**: `testUtils.js` provides mock authentication objects

### 2. External API Dependencies
- **Challenge**: Tests shouldn't make real API calls to Pipedrive/Xero
- **Solution**: Comprehensive API mocking with nock
- **Implementation**: `PipedriveMock` and `XeroMock` classes simulate API responses

### 3. Sequential ID Generation
- **Challenge**: Deal IDs and project numbers are sequential and can't be reset
- **Solution**: Use mock data with controlled sequences
- **Implementation**: In-memory database with controlled test data

### 4. Database State Management
- **Challenge**: Tests need clean database state
- **Solution**: MongoDB Memory Server for isolated test database
- **Implementation**: Each test gets fresh database instance

## Test Data Strategy

### Mock Data Generation
```javascript
// Consistent mock data across tests
const mockDeal = mockData.pipedriveDeal('12345', {
  title: 'Test Deal',
  value: 10000,
  custom_fields: {
    department: 'Engineering',
    vessel: 'Test Vessel'
  }
});
```

### Test Data Cleanup
- **Automatic**: `beforeEach`/`afterEach` hooks clean test data
- **Manual**: `scripts/testCleanup.js` for manual cleanup
- **Database**: MongoDB Memory Server provides isolated test database

## Running Tests

### Basic Commands
```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests  
npm run test:integration
```

### Test Environment Setup
```bash
# Validate test environment
npm run test:validate

# Reset test database
npm run test:reset

# Generate test data
npm run test:generate

# View test statistics
npm run test:stats
```

## Test Scenarios Covered

### 1. Happy Path Scenarios
- ✅ New customer, new deal, new project creation
- ✅ Existing customer, link to existing project
- ✅ Complete workflow with Xero integration
- ✅ Multiple departments with different prefixes

### 2. Validation Scenarios
- ✅ Missing required fields (dealId, companyId)
- ✅ Invalid data formats
- ✅ Edge case values (large numbers, special characters)
- ✅ Empty or null inputs

### 3. Authentication Scenarios
- ✅ Missing Pipedrive authentication
- ✅ Expired tokens with refresh
- ✅ Token refresh failures
- ✅ Missing Xero authentication

### 4. API Error Scenarios
- ✅ Deal not found (404)
- ✅ Person not found (404)
- ✅ Organization not found (404)
- ✅ API rate limiting (429)
- ✅ Server errors (500)

### 5. Business Logic Scenarios
- ✅ Missing required custom fields
- ✅ Project sequence generation
- ✅ Duplicate project number handling
- ✅ Department-specific numbering

### 6. Integration Scenarios
- ✅ Xero contact creation
- ✅ Xero project creation
- ✅ Partial failures (Xero fails, Pipedrive succeeds)
- ✅ Database connection failures

### 7. Performance Scenarios
- ✅ Concurrent project creation requests
- ✅ High volume request handling
- ✅ Race condition prevention
- ✅ Database transaction integrity

## Best Practices Implemented

### 1. Test Isolation
- Each test runs with clean database state
- No shared state between tests
- Independent mock setups

### 2. Predictable Test Data
- Consistent mock data generators
- Controlled sequences and IDs
- Deterministic test outcomes

### 3. Comprehensive Error Testing
- All error paths covered
- Proper error message validation
- Status code verification

### 4. Performance Considerations
- Test execution time monitoring
- Memory usage optimization
- Parallel test execution where possible

### 5. Maintainability
- Clear test organization
- Reusable test utilities
- Comprehensive documentation

## Mock API Endpoints

### Pipedrive API Mocks
- `GET /v1/deals/{id}` - Fetch deal details
- `GET /v1/persons/{id}` - Fetch person details  
- `GET /v1/organizations/{id}` - Fetch organization details
- `GET /v1/deals/{id}/products` - Fetch deal products
- `PUT /v1/deals/{id}` - Update deal
- `POST /oauth/token` - Token refresh

### Xero API Mocks
- `GET /api.xro/2.0/Contacts` - Get contacts
- `PUT /api.xro/2.0/Contacts` - Create contact
- `GET /projects.xro/2.0/Projects` - Get projects
- `PUT /projects.xro/2.0/Projects` - Create project
- `POST /connect/token` - Token refresh

## Continuous Integration

### GitHub Actions Configuration
```yaml
# Suggested CI pipeline
- name: Run Tests
  run: |
    npm ci
    npm run test:validate
    npm run test:coverage
    npm run test:integration
```

### Coverage Requirements
- **Minimum**: 80% code coverage
- **Target**: 90% code coverage
- **Critical paths**: 100% coverage required

## Troubleshooting

### Common Issues

1. **Jest ES Module Errors**
   - Solution: Use proper Jest configuration for ES modules
   - File: `jest.config.js` updated with ES module support

2. **Database Connection Issues**
   - Solution: Ensure MongoDB Memory Server is properly initialized
   - Check: `jest.setup.js` configuration

3. **Mock API Not Called**
   - Solution: Verify nock scope matches actual requests
   - Debug: Use `nock.recorder.rec()` to record actual requests

4. **Race Conditions in Tests**
   - Solution: Use proper async/await and test isolation
   - Check: Database cleanup in `beforeEach`/`afterEach`

### Debug Mode
```bash
# Run tests with debug output
DEBUG=* npm test

# Run specific test file
npm test -- __tests__/controllers/projectController.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should create new project"
```

## Future Enhancements

### 1. Visual Testing
- Screenshot testing for UI components
- Visual regression detection

### 2. Load Testing
- Stress testing with high concurrent requests
- Performance benchmarking

### 3. Contract Testing
- API contract verification with Pact
- Schema validation testing

### 4. Chaos Engineering
- Fault injection testing
- Resilience validation

This comprehensive testing strategy ensures robust, reliable code while addressing the unique challenges of OAuth-based API integrations.
