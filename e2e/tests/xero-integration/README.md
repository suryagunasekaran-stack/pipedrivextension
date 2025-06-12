# Xero Integration Test Suite

This directory contains the organized Xero integration test suite, split into logical components for better maintainability and reusability.

## Structure

```
xero-integration/
├── helpers/
│   ├── server-helpers.js      # Server status and route checking functions
│   ├── pipedrive-helpers.js   # Pipedrive API interaction functions
│   └── xero-helpers.js        # Xero API interaction functions
├── utils/
│   └── comparison-utils.js    # Data comparison utilities
├── fixtures/
│   └── test-data.js          # Static test data and generators
├── tests/
│   └── integration-test.js   # Main test runner function
├── index.js                  # Exports all components
└── README.md                 # This file
```

## Components

### Helpers

#### `server-helpers.js`
- `checkServerRunning(serverUrl)` - Verifies the server is running
- `checkAvailableRoutes(serverUrl)` - Checks for available API routes

#### `pipedrive-helpers.js`
- `findTestContactsAndOrg(testConfig)` - Finds TEST person and organization
- `cleanupCreatedDeals(createdDealIds, testConfig)` - Cleans up test deals
- `createProduct(productData, testConfig)` - Creates a product in Pipedrive
- `addProductsToDeal(dealId, products, testConfig)` - Adds products to a deal
- `getDealProducts(dealId, testConfig)` - Retrieves deal products
- `getDealCustomFields(dealId, testConfig)` - Gets deal custom fields

#### `xero-helpers.js`
- `createXeroQuote(dealId, companyId, serverUrl)` - Creates a Xero quote
- `getXeroQuoteByNumber(quoteNumber, serverUrl)` - Retrieves a Xero quote
- `cleanupXeroQuotes(createdXeroQuoteIds, serverUrl)` - Cleans up test quotes

### Utils

#### `comparison-utils.js`
- `compareProducts(pipedriveProducts, xeroLineItems)` - Compares products between systems

### Fixtures

#### `test-data.js`
- `testProducts` - Array of sample products for testing
- `generateTestDealData(testPersonId, testOrgId)` - Generates test deal data

### Tests

#### `integration-test.js`
- `runXeroIntegrationTest(testConfig)` - Main test function that orchestrates the full integration test

## Usage

### Running the Main Test

The main test file (`../xero-integration.test.js`) imports and runs the organized test:

```javascript
import { runXeroIntegrationTest } from './xero-integration/tests/integration-test.js';

// In your test
const result = await runXeroIntegrationTest(testConfig);
```

### Using Individual Helpers

You can import specific helpers as needed:

```javascript
import { checkServerRunning } from './xero-integration/helpers/server-helpers.js';
import { createProduct } from './xero-integration/helpers/pipedrive-helpers.js';
```

### Using the Index File

Import everything at once:

```javascript
import * as XeroIntegration from './xero-integration/index.js';
```

## Benefits of This Structure

1. **Modularity** - Each file has a single responsibility
2. **Reusability** - Helper functions can be used across different tests
3. **Maintainability** - Changes to specific functionality are isolated
4. **Testability** - Individual functions can be unit tested
5. **Readability** - Main test file is much cleaner and easier to understand

## Environment Variables

The tests respect the following environment variables:

- `SERVER_URL` - Server URL (default: http://localhost:3000)
- `E2E_CLEANUP` - Enable/disable cleanup (default: true, set to 'false' to disable)
- `PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY` - Expected custom field for quote number
- `PIPEDRIVE_QUOTE_ID` - Expected custom field for quote ID 