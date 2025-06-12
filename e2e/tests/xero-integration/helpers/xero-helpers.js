/**
 * Xero Helper Functions
 * 
 * Functions for interacting with Xero API (quotes, cleanup)
 */

// Helper function to create Xero quote via API
export async function createXeroQuote(dealId, companyId, serverUrl) {
  const endpoint = '/api/xero/create-quote';
  
  try {
    console.log(`🔄 Creating Xero quote using: ${serverUrl}${endpoint}`);
    console.log(`📋 Request body:`, { 
      pipedriveDealId: dealId, 
      pipedriveCompanyId: companyId,
      dealIdType: typeof dealId,
      companyIdType: typeof companyId
    });
    
    const response = await fetch(`${serverUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pipedriveDealId: dealId,
        pipedriveCompanyId: companyId
      })
    });

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    
    let result;
    try {
      result = await response.json();
      console.log(`📋 Response body:`, result);
    } catch (parseError) {
      console.log(`❌ Failed to parse response as JSON:`, parseError.message);
      const textResult = await response.text();
      console.log(`📋 Raw response:`, textResult);
      return null;
    }
    
    if (response.ok) {
      console.log(`✅ Xero quote created successfully`);
      console.log(`📋 Quote Number: ${result.quoteNumber}`);
      console.log(`📋 Quote ID: ${result.quoteId}`);
      return result;
    } else {
      console.log(`❌ Failed to create Xero quote - Status: ${response.status}`);
      console.log(`📋 Error details:`, result);
      return null;
    }
  } catch (error) {
    console.log(`❌ Network error:`, error.message);
    console.log(`❌ Error stack:`, error.stack);
    return null;
  }
}

// Helper function to get Xero quote using backend endpoint
export async function getXeroQuoteByNumber(quoteNumber, serverUrl) {
  try {
    console.log(`🔍 Fetching Xero quote via backend: ${quoteNumber}`);
    
    const response = await fetch(`${serverUrl}/api/test/xero/quote/${quoteNumber}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`📡 Backend response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Backend error:`, errorText);
      return null;
    }

    const result = await response.json();
    console.log(`📋 Backend response:`, {
      quoteNumber: result.QuoteNumber,
      quoteId: result.QuoteID,
      status: result.Status,
      total: result.Total,
      lineItems: result.LineItems?.length || 0
    });
    
    if (result.QuoteNumber === quoteNumber) {
      console.log(`✅ Found Xero quote via backend: ${result.QuoteNumber}`);
      return result;
    }
    
    console.log(`⚠️  Quote number mismatch: expected ${quoteNumber}, got ${result.QuoteNumber}`);
    return null;
  } catch (error) {
    console.log(`❌ Error fetching Xero quote via backend:`, error.message);
    return null;
  }
}

// Helper function to get Xero quote using backend endpoint by ID
export async function getXeroQuoteById(quoteId, serverUrl) {
  try {
    console.log(`🔍 Fetching Xero quote by ID via backend: ${quoteId}`);
    
    const response = await fetch(`${serverUrl}/api/test/xero/quote-by-id/${quoteId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`📡 Backend response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Backend error:`, errorText);
      return null;
    }

    const result = await response.json();
    console.log(`📋 Backend response:`, {
      quoteNumber: result.QuoteNumber,
      quoteId: result.QuoteID,
      status: result.Status,
      total: result.Total,
      lineItems: result.LineItems?.length || 0
    });
    
    if (result.QuoteID === quoteId) {
      console.log(`✅ Found Xero quote by ID via backend: ${result.QuoteNumber} (ID: ${result.QuoteID})`);
      return result;
    }
    
    console.log(`⚠️  Quote ID mismatch: expected ${quoteId}, got ${result.QuoteID}`);
    return null;
  } catch (error) {
    console.log(`❌ Error fetching Xero quote by ID via backend:`, error.message);
    return null;
  }
}

// Helper function to cleanup Xero quotes
export async function cleanupXeroQuotes(createdXeroQuoteIds, serverUrl) {
  if (createdXeroQuoteIds.length === 0) {
    console.log('🧹 No Xero quotes to cleanup');
    return;
  }

  console.log(`🧹 Cleaning up ${createdXeroQuoteIds.length} created Xero quotes...`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const quoteId of createdXeroQuoteIds) {
    try {
      console.log(`🗑️  Deleting Xero quote ID: ${quoteId}...`);
      
      const deleteResponse = await fetch(`${serverUrl}/api/test/xero/quote/${quoteId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (deleteResponse.ok) {
        const result = await deleteResponse.json();
        console.log(`✅ Successfully deleted Xero quote: ${result.deletedQuote?.QuoteNumber || quoteId}`);
        successCount++;
      } else {
        const errorResult = await deleteResponse.json();
        console.log(`⚠️  Failed to delete Xero quote ID: ${quoteId} - Status: ${deleteResponse.status}`, errorResult);
        failCount++;
      }
    } catch (error) {
      console.log(`❌ Error deleting Xero quote ID: ${quoteId}:`, error.message);
      failCount++;
    }
  }
  
  console.log(`🧹 Xero cleanup complete: ${successCount} deleted, ${failCount} failed`);
} 