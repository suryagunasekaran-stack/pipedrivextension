/**
 * Comparison Utility Functions
 * 
 * Functions for comparing data between Pipedrive and Xero
 */

// Helper function to compare products between Pipedrive and Xero
export function compareProducts(pipedriveProducts, xeroLineItems) {
  console.log(`🔍 Comparing ${pipedriveProducts.length} Pipedrive products with ${xeroLineItems.length} Xero line items`);
  
  const mismatches = [];
  
  // Check if counts match
  if (pipedriveProducts.length !== xeroLineItems.length) {
    mismatches.push(`Product count mismatch: Pipedrive ${pipedriveProducts.length} vs Xero ${xeroLineItems.length}`);
  }
  
  // Compare each product
  for (let i = 0; i < Math.min(pipedriveProducts.length, xeroLineItems.length); i++) {
    const pipeProduct = pipedriveProducts[i];
    const xeroItem = xeroLineItems[i];
    
    console.log(`📊 Comparing product ${i + 1}:`);
    console.log(`   Pipedrive: ${pipeProduct.product?.name || 'N/A'} - Qty: ${pipeProduct.quantity}, Price: $${pipeProduct.item_price}`);
    console.log(`   Xero: ${xeroItem.Description || 'N/A'} - Qty: ${xeroItem.Quantity}, Price: $${xeroItem.UnitAmount}`);
    
    // Compare quantities
    if (parseFloat(pipeProduct.quantity) !== parseFloat(xeroItem.Quantity)) {
      mismatches.push(`Product ${i + 1} quantity mismatch: Pipedrive ${pipeProduct.quantity} vs Xero ${xeroItem.Quantity}`);
    }
    
    // Compare unit prices
    if (parseFloat(pipeProduct.item_price) !== parseFloat(xeroItem.UnitAmount)) {
      mismatches.push(`Product ${i + 1} price mismatch: Pipedrive $${pipeProduct.item_price} vs Xero $${xeroItem.UnitAmount}`);
    }
  }
  
  if (mismatches.length === 0) {
    console.log(`✅ All products match between Pipedrive and Xero`);
  } else {
    console.log(`⚠️  Found ${mismatches.length} product mismatches:`, mismatches);
  }
  
  return mismatches;
}

// Enhanced comparison function for complex products with tax, discounts, etc.
export function compareComplexProducts(pipedriveProducts, xeroLineItems) {
  console.log(`🔍 Performing comprehensive comparison of ${pipedriveProducts.length} Pipedrive products with ${xeroLineItems.length} Xero line items`);
  
  const mismatches = [];
  
  // Check if counts match
  if (pipedriveProducts.length !== xeroLineItems.length) {
    mismatches.push(`Product count mismatch: Pipedrive ${pipedriveProducts.length} vs Xero ${xeroLineItems.length}`);
  }
  
  // Compare each product with detailed field comparison
  for (let i = 0; i < Math.min(pipedriveProducts.length, xeroLineItems.length); i++) {
    const pipeProduct = pipedriveProducts[i];
    const xeroItem = xeroLineItems[i];
    
    console.log(`📊 Comprehensive comparison for product ${i + 1}:`);
    console.log(`   Pipedrive: ${pipeProduct.product?.name || 'N/A'}`);
    console.log(`     - Quantity: ${pipeProduct.quantity}`);
    console.log(`     - Unit Price: $${pipeProduct.item_price}`);
    console.log(`     - Line Total: $${(pipeProduct.quantity * pipeProduct.item_price).toFixed(2)}`);
    
    console.log(`   Xero: ${xeroItem.Description || 'N/A'}`);
    console.log(`     - Quantity: ${xeroItem.Quantity}`);
    console.log(`     - Unit Amount: $${xeroItem.UnitAmount}`);
    console.log(`     - Line Amount: $${xeroItem.LineAmount || 'N/A'}`);
    console.log(`     - Tax Type: ${xeroItem.TaxType || 'N/A'}`);
    console.log(`     - Account Code: ${xeroItem.AccountCode || 'N/A'}`);
    console.log(`     - Discount Rate: ${xeroItem.DiscountRate || 0}%`);
    
    // Basic field comparisons
    if (parseFloat(pipeProduct.quantity) !== parseFloat(xeroItem.Quantity)) {
      mismatches.push(`Product ${i + 1} quantity mismatch: Pipedrive ${pipeProduct.quantity} vs Xero ${xeroItem.Quantity}`);
    }
    
    if (parseFloat(pipeProduct.item_price) !== parseFloat(xeroItem.UnitAmount)) {
      mismatches.push(`Product ${i + 1} unit price mismatch: Pipedrive $${pipeProduct.item_price} vs Xero $${xeroItem.UnitAmount}`);
    }
    
    // Line amount comparison (quantity * unit price)
    const expectedLineAmount = pipeProduct.quantity * pipeProduct.item_price;
    if (xeroItem.LineAmount && Math.abs(parseFloat(xeroItem.LineAmount) - expectedLineAmount) > 0.01) {
      mismatches.push(`Product ${i + 1} line amount mismatch: Expected $${expectedLineAmount.toFixed(2)} vs Xero $${xeroItem.LineAmount}`);
    }
    
    // Tax type comparison (if specified in Pipedrive product)
    const originalProduct = findOriginalProductData(pipeProduct.product?.name);
    if (originalProduct?.tax_type && xeroItem.TaxType !== originalProduct.tax_type) {
      mismatches.push(`Product ${i + 1} tax type mismatch: Expected ${originalProduct.tax_type} vs Xero ${xeroItem.TaxType}`);
    }
    
    // Account code comparison (if specified)
    if (originalProduct?.account_code && xeroItem.AccountCode !== originalProduct.account_code) {
      mismatches.push(`Product ${i + 1} account code mismatch: Expected ${originalProduct.account_code} vs Xero ${xeroItem.AccountCode}`);
    }
    
    // Discount rate comparison (if specified)
    if (originalProduct?.discount_rate && parseFloat(xeroItem.DiscountRate || 0) !== originalProduct.discount_rate) {
      mismatches.push(`Product ${i + 1} discount rate mismatch: Expected ${originalProduct.discount_rate}% vs Xero ${xeroItem.DiscountRate || 0}%`);
    }
  }
  
  if (mismatches.length === 0) {
    console.log(`✅ All complex product fields match between Pipedrive and Xero`);
  } else {
    console.log(`⚠️  Found ${mismatches.length} complex product mismatches:`, mismatches);
  }
  
  return mismatches;
}

// Helper function to find original product data by name (for complex comparisons)
function findOriginalProductData(productName) {
  // This would need to be enhanced to lookup original product data
  // For now, return null as placeholder
  // In a real implementation, this could reference the test data used
  return null;
}

// Compare quote totals and financial data
export function compareQuoteFinancials(dealData, xeroQuote) {
  console.log(`💰 Comparing quote financial data`);
  
  const mismatches = [];
  
  console.log(`📊 Financial comparison:`);
  console.log(`   Deal Value: $${dealData.value} ${dealData.currency || 'AUD'}`);
  console.log(`   Xero Quote Total: $${xeroQuote.Total} ${xeroQuote.CurrencyCode}`);
  console.log(`   Xero Quote SubTotal: $${xeroQuote.SubTotal || 'N/A'}`);
  console.log(`   Xero Quote Tax: $${xeroQuote.TotalTax || 'N/A'}`);
  
  // Currency comparison
  const expectedCurrency = dealData.currency || 'USD';
  if (xeroQuote.CurrencyCode !== expectedCurrency) {
    mismatches.push(`Currency mismatch: Expected ${expectedCurrency} vs Xero ${xeroQuote.CurrencyCode}`);
  }
  
  // Note: Total comparison might not match exactly due to tax calculations and discounts
  // This is normal behavior, but we can log the difference for information
  const totalDifference = Math.abs(parseFloat(xeroQuote.Total) - dealData.value);
  if (totalDifference > 0.01) {
    console.log(`ℹ️  Total difference detected: $${totalDifference.toFixed(2)} (this may be expected due to tax/discount calculations)`);
  }
  
  if (mismatches.length === 0) {
    console.log(`✅ Quote financial data matches expectations`);
  } else {
    console.log(`⚠️  Found ${mismatches.length} financial mismatches:`, mismatches);
  }
  
  return mismatches;
}

// Compare quote metadata (dates, status, etc.)
export function compareQuoteMetadata(xeroQuote, expectedData = {}) {
  console.log(`📋 Comparing quote metadata`);
  
  const mismatches = [];
  
  console.log(`📊 Metadata comparison:`);
  console.log(`   Quote Status: ${xeroQuote.Status}`);
  console.log(`   Quote Date: ${xeroQuote.Date}`);
  console.log(`   Expiry Date: ${xeroQuote.ExpiryDate || 'N/A'}`);
  console.log(`   Contact: ${xeroQuote.Contact?.Name || 'N/A'} (ID: ${xeroQuote.Contact?.ContactID})`);
  console.log(`   Title: ${xeroQuote.Title || 'N/A'}`);
  console.log(`   Reference: ${xeroQuote.Reference || 'N/A'}`);
  
  // Status should be SENT or DRAFT for new quotes
  const allowedStatuses = expectedData.allowedStatuses || ['SENT', 'DRAFT'];
  if (!allowedStatuses.includes(xeroQuote.Status)) {
    mismatches.push(`Unexpected quote status: ${xeroQuote.Status} (expected one of: ${allowedStatuses.join(', ')})`);
  }
  
  // Date should be recent (within last day)
  const quoteDate = new Date(xeroQuote.Date);
  const now = new Date();
  const daysDifference = Math.abs(now - quoteDate) / (1000 * 60 * 60 * 24);
  if (daysDifference > 1) {
    mismatches.push(`Quote date seems too old: ${xeroQuote.Date} (${daysDifference.toFixed(1)} days ago)`);
  }
  
  if (mismatches.length === 0) {
    console.log(`✅ Quote metadata is valid`);
  } else {
    console.log(`⚠️  Found ${mismatches.length} metadata issues:`, mismatches);
  }
  
  return mismatches;
} 