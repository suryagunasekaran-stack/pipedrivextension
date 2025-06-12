/**
 * Test Data Fixtures
 * 
 * Static data used in Xero integration tests
 */

// Sample products for basic testing
export const testProducts = [
  {
    name: 'Marine Engine Service - Xero Test',
    quantity: 1,
    item_price: 1500,
    product_description: 'Complete marine engine service for Xero integration testing. Includes diagnostics and tune-up.'
  },
  {
    name: 'Premium Parts Bundle - Xero Test',
    quantity: 2,
    item_price: 850,
    product_description: 'High-quality marine parts bundle for Xero integration. Includes gaskets, seals, and filters.'
  }
];

// Complex products for advanced testing scenarios
export const complexTestProducts = [
  {
    name: 'Marine Engine Overhaul - Premium Service',
    quantity: 1,
    item_price: 3500.50,
    product_description: 'Complete engine overhaul including valve replacement, gasket renewal, and performance tuning. Includes 12-month warranty.',
    discount_rate: 10, // 10% discount
    tax_type: 'GST', // 10% GST
    account_code: '200'
  },
  {
    name: 'High-Performance Propeller Set',
    quantity: 2,
    item_price: 1275.75,
    product_description: 'Stainless steel 3-blade propeller set for improved fuel efficiency and performance.',
    discount_rate: 5, // 5% discount
    tax_type: 'GST',
    account_code: '200'
  },
  {
    name: 'Navigation Equipment Package',
    quantity: 1,
    item_price: 2850.00,
    product_description: 'Complete navigation package: GPS chartplotter, depth sounder, and VHF radio with emergency beacon.',
    discount_rate: 0, // No discount
    tax_type: 'GST',
    account_code: '200'
  },
  {
    name: 'Hull Cleaning & Antifoul Service',
    quantity: 1,
    item_price: 899.99,
    product_description: 'Professional hull cleaning, inspection, and premium antifoul coating application.',
    discount_rate: 15, // 15% discount (seasonal promotion)
    tax_type: 'GST',
    account_code: '400' // Service category
  },
  {
    name: 'Emergency Safety Kit - Deluxe',
    quantity: 3,
    item_price: 245.50,
    product_description: 'Comprehensive safety equipment: life jackets, flares, first aid kit, emergency radio.',
    discount_rate: 0,
    tax_type: 'NONE', // Tax-exempt safety equipment
    account_code: '200'
  }
];

// Multi-currency test products
export const multiCurrencyTestProducts = [
  {
    name: 'International Marine Parts - USD',
    quantity: 2,
    item_price: 750.00,
    product_description: 'Imported marine parts priced in USD. High-quality components from international suppliers.',
    discount_rate: 8,
    tax_type: 'GST',
    account_code: '200',
    currency: 'USD'
  },
  {
    name: 'European Engine Components - EUR',
    quantity: 1,
    item_price: 1200.50,
    product_description: 'Premium European engine components with advanced engineering.',
    discount_rate: 12,
    tax_type: 'GST',
    account_code: '200',
    currency: 'EUR'
  }
];

// Generate test deal data
export function generateTestDealData(testPersonId = null, testOrgId = null, currency = 'USD') {
  const dealNumber = Math.floor(Math.random() * 9999) + 1;
  const dealData = {
    title: `e2e test ${dealNumber} - Xero integration`,
    value: 3200,
    currency: currency
  };

  if (testPersonId) dealData.person_id = testPersonId;
  if (testOrgId) dealData.org_id = testOrgId;

  return dealData;
}

// Generate complex test deal data with higher value
export function generateComplexTestDealData(testPersonId = null, testOrgId = null, currency = 'USD') {
  const dealNumber = Math.floor(Math.random() * 9999) + 1;
  const dealData = {
    title: `e2e complex test ${dealNumber} - Advanced Xero integration`,
    value: 12500.75, // Higher value to match complex products
    currency: currency
  };

  if (testPersonId) dealData.person_id = testPersonId;
  if (testOrgId) dealData.org_id = testOrgId;

  return dealData;
}

// Generate multi-currency test deal data
export function generateMultiCurrencyTestDealData(testPersonId = null, testOrgId = null, currency = 'USD') {
  const dealNumber = Math.floor(Math.random() * 9999) + 1;
  const dealData = {
    title: `e2e multi-currency test ${dealNumber} - Currency Xero integration`,
    value: 8500, // Value in specified currency
    currency: currency
  };

  if (testPersonId) dealData.person_id = testPersonId;
  if (testOrgId) dealData.org_id = testOrgId;

  return dealData;
}

// Test scenarios configuration
export const testScenarios = {
  basic: {
    name: 'Basic Xero Integration',
    products: testProducts,
    dealGenerator: generateTestDealData,
    currency: 'USD'
  },
  complex: {
    name: 'Complex Products with Tax & Discounts',
    products: complexTestProducts,
    dealGenerator: generateComplexTestDealData,
    currency: 'USD'
  },
  multiCurrency: {
    name: 'Multi-Currency Integration',
    products: multiCurrencyTestProducts,
    dealGenerator: generateMultiCurrencyTestDealData,
    currency: 'USD'
  }
}; 