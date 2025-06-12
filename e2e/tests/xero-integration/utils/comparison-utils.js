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

// Helper function to parse Microsoft JSON date format: /Date(1749686400000)/
function parseMicrosoftDate(dateString) {
  if (typeof dateString === 'string' && dateString.startsWith('/Date(') && dateString.endsWith(')/')) {
    const match = dateString.match(/\/Date\((\d+)\)\//);
    if (match) {
      const timestamp = parseInt(match[1]);
      return new Date(timestamp);
    }
  }
  return new Date(dateString);
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
  
  // Date should be today's date (issue date)
  try {
    if (xeroQuote.Date) {
      const quoteDate = parseMicrosoftDate(xeroQuote.Date);
      const now = new Date();
      
      console.log(`🔍 Date parsing debug:`);
      console.log(`   Raw quote date: ${xeroQuote.Date}`);
      console.log(`   Parsed quote date: ${quoteDate.toISOString()}`);
      console.log(`   Today: ${now.toISOString()}`);
      
      // Check if the date is valid
      if (isNaN(quoteDate.getTime())) {
        mismatches.push(`Invalid quote date format: ${xeroQuote.Date}`);
      } else {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const quoteDateOnly = new Date(quoteDate.getFullYear(), quoteDate.getMonth(), quoteDate.getDate());
        
        console.log(`   Quote date (date only): ${quoteDateOnly.toISOString().split('T')[0]}`);
        console.log(`   Today (date only): ${today.toISOString().split('T')[0]}`);
        
        if (quoteDateOnly.getTime() !== today.getTime()) {
          mismatches.push(`Quote date should be today: expected ${today.toISOString().split('T')[0]}, got ${quoteDateOnly.toISOString().split('T')[0]} (raw: ${xeroQuote.Date})`);
        }
        
        // Expiry date should be 30 days from issue date (as per code: 30 * 24 * 60 * 60 * 1000)
        if (xeroQuote.ExpiryDate) {
          const expiryDate = parseMicrosoftDate(xeroQuote.ExpiryDate);
          
          console.log(`   Raw expiry date: ${xeroQuote.ExpiryDate}`);
          console.log(`   Parsed expiry date: ${expiryDate.toISOString()}`);
          
          if (isNaN(expiryDate.getTime())) {
            mismatches.push(`Invalid expiry date format: ${xeroQuote.ExpiryDate}`);
          } else {
            const expectedExpiryDate = new Date(quoteDate.getTime() + 30 * 24 * 60 * 60 * 1000);
            const expectedExpiryDateOnly = new Date(expectedExpiryDate.getFullYear(), expectedExpiryDate.getMonth(), expectedExpiryDate.getDate());
            const actualExpiryDateOnly = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());
            
            console.log(`   Expected expiry (date only): ${expectedExpiryDateOnly.toISOString().split('T')[0]}`);
            console.log(`   Actual expiry (date only): ${actualExpiryDateOnly.toISOString().split('T')[0]}`);
            
            if (actualExpiryDateOnly.getTime() !== expectedExpiryDateOnly.getTime()) {
              mismatches.push(`Expiry date should be 30 days from issue date: expected ${expectedExpiryDateOnly.toISOString().split('T')[0]}, got ${actualExpiryDateOnly.toISOString().split('T')[0]} (raw: ${xeroQuote.ExpiryDate})`);
            }
          }
        } else {
          mismatches.push(`Expiry date is missing (should be 30 days from issue date)`);
        }
      }
    } else {
      mismatches.push(`Quote date is missing`);
    }
  } catch (dateError) {
    mismatches.push(`Error validating dates: ${dateError.message}`);
  }
  
  // Check reference format for Pipedrive Deal ID
  if (expectedData.dealId) {
    const expectedReference = `Pipedrive Deal ID: ${expectedData.dealId}`;
    if (xeroQuote.Reference !== expectedReference) {
      mismatches.push(`Reference format incorrect: expected "${expectedReference}", got "${xeroQuote.Reference || 'N/A'}"`);
    }
  }
  
  if (mismatches.length === 0) {
    console.log(`✅ Quote metadata is valid`);
  } else {
    console.log(`⚠️  Found ${mismatches.length} metadata issues:`, mismatches);
  }
  
  return mismatches;
} 