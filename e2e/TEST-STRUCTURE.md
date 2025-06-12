# E2E Test Structure

## 🎯 **Test Organization**

The E2E tests are now organized into separate files for different complexity levels:

### **1. Basic Deal Tests** (`basic-deals.test.js`)
- ✅ Simple deal creation and fetching
- ✅ Different values and currencies  
- ✅ Special characters handling
- ✅ **No products or discounts**

### **2. Products Deal Tests** (`products-deals.test.js`)
- ✅ Deal creation with products
- ✅ Quantity variations
- ✅ Pricing scenarios
- ✅ Service vs product mix
- ✅ Edge case products
- ✅ **Products only, no discounts**

### **3. Full Feature Tests** (`simple-deal-test.js`)
- ✅ All basic deal functionality
- ✅ Products with descriptions
- ✅ Percentage and fixed discounts
- ✅ Mixed discount types
- ✅ Edge case scenarios
- ✅ **Complete feature testing**

### **4. Xero Integration Tests** (`xero-integration.test.js`)
- ✅ Deal creation with products
- ✅ Xero quote creation via API
- ✅ Quote verification in Xero
- ✅ Product comparison (Pipedrive ↔ Xero)
- ✅ Custom field verification
- ✅ **End-to-end integration testing**

## 🚀 **Running Tests**

### **Default Test Run** (Basic + Products)
```bash
npm run test:e2e
```
Runs basic deals and products tests (excludes full feature tests by default)

### **Individual Test Suites**
```bash
# Basic deals only (fastest)
npm run test:e2e:basic

# Products deals only (medium complexity)
npm run test:e2e:products

# Full feature tests (most comprehensive)
npm run test:e2e:full

# Xero integration tests (requires server running)
npm run test:e2e:xero
```

### **Development Workflow**
```bash
# 1. Start with basic tests
npm run test:e2e:basic

# 2. Add products testing
npm run test:e2e:products

# 3. Full feature testing
npm run test:e2e:full

# 4. Run everything
npm run test:e2e:basic && npm run test:e2e:products && npm run test:e2e:full
```

## 🧹 **Cleanup Behavior**

### **Automatic Cleanup** (Default)
- ✅ Cleanup runs **AFTER all tests complete** (in `afterAll()`)
- ✅ Tracks all created deals in `createdDealIds` array
- ✅ Deletes all test deals automatically

### **Development Mode** (Inspect deals)
```bash
# Disable cleanup to inspect created deals
E2E_CLEANUP=false npm run test:e2e:basic
E2E_CLEANUP=false npm run test:e2e:products
E2E_CLEANUP=false npm run test:e2e:full
```

### **Manual Cleanup**
```bash
# Clean up all e2e test deals with confirmation
npm run test:e2e:cleanup
```

## 📊 **Test Scenarios**

### **Basic Deal Tests** (5 tests)
1. Basic deal creation
2. Deal fetching
3. Different values/currencies
4. Special characters
5. Edge cases

### **Products Deal Tests** (5 tests)
1. Basic products (2 products)
2. Quantity variations (3 products)
3. Pricing scenarios (4 products)
4. Service/product mix (4 products)
5. Edge case products (4 products)

### **Full Feature Tests** (11 tests)
1. Basic deal creation
2. Deal fetching
3. Basic products (2 products)
4. Quantity variations (3 products)
5. Pricing scenarios (4 products)
6. Service/product mix (4 products)
7. Edge case products (4 products)
8. Complex products (10 products)
9. Percentage discounts (2 products + 2 discounts)
10. Fixed amount discounts (2 products + 2 discounts)
11. Mixed discounts (3 products + 4 discounts)
12. Edge case discounts (2 products + 3 discounts)

## 🎛️ **Environment Variables**

| Variable | Default | Description |
|----------|---------|-------------|
| `E2E_CLEANUP` | `true` | Enable/disable automatic cleanup |
| `NODE_ENV` | `test` | Test environment |

## 🔄 **Typical Development Flow**

### **1. Initial Development**
```bash
# Start simple, inspect results
E2E_CLEANUP=false npm run test:e2e:basic
```

### **2. Add Products**
```bash
# Test products functionality
E2E_CLEANUP=false npm run test:e2e:products
```

### **3. Full Testing**
```bash
# Complete feature testing
npm run test:e2e:full
```

### **4. CI/CD Pipeline**
```bash
# Run all tests with cleanup
npm run test:e2e:basic
npm run test:e2e:products  
npm run test:e2e:full

# Integration testing (requires server)
npm run test:e2e:xero
```

## 🎯 **Benefits**

- ✅ **Incremental testing** - Start simple, add complexity
- ✅ **Faster feedback** - Basic tests run quickly
- ✅ **Focused debugging** - Isolate issues by test type
- ✅ **Flexible cleanup** - Inspect or auto-clean
- ✅ **CI/CD ready** - Separate test suites for different stages 