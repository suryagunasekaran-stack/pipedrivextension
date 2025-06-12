# 🧪 End-to-End Testing Guide

## 📋 Overview

This E2E testing suite provides comprehensive automated testing for the Pipedrive-Xero integration application. It tests complete user workflows including authentication, quote creation, project management, and error handling.

## 🚀 Quick Start

### 1. Initial Setup (One-time)

```bash
# Install E2E test dependencies
npm install --save-dev inquirer open

# Run the authentication setup script
node e2e/setup/auth-setup.js
```

The setup script will:
- ✅ Ask for your Pipedrive sandbox API token
- ✅ Guide you through Xero OAuth authentication
- ✅ Save test tokens to `.env.test`

### 2. Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with debug output
DEBUG=true npm run test:e2e

# Run specific test suite
npm run test:e2e -- --testNamePattern="Quote Creation"
```

## 🏗️ Architecture

### Test Structure

```
e2e/
├── setup/
│   └── auth-setup.js       # One-time authentication setup
├── config/
│   └── test-environment.js # Test environment configuration
├── tests/
│   └── full-workflow.test.js # Complete E2E test suite
├── jest.config.js          # Jest configuration
├── jest.setup.js           # Jest setup and utilities
└── README.md               # This file
```

### Key Components

#### 1. **Authentication Setup** (`setup/auth-setup.js`)
- Interactive CLI for initial token setup
- Handles Pipedrive API token configuration
- Manages Xero OAuth flow with local callback server
- Saves encrypted tokens for test reuse

#### 2. **Test Environment** (`config/test-environment.js`)
- Starts MongoDB Memory Server
- Injects pre-authenticated tokens
- Creates test data fixtures
- Manages database lifecycle

#### 3. **Test Suite** (`tests/full-workflow.test.js`)
- Tests all API endpoints
- Validates complete user workflows
- Handles error scenarios
- Ensures data consistency

## 📝 Test Scenarios

### ✅ Authentication Tests
- Verify Pipedrive authentication status
- Check Xero connection status
- Handle missing credentials
- Test logout functionality

### 💰 Quote Creation Tests
- Create quotes from Pipedrive deals
- Handle missing organization data
- Validate line item processing
- Update Pipedrive with quote numbers

### 📋 Project Creation Tests
- Generate unique project numbers
- Create Xero projects with tasks
- Link deals to existing projects
- Accept associated quotes

### 🔄 Update Workflows
- Fetch quotation data for updates
- Compare Pipedrive and Xero data
- Handle quote status transitions

### ❌ Error Scenarios
- Invalid deal IDs
- Missing required fields
- Network timeouts
- Authentication failures

## 🔧 Configuration

### Environment Variables

Create `.env.test` file (automatically created by setup script):

```env
# Pipedrive Test Configuration
TEST_PIPEDRIVE_API_TOKEN=your_sandbox_api_token
TEST_PIPEDRIVE_COMPANY_DOMAIN=sandbox-company
TEST_PIPEDRIVE_COMPANY_ID=12345

# Xero Test Configuration (optional)
TEST_XERO_ACCESS_TOKEN=xero_access_token
TEST_XERO_REFRESH_TOKEN=xero_refresh_token
TEST_XERO_TENANT_ID=xero_tenant_id
TEST_XERO_TOKEN_EXPIRES=2024-01-01T00:00:00Z
```

### Test Data

The test environment automatically creates:
- Auth tokens for both services
- Project sequences for all departments
- Sample deal-project mappings

## 🧩 Extending Tests

### Adding New Test Cases

```javascript
describe('New Feature', () => {
  test('should handle new functionality', async () => {
    const response = await fetch(`${baseUrl}/api/new-endpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: testConfig.companyId,
        // ... other parameters
      })
    });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
```

### Using Test Helpers

```javascript
// Wait for a condition
await global.testHelpers.waitFor(
  async () => {
    const response = await fetch(`${baseUrl}/api/status`);
    return response.ok;
  },
  10000 // timeout in ms
);

// Retry on failure
const data = await global.testHelpers.retry(
  async () => {
    const response = await fetch(`${baseUrl}/api/data`);
    if (!response.ok) throw new Error('Failed');
    return response.json();
  },
  3, // max attempts
  1000 // delay between attempts
);
```

## 🐛 Troubleshooting

### Common Issues

#### 1. **Authentication Setup Fails**
- Ensure your Pipedrive API token is valid
- Check that Xero client ID/secret are configured
- Verify sandbox accounts are active

#### 2. **Tests Timeout**
- Check if the server started successfully
- Verify MongoDB Memory Server is running
- Look for port conflicts (3000)

#### 3. **Token Expiration**
- Re-run `auth-setup.js` to refresh tokens
- Check token expiration dates in `.env.test`

### Debug Mode

Run tests with debug output:
```bash
DEBUG=true npm run test:e2e
```

This will show:
- Console logs from the application
- Detailed error messages
- Server startup logs

## 🔒 Security Considerations

- Test tokens are encrypted using AES-256-CBC
- `.env.test` should be added to `.gitignore`
- Use only sandbox accounts for testing
- Rotate test tokens regularly

## 📊 Test Reports

Generate test coverage report:
```bash
npm run test:e2e -- --coverage
```

View test results in JUnit format:
```bash
npm run test:e2e -- --reporters=default --reporters=jest-junit
```

## 🚦 CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Create test environment
      run: |
        echo "TEST_PIPEDRIVE_API_TOKEN=${{ secrets.TEST_PIPEDRIVE_TOKEN }}" >> .env.test
        echo "TEST_PIPEDRIVE_COMPANY_DOMAIN=${{ secrets.TEST_PIPEDRIVE_DOMAIN }}" >> .env.test
        # Add other test variables
    
    - name: Run E2E tests
      run: npm run test:e2e
```

## 📈 Best Practices

1. **Isolate Test Data**: Each test should create its own data
2. **Clean Up**: Reset database state between tests
3. **Use Sandbox Accounts**: Never test against production
4. **Mock External APIs**: When testing specific scenarios
5. **Parallel Execution**: Tests should be independent
6. **Meaningful Assertions**: Test business logic, not just status codes

## 🔗 Related Documentation

- [Main README](../README.md)
- [Workflow Documentation](../workflow.md)
- [API Integration Guide](../frontend-integration-guide.md)
- [Test Documentation](../Test.md) 