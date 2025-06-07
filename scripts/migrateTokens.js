/**
 * Token Migration Script
 * 
 * Migrates authentication tokens from the file-based system to the new
 * secure database-backed system with encryption.
 * 
 * Usage: npm run migrate-tokens
 * 
 * @module scripts/migrateTokens
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { storeAuthToken } from '../services/secureTokenService.js';
import { ensureCollection } from '../models/mongoSchemas.js';
import { withDatabase } from '../services/mongoService.js';
import logger from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_FILE_PATH = path.join(__dirname, '..', 'tokens.json');
const XERO_TOKEN_FILE_PATH = path.join(__dirname, '..', 'xero_tokens.json');
const BACKUP_DIR = path.join(__dirname, '..', 'token_backups');

/**
 * Creates a backup of existing token files
 */
async function backupTokenFiles() {
    try {
        await fs.mkdir(BACKUP_DIR, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Backup Pipedrive tokens
        try {
            const pipedriveTokens = await fs.readFile(TOKEN_FILE_PATH);
            await fs.writeFile(
                path.join(BACKUP_DIR, `pipedrive_tokens_${timestamp}.json`),
                pipedriveTokens
            );
            logger.info('Pipedrive tokens backed up successfully');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            logger.info('No Pipedrive token file found to backup');
        }
        
        // Backup Xero tokens
        try {
            const xeroTokens = await fs.readFile(XERO_TOKEN_FILE_PATH);
            await fs.writeFile(
                path.join(BACKUP_DIR, `xero_tokens_${timestamp}.json`),
                xeroTokens
            );
            logger.info('Xero tokens backed up successfully');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            logger.info('No Xero token file found to backup');
        }
        
    } catch (error) {
        logger.error('Failed to backup token files', { error: error.message });
        throw error;
    }
}

/**
 * Loads tokens from the legacy file system
 */
async function loadLegacyTokens() {
    const tokens = {
        pipedrive: {},
        xero: {}
    };
    
    // Load Pipedrive tokens
    try {
        const pipedriveData = await fs.readFile(TOKEN_FILE_PATH, 'utf8');
        const pipedriveTokens = JSON.parse(pipedriveData);
        
        for (const [companyId, tokenData] of Object.entries(pipedriveTokens)) {
            // Skip the malformed entries that don't have a company ID as key
            if (companyId !== 'accessToken' && companyId !== 'refreshToken' && 
                companyId !== 'tokenExpiresAt' && companyId !== 'apiDomain') {
                tokens.pipedrive[companyId] = tokenData;
            }
        }
        
        logger.info(`Loaded ${Object.keys(tokens.pipedrive).length} Pipedrive token sets`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            logger.error('Failed to load Pipedrive tokens', { error: error.message });
        } else {
            logger.info('No Pipedrive token file found');
        }
    }
    
    // Load Xero tokens
    try {
        const xeroData = await fs.readFile(XERO_TOKEN_FILE_PATH, 'utf8');
        const xeroTokens = JSON.parse(xeroData);
        tokens.xero = xeroTokens;
        
        logger.info(`Loaded ${Object.keys(tokens.xero).length} Xero token sets`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            logger.error('Failed to load Xero tokens', { error: error.message });
        } else {
            logger.info('No Xero token file found');
        }
    }
    
    return tokens;
}

/**
 * Migrates tokens to the new database system
 */
async function migrateTokensToDatabase(tokens) {
    let migratedCount = 0;
    let errorCount = 0;
    
    // Migrate Pipedrive tokens
    for (const [companyId, tokenData] of Object.entries(tokens.pipedrive)) {
        try {
            await storeAuthToken(companyId, 'pipedrive', {
                accessToken: tokenData.accessToken,
                refreshToken: tokenData.refreshToken,
                apiDomain: tokenData.apiDomain,
                tokenExpiresAt: tokenData.tokenExpiresAt || (Date.now() + 3600000) // Default 1 hour if missing
            });
            migratedCount++;
            logger.info('Migrated Pipedrive tokens', { companyId });
        } catch (error) {
            errorCount++;
            logger.error('Failed to migrate Pipedrive tokens', { 
                companyId, 
                error: error.message 
            });
        }
    }
    
    // Migrate Xero tokens
    for (const [companyId, tokenData] of Object.entries(tokens.xero)) {
        try {
            await storeAuthToken(companyId, 'xero', {
                accessToken: tokenData.accessToken,
                refreshToken: tokenData.refreshToken,
                tenantId: tokenData.tenantId,
                tokenExpiresAt: tokenData.tokenExpiresAt || (Date.now() + 1800000) // Default 30 minutes if missing
            });
            migratedCount++;
            logger.info('Migrated Xero tokens', { companyId });
        } catch (error) {
            errorCount++;
            logger.error('Failed to migrate Xero tokens', { 
                companyId, 
                error: error.message 
            });
        }
    }
    
    return { migratedCount, errorCount };
}

/**
 * Validates the migration by checking that tokens can be retrieved
 */
async function validateMigration(tokens) {
    const { getAuthToken } = await import('../services/secureTokenService.js');
    
    let validatedCount = 0;
    let validationErrors = 0;
    
    // Validate Pipedrive tokens
    for (const companyId of Object.keys(tokens.pipedrive)) {
        try {
            const retrievedToken = await getAuthToken(companyId, 'pipedrive');
            if (retrievedToken && retrievedToken.accessToken) {
                validatedCount++;
                logger.debug('Validated Pipedrive token', { companyId });
            } else {
                validationErrors++;
                logger.error('Failed to retrieve migrated Pipedrive token', { companyId });
            }
        } catch (error) {
            validationErrors++;
            logger.error('Validation error for Pipedrive token', { 
                companyId, 
                error: error.message 
            });
        }
    }
    
    // Validate Xero tokens
    for (const companyId of Object.keys(tokens.xero)) {
        try {
            const retrievedToken = await getAuthToken(companyId, 'xero');
            if (retrievedToken && retrievedToken.accessToken) {
                validatedCount++;
                logger.debug('Validated Xero token', { companyId });
            } else {
                validationErrors++;
                logger.error('Failed to retrieve migrated Xero token', { companyId });
            }
        } catch (error) {
            validationErrors++;
            logger.error('Validation error for Xero token', { 
                companyId, 
                error: error.message 
            });
        }
    }
    
    return { validatedCount, validationErrors };
}

/**
 * Main migration function
 */
async function main() {
    logger.info('Starting token migration process');
    
    try {
        // Initialize database and ensure collection exists
        await withDatabase(async (db) => {
            logger.info('Connected to database');
            
            // Ensure auth_tokens collection exists
            await ensureCollection(db, 'auth_tokens');
            logger.info('Auth tokens collection ready');
        });
        
        // Create backup of existing files
        await backupTokenFiles();
        
        // Load legacy tokens
        const tokens = await loadLegacyTokens();
        const totalTokens = Object.keys(tokens.pipedrive).length + Object.keys(tokens.xero).length;
        
        if (totalTokens === 0) {
            logger.info('No tokens found to migrate');
            return;
        }
        
        logger.info(`Found ${totalTokens} token sets to migrate`);
        
        // Migrate tokens
        const { migratedCount, errorCount } = await migrateTokensToDatabase(tokens);
        
        logger.info('Migration completed', {
            totalTokens,
            migratedCount,
            errorCount,
            successRate: `${((migratedCount / totalTokens) * 100).toFixed(1)}%`
        });
        
        // Validate migration
        logger.info('Starting migration validation');
        const { validatedCount, validationErrors } = await validateMigration(tokens);
        
        logger.info('Validation completed', {
            validatedCount,
            validationErrors,
            validationSuccessRate: `${((validatedCount / migratedCount) * 100).toFixed(1)}%`
        });
        
        if (errorCount === 0 && validationErrors === 0) {
            logger.info('Migration completed successfully! All tokens migrated and validated.');
            logger.info('You can now safely switch to the new token service.');
            logger.info('Original token files have been backed up in the token_backups directory.');
        } else {
            logger.warn('Migration completed with errors. Please review the logs before switching to the new system.');
        }
        
    } catch (error) {
        logger.error('Migration failed', { error: error.message });
        process.exit(1);
    }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        logger.error('Migration script failed', { error: error.message });
        process.exit(1);
    });
}

export { main as migrateTokens }; 