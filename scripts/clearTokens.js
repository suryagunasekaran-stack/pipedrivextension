#!/usr/bin/env node

/**
 * Token Cleanup Script
 * 
 * Removes all authentication tokens from the database to enable proper testing
 * of authentication flows. This script helps when testing auth functions by
 * ensuring the frontend doesn't automatically route to success due to existing tokens.
 * 
 * Usage: 
 *   npm run clear-tokens              # Remove all tokens
 *   npm run clear-tokens -- --company 12345  # Remove tokens for specific company
 *   npm run clear-tokens -- --service pipedrive  # Remove tokens for specific service
 *   npm run clear-tokens -- --dry-run  # Show what would be deleted without deleting
 * 
 * @module scripts/clearTokens
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { cleanupExpiredTokens, getAuthStatistics } from '../services/secureTokenService.js';
import { withDatabase } from '../services/mongoService.js';
import logger from '../lib/logger.js';

class TokenCleanup {
    constructor() {
        this.dryRun = false;
        this.companyFilter = null;
        this.serviceFilter = null;
    }

    /**
     * Parse command line arguments
     */
    parseArguments() {
        const args = process.argv.slice(2);
        
        for (let i = 0; i < args.length; i++) {
            switch (args[i]) {
                case '--dry-run':
                    this.dryRun = true;
                    break;
                case '--company':
                    this.companyFilter = args[++i];
                    break;
                case '--service':
                    this.serviceFilter = args[++i];
                    if (!['pipedrive', 'xero'].includes(this.serviceFilter)) {
                        console.error('❌ Service must be either "pipedrive" or "xero"');
                        process.exit(1);
                    }
                    break;
                case '--help':
                case '-h':
                    this.showHelp();
                    process.exit(0);
                    break;
            }
        }
    }

    /**
     * Show help information
     */
    showHelp() {
        console.log(`
🗑️  Token Cleanup Script

This script removes authentication tokens from the database to enable proper 
testing of authentication flows.

Usage:
  node scripts/clearTokens.js [options]

Options:
  --dry-run              Show what would be deleted without actually deleting
  --company <id>         Only remove tokens for specific company ID
  --service <name>       Only remove tokens for specific service (pipedrive/xero)
  --help, -h            Show this help message

Examples:
  node scripts/clearTokens.js                     # Remove all tokens
  node scripts/clearTokens.js --dry-run          # Preview what would be deleted
  node scripts/clearTokens.js --company 12345    # Remove tokens for company 12345
  node scripts/clearTokens.js --service pipedrive # Remove all Pipedrive tokens
        `);
    }

    /**
     * Execute database operation with proper connection management
     * @param {Function} operation - Database operation to execute
     * @returns {Promise<any>} Result of the operation
     */
    async executeWithDatabase(operation) {
        return withDatabase(async (db) => {
            const collection = db.collection('auth_tokens');
            return await operation(collection, db);
        });
    }

    /**
     * Build the filter query based on provided arguments
     */
    buildFilter() {
        const filter = {};
        
        if (this.companyFilter) {
            filter.companyId = this.companyFilter.toString();
        }
        
        if (this.serviceFilter) {
            filter.service = this.serviceFilter;
        }

        return filter;
    }

    /**
     * Show current token statistics
     */
    async showTokenStats() {
        try {
            console.log('\n📊 Current Token Statistics:');
            
            const stats = await getAuthStatistics();
            console.log(`  Total tokens: ${stats.totalTokens}`);
            console.log(`  Active tokens: ${stats.activeTokens}`);
            console.log(`  Recent activity (24h): ${stats.recentActivity}`);
            console.log(`  Cache size: ${stats.cacheSize}`);
            
            if (stats.tokensByService && Object.keys(stats.tokensByService).length > 0) {
                console.log('  Tokens by service:');
                Object.entries(stats.tokensByService).forEach(([service, count]) => {
                    console.log(`    ${service}: ${count}`);
                });
            }
            
            console.log('');
        } catch (error) {
            console.error('❌ Failed to get token statistics:', error.message);
        }
    }

    /**
     * Preview what tokens would be deleted
     */
    async previewDeletion() {
        const filter = this.buildFilter();
        
        try {
            return await this.executeWithDatabase(async (collection) => {
                const tokensToDelete = await collection.find(filter).toArray();
                
                if (tokensToDelete.length === 0) {
                    console.log('📭 No tokens found matching the criteria');
                    return 0;
                }
                
                console.log(`\n🔍 Found ${tokensToDelete.length} token(s) to delete:`);
                
                tokensToDelete.forEach((token, index) => {
                    console.log(`  ${index + 1}. Company: ${token.companyId}, Service: ${token.service}`);
                    console.log(`     Active: ${token.isActive}, Created: ${token.createdAt?.toISOString()}`);
                    console.log(`     Last Used: ${token.lastUsedAt?.toISOString()}`);
                    if (token.apiDomain) console.log(`     API Domain: ${token.apiDomain}`);
                    if (token.tenantId) console.log(`     Tenant ID: ${token.tenantId}`);
                    console.log('');
                });
                
                return tokensToDelete.length;
            });
        } catch (error) {
            console.error('❌ Failed to preview tokens:', error.message);
            throw error;
        }
    }

    /**
     * Delete tokens based on filter
     */
    async deleteTokens() {
        const filter = this.buildFilter();
        
        try {
            if (this.dryRun) {
                return await this.previewDeletion();
            }
            
            // First show what will be deleted
            const previewCount = await this.previewDeletion();
            
            if (previewCount === 0) {
                return 0;
            }
            
            // Perform the deletion
            return await this.executeWithDatabase(async (collection) => {
                const result = await collection.deleteMany(filter);
                
                console.log(`✅ Successfully deleted ${result.deletedCount} token(s)`);
                
                // Log the deletion
                logger.info('Tokens deleted via script', {
                    deletedCount: result.deletedCount,
                    filter,
                    timestamp: new Date().toISOString()
                });
                
                return result.deletedCount;
            });
            
        } catch (error) {
            console.error('❌ Failed to delete tokens:', error.message);
            logger.error('Token deletion failed', { error: error.message, filter });
            throw error;
        }
    }

    /**
     * Clear token cache
     */
    async clearCache() {
        try {
            // Import the cache clearing functionality
            const tokenService = await import('../services/secureTokenService.js');
            
            // Clear the in-memory cache by calling cleanup
            await cleanupExpiredTokens();
            
            console.log('✅ Token cache cleared');
        } catch (error) {
            console.error('⚠️  Could not clear token cache:', error.message);
        }
    }

    /**
     * Deactivate tokens instead of deleting them (safer option)
     */
    async deactivateTokens() {
        const filter = this.buildFilter();
        filter.isActive = true; // Only deactivate active tokens
        
        try {
            if (this.dryRun) {
                return await this.executeWithDatabase(async (collection) => {
                    const tokensToDeactivate = await collection.find(filter).toArray();
                    console.log(`\n🔍 Would deactivate ${tokensToDeactivate.length} active token(s)`);
                    return tokensToDeactivate.length;
                });
            }
            
            return await this.executeWithDatabase(async (collection) => {
                const result = await collection.updateMany(
                    filter,
                    { 
                        $set: { 
                            isActive: false, 
                            lastUsedAt: new Date() 
                        } 
                    }
                );
                
                console.log(`✅ Successfully deactivated ${result.modifiedCount} token(s)`);
                
                logger.info('Tokens deactivated via script', {
                    deactivatedCount: result.modifiedCount,
                    filter,
                    timestamp: new Date().toISOString()
                });
                
                return result.modifiedCount;
            });
            
        } catch (error) {
            console.error('❌ Failed to deactivate tokens:', error.message);
            throw error;
        }
    }

    /**
     * Main execution function
     */
    async run() {
        try {
            this.parseArguments();
            
            console.log('🗑️  Token Cleanup Script Starting...\n');
            
            if (this.dryRun) {
                console.log('🔍 DRY RUN MODE - No tokens will be deleted\n');
            }
            
            await this.showTokenStats();
            
            const deletedCount = await this.deleteTokens();
            
            if (deletedCount > 0 && !this.dryRun) {
                await this.clearCache();
                
                console.log('\n📊 Updated Token Statistics:');
                await this.showTokenStats();
            }
            
            if (this.dryRun && deletedCount > 0) {
                console.log('💡 To actually delete these tokens, run the command without --dry-run');
            } else if (deletedCount === 0) {
                console.log('✨ No tokens needed to be deleted');
            }
            
            console.log('✅ Token cleanup completed successfully');
            
        } catch (error) {
            console.error('❌ Token cleanup failed:', error.message);
            process.exit(1);
        }
    }

    /**
     * Run alternative deactivation instead of deletion
     */
    async runDeactivate() {
        try {
            this.parseArguments();
            
            console.log('🔒 Token Deactivation Script Starting...\n');
            
            if (this.dryRun) {
                console.log('🔍 DRY RUN MODE - No tokens will be deactivated\n');
            }
            
            await this.showTokenStats();
            
            const deactivatedCount = await this.deactivateTokens();
            
            if (deactivatedCount > 0 && !this.dryRun) {
                await this.clearCache();
                
                console.log('\n📊 Updated Token Statistics:');
                await this.showTokenStats();
            }
            
            console.log('✅ Token deactivation completed successfully');
            
        } catch (error) {
            console.error('❌ Token deactivation failed:', error.message);
            process.exit(1);
        }
    }
}

// Check if running as main module
if (import.meta.url === `file://${process.argv[1]}`) {
    const cleanup = new TokenCleanup();
    
    // Check if deactivate mode is requested
    if (process.argv.includes('--deactivate')) {
        await cleanup.runDeactivate();
    } else {
        await cleanup.run();
    }
} 