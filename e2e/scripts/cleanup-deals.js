#!/usr/bin/env node

/**
 * Cleanup Script for E2E Test Deals
 * 
 * Standalone script to delete all deals with "e2e test" in the title
 * Usage: node e2e/scripts/cleanup-deals.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

async function cleanupAllE2EDeals() {
  const apiToken = process.env.TEST_PIPEDRIVE_API_TOKEN;
  const companyDomain = process.env.TEST_PIPEDRIVE_COMPANY_DOMAIN;

  if (!apiToken || !companyDomain) {
    console.error('❌ Missing required environment variables:');
    console.error('   TEST_PIPEDRIVE_API_TOKEN');
    console.error('   TEST_PIPEDRIVE_COMPANY_DOMAIN');
    console.error('💡 Run: npm run test:e2e:setup first');
    process.exit(1);
  }

  console.log('🔍 Searching for all e2e test deals...');
  
  try {
    // Search for deals with "e2e test" in title
    const searchResponse = await fetch(
      `https://${companyDomain}.pipedrive.com/v1/deals/search?term=e2e test&api_token=${apiToken}`
    );
    
    const searchResult = await searchResponse.json();
    
    if (!searchResponse.ok) {
      console.error('❌ Failed to search deals:', searchResult);
      process.exit(1);
    }
    
    if (searchResult.success && searchResult.data && searchResult.data.items) {
      const e2eDeals = searchResult.data.items;
      console.log(`🎯 Found ${e2eDeals.length} e2e test deals`);
      
      if (e2eDeals.length === 0) {
        console.log('✅ No e2e test deals to cleanup');
        return;
      }

      // Ask for confirmation
      const { createInterface } = await import('readline');
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        rl.question(`🗑️  Delete ${e2eDeals.length} e2e test deals? (y/N): `, resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('⏭️  Cleanup cancelled');
        return;
      }
      
      let deletedCount = 0;
      let failedCount = 0;

      for (const dealItem of e2eDeals) {
        const dealId = dealItem.item.id;
        const dealTitle = dealItem.item.title;
        
        try {
          const deleteResponse = await fetch(
            `https://${companyDomain}.pipedrive.com/v1/deals/${dealId}?api_token=${apiToken}`,
            { method: 'DELETE' }
          );
          
          if (deleteResponse.ok) {
            console.log(`✅ Deleted: "${dealTitle}" (ID: ${dealId})`);
            deletedCount++;
          } else {
            console.log(`⚠️  Failed to delete: "${dealTitle}" (ID: ${dealId})`);
            failedCount++;
          }
        } catch (error) {
          console.log(`❌ Error deleting deal "${dealTitle}":`, error.message);
          failedCount++;
        }
      }
      
      console.log(`\n🧹 Cleanup complete:`);
      console.log(`   ✅ Deleted: ${deletedCount} deals`);
      console.log(`   ❌ Failed: ${failedCount} deals`);
    } else {
      console.log('📭 No e2e test deals found');
    }
  } catch (error) {
    console.error('❌ Error during mass cleanup:', error.message);
    process.exit(1);
  }
}

// Run cleanup
cleanupAllE2EDeals().catch(console.error); 