/**
 * Test Data Fixtures
 * 
 * Static data used in Xero integration tests
 */

// Sample products for testing
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

// Generate test deal data
export function generateTestDealData(testPersonId = null, testOrgId = null) {
  const dealNumber = Math.floor(Math.random() * 9999) + 1;
  const dealData = {
    title: `e2e test ${dealNumber} - Xero integration`,
    value: 3200,
    currency: 'USD'
  };

  if (testPersonId) dealData.person_id = testPersonId;
  if (testOrgId) dealData.org_id = testOrgId;

  return dealData;
} 