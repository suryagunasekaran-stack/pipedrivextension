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