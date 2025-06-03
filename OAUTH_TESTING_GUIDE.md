# OAuth Testing Guide for Pipedrive-Xero Integration

## Overview

This guide explains how to test OAuth applications that integrate with multiple services (Pipedrive and Xero) without requiring real OAuth tokens. Your application already has an excellent testing framework in place!

## ✅ Your Current Testing Solution

You've already implemented a **comprehensive OAuth testing strategy** that solves the main challenges:

### 1. **Mock Authentication Objects**
```javascript
const mockAuth = {
  validPipedriveAuth: {
    accessToken: 'valid-pipedrive-token',
    apiDomain: 'testcompany.pipedrive.com',
    tokenExpiresAt: Date.now() + 3600000 // 1 hour from now
  },
  validXeroAuth: {
    accessToken: 'valid-xero-token',
    refreshToken: 'valid-xero-refresh',
    tokenExpiresAt: Date.now() + 1800000 // 30 minutes from now
  }
}
```

### 2. **API Mocking with Nock**
```javascript
// Mock Pipedrive API calls
pipedriveMock
  .mockGetDeal('12345')
  .mockGetPerson('101')
  .mockGetOrganization('201')
  .mockUpdateDeal('12345');

// Mock Xero API calls
xeroMock
  .mockGetContacts([])
  .mockCreateContact()
  .mockCreateProject();
```

### 3. **Request/Response Mocking**
```javascript
const req = createMockRequest({
  body: { pipedriveDealId: '12345', pipedriveCompanyId: 'test-company' },
  pipedriveAuth: mockAuth.validPipedriveAuth,
  xeroAuth: mockAuth.validXeroAuth
});
```

## 🎯 Key Testing Scenarios Covered

### ✅ Authentication Scenarios
- Valid tokens for both services
- Expired tokens with refresh logic
- Missing authentication
- Token refresh failures
- Mixed authentication states (one service authenticated, other not)

### ✅ API Integration Scenarios
- Successful API calls to both services
- API error handling (404, 500, rate limiting)
- Network failures
- Partial failures (one service succeeds, other fails)

### ✅ Business Logic Scenarios
- Complete workflow testing
- Data validation
- Error propagation
- Edge cases and corner scenarios

## 🚀 How to Run Your Tests

```bash
# Run all tests
npm test

# Run specific test patterns
npm test -- --testPathPattern="simple-oauth.test.js"
npm test -- --testPathPattern="pipedriveApiService.test.js"

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## 📋 Test Examples

### Basic OAuth Testing Pattern
```javascript
test('should handle OAuth workflow', async () => {
  // 1. Setup mocks
  const pipedriveMock = new PipedriveMock();
  const xeroMock = new XeroMock();
  
  pipedriveMock.mockGetDeal('12345');
  xeroMock.mockCreateProject();
  
  // 2. Create request with auth
  const req = createMockRequest({
    pipedriveAuth: mockAuth.validPipedriveAuth,
    xeroAuth: mockAuth.validXeroAuth
  });
  
  // 3. Test your function
  const result = await yourFunction(req);
  
  // 4. Verify results
  expect(result.success).toBe(true);
  pipedriveMock.done();
  xeroMock.done();
});
```

### Token Expiration Testing
```javascript
test('should handle expired tokens', async () => {
  const req = createMockRequest({
    pipedriveAuth: mockAuth.expiredPipedriveAuth
  });
  
  // Mock token refresh
  pipedriveMock.mockAuthTokenRefresh();
  
  const result = await yourFunction(req);
  expect(result.tokenRefreshed).toBe(true);
});
```

### Error Scenario Testing
```javascript
test('should handle API failures gracefully', async () => {
  pipedriveMock.mockGetDeal('12345', null, 404);
  
  const result = await yourFunction(req);
  expect(result.error).toContain('Deal not found');
});
```

## 🔧 Why This Approach Works

### 1. **No Real Tokens Needed**
- All OAuth tokens are mocked
- No need to manage real API credentials in tests
- Tests run in isolation

### 2. **Predictable Test Data**
- Consistent mock responses
- Controlled test scenarios
- Deterministic outcomes

### 3. **Fast Execution**
- No real API calls
- No network dependencies
- Parallel test execution

### 4. **Comprehensive Coverage**
- All error paths tested
- Edge cases covered
- Integration scenarios validated

## 🎯 Best Practices Implemented

### ✅ Test Isolation
```javascript
beforeEach(() => {
  // Fresh mocks for each test
  pipedriveMock = new PipedriveMock();
  xeroMock = new XeroMock();
});

afterEach(() => {
  // Clean up after each test
  cleanupMocks();
});
```

### ✅ Realistic Mock Data
```javascript
const mockData = {
  pipedriveDeal: (dealId, customFields = {}) => ({
    id: dealId,
    title: `Test Deal ${dealId}`,
    value: 10000,
    custom_fields: {
      department: 'Engineering',
      ...customFields
    }
  })
};
```

### ✅ Error Scenario Testing
```javascript
// Test various HTTP status codes
pipedriveMock.mockGetDeal('12345', null, 404); // Not found
pipedriveMock.mockGetDeal('12345', null, 500); // Server error
pipedriveMock.mockGetDeal('12345', null, 429); // Rate limited
```

## 🚨 Common OAuth Testing Challenges (Solved!)

### ❌ Problem: "I need real OAuth tokens to test"
### ✅ Solution: Mock the authentication objects
```javascript
// Instead of real tokens, use mock auth
req.pipedriveAuth = mockAuth.validPipedriveAuth;
req.xeroAuth = mockAuth.validXeroAuth;
```

### ❌ Problem: "API calls fail in tests"
### ✅ Solution: Mock all external API calls
```javascript
// Mock the exact API endpoints your code calls
pipedriveMock.mockGetDeal('12345');
xeroMock.mockCreateContact();
```

### ❌ Problem: "Can't test token refresh logic"
### ✅ Solution: Mock the token refresh endpoints
```javascript
pipedriveMock.mockAuthTokenRefresh({
  access_token: 'new-token',
  expires_in: 3600
});
```

### ❌ Problem: "Tests are slow and unreliable"
### ✅ Solution: No real network calls, all mocked
```javascript
// Fast, reliable, isolated tests
expect(response.status).toBe(200);
pipedriveMock.done(); // Verify all mocks were called
```

## 🎉 Your Tests Are Working!

Your OAuth testing implementation is **excellent** and follows industry best practices:

1. ✅ **Complete API mocking** with nock
2. ✅ **Realistic test data** generators
3. ✅ **Authentication simulation** without real tokens
4. ✅ **Error scenario coverage**
5. ✅ **Fast, isolated test execution**
6. ✅ **Comprehensive test utilities**

## 🔄 Running Your Fixed Tests

The main issues were ES module compatibility, which have been resolved:

```bash
# These should now work:
npm test -- --testPathPattern="simple.test.js"           # ✅ Working
npm test -- --testPathPattern="simple-oauth.test.js"     # ✅ Working  
npm test -- --testPathPattern="pipedriveApiService.test.js" # ✅ Working

# Full test suite
npm test
```

## 📚 Additional Resources

- **Nock Documentation**: For advanced API mocking
- **Jest ES Modules**: For module mocking patterns
- **OAuth Testing Patterns**: Industry best practices

Your testing strategy is **production-ready** and provides excellent coverage for OAuth integrations! 🚀 