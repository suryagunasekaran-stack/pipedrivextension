/**
 * Server Helper Functions
 * 
 * Functions for checking server status and available routes
 */

// Helper function to check if server is running
export async function checkServerRunning(serverUrl) {
  try {
    console.log(`🔍 Checking if server is running at ${serverUrl}...`);
    
    const response = await fetch(serverUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    console.log(`✅ Server is running (status: ${response.status})`);
    
    // Try to get available routes for debugging
    await checkAvailableRoutes(serverUrl);
    
    return true;
  } catch (error) {
    console.log(`❌ Server is not running at ${serverUrl}`);
    console.log(`💡 Please start your server with: npm start`);
    throw new Error(`Server not running. Please start server at ${serverUrl} before running tests.`);
  }
}

// Helper function to check available routes (for debugging)
export async function checkAvailableRoutes(serverUrl) {
  const commonRoutes = [
    '/api/routes',
    '/routes',
    '/api/health',
    '/health',
    '/api/xero',
    '/xero'
  ];
  
  console.log(`🔍 Checking for available routes...`);
  
  for (const route of commonRoutes) {
    try {
      const response = await fetch(`${serverUrl}${route}`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        console.log(`✅ Found route: ${route} (${response.status})`);
      }
    } catch (error) {
      // Route doesn't exist, that's fine
    }
  }
} 