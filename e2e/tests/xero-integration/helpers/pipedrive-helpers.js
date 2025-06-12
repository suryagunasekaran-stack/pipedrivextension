/**
 * Pipedrive Helper Functions
 * 
 * Functions for interacting with Pipedrive API (deals, products, contacts)
 */

// Helper function to find TEST person and organization
export async function findTestContactsAndOrg(testConfig) {
  let testPersonId = null;
  let testOrgId = null;
  
  try {
    // Find TEST person
    const personsResponse = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/v1/persons/search?term=TEST&api_token=${testConfig.apiToken}`
    );
    const personsResult = await personsResponse.json();
    
    if (personsResult.success && personsResult.data && personsResult.data.items.length > 0) {
      testPersonId = personsResult.data.items[0].item.id;
      console.log(`✅ Found TEST person with ID: ${testPersonId}`);
    } else {
      console.log('⚠️  No TEST person found, will create deals without person');
    }

    // Find TEST organization
    const orgsResponse = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/v1/organizations/search?term=TEST&api_token=${testConfig.apiToken}`
    );
    const orgsResult = await orgsResponse.json();
    
    if (orgsResult.success && orgsResult.data && orgsResult.data.items.length > 0) {
      testOrgId = orgsResult.data.items[0].item.id;
      console.log(`✅ Found TEST organization with ID: ${testOrgId}`);
    } else {
      console.log('⚠️  No TEST organization found, will create deals without organization');
    }
  } catch (error) {
    console.log('❌ Error finding TEST contacts:', error.message);
  }
  
  return { testPersonId, testOrgId };
}

// Helper function to cleanup created deals
export async function cleanupCreatedDeals(createdDealIds, testConfig) {
  if (createdDealIds.length === 0) {
    console.log('🧹 No deals to cleanup');
    return;
  }

  console.log(`🧹 Cleaning up ${createdDealIds.length} created deals...`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const dealId of createdDealIds) {
    try {
      console.log(`🗑️  Deleting deal ID: ${dealId}...`);
      
      const deleteResponse = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/v1/deals/${dealId}?api_token=${testConfig.apiToken}`,
        { method: 'DELETE' }
      );
      
      if (deleteResponse.ok) {
        console.log(`✅ Successfully deleted deal ID: ${dealId}`);
        successCount++;
      } else {
        const errorResult = await deleteResponse.json();
        console.log(`⚠️  Failed to delete deal ID: ${dealId} - Status: ${deleteResponse.status}`, errorResult);
        failCount++;
      }
    } catch (error) {
      console.log(`❌ Error deleting deal ID: ${dealId}:`, error.message);
      failCount++;
    }
  }
  
  console.log(`🧹 Cleanup complete: ${successCount} deleted, ${failCount} failed`);
}

// Helper function to create a product in Pipedrive
export async function createProduct(productData, testConfig) {
  try {
    console.log(`📦 Creating product: ${productData.name}`);
    
    const response = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/api/v2/products?api_token=${testConfig.apiToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(productData)
      }
    );

    const result = await response.json();
    if (result.success) {
      console.log(`✅ Created product: ${productData.name} (ID: ${result.data.id})`);
      return result.data;
    } else {
      console.log(`⚠️  Failed to create product: ${productData.name}`, result);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error creating product ${productData.name}:`, error.message);
    return null;
  }
}

// Helper function to add products to a deal
export async function addProductsToDeal(dealId, products, testConfig) {
  const addedProducts = [];
  console.log(`📦 Adding ${products.length} products to deal ${dealId}`);
  
  for (const product of products) {
    // First create the product
    const createdProduct = await createProduct({
      name: product.name,
      description: product.product_description || ''
    }, testConfig);
    
    if (!createdProduct) {
      console.log(`⚠️  Skipping product: ${product.name} (creation failed)`);
      continue;
    }
    
    // Then attach it to the deal
    try {
      const response = await fetch(
        `https://${testConfig.companyDomain}.pipedrive.com/api/v2/deals/${dealId}/products?api_token=${testConfig.apiToken}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            product_id: createdProduct.id,
            item_price: product.item_price,
            quantity: product.quantity,
            comments: product.product_description || ''
          })
        }
      );

      const result = await response.json();
      if (result.success) {
        addedProducts.push(result.data);
        console.log(`✅ Added product to deal: ${product.name} (Qty: ${product.quantity}, Price: $${product.item_price})`);
      } else {
        console.log(`⚠️  Failed to add product to deal: ${product.name}`, result);
      }
    } catch (error) {
      console.log(`❌ Error adding product ${product.name} to deal:`, error.message);
    }
  }
  
  console.log(`📦 Successfully added ${addedProducts.length}/${products.length} products to deal ${dealId}`);
  return addedProducts;
}

// Helper function to get deal products
export async function getDealProducts(dealId, testConfig) {
  try {
    const response = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/api/v2/deals/${dealId}/products?api_token=${testConfig.apiToken}`
    );
    
    const result = await response.json();
    return result.success ? result.data : [];
  } catch (error) {
    console.log(`❌ Error fetching deal products:`, error.message);
    return [];
  }
}

// Helper function to get deal custom fields
export async function getDealCustomFields(dealId, testConfig) {
  try {
    const response = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/v1/deals/${dealId}?api_token=${testConfig.apiToken}`
    );
    
    const result = await response.json();
    if (result.success) {
      return result.data;
    } else {
      console.log(`⚠️  Failed to fetch deal ${dealId}:`, result);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error fetching deal ${dealId}:`, error.message);
    return null;
  }
}

// Helper function to update deal product
export async function updateDealProduct(dealId, productAttachmentId, updateData, testConfig) {
  try {
    console.log(`🔄 Updating product attachment ${productAttachmentId} for deal ${dealId}`);
    
    const response = await fetch(
      `https://${testConfig.companyDomain}.pipedrive.com/api/v2/deals/${dealId}/products/${productAttachmentId}?api_token=${testConfig.apiToken}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      }
    );
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Updated product attachment ${productAttachmentId} for deal ${dealId}`);
      return result.data;
    } else {
      console.log(`⚠️  Failed to update deal product:`, result);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error updating deal product:`, error.message);
    return null;
  }
}