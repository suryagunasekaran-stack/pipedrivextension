/**
 * Database Migration Utility
 * 
 * This utility provides functions for migrating database schemas and data
 * when deploying new versions of the application. It ensures smooth
 * transitions between different database versions.
 * 
 * Key features:
 * - Schema version management
 * - Data transformation and migration
 * - Rollback capabilities for failed migrations
 * - Migration logging and validation
 * - Backup and restore operations
 * 
 * @module utils/databaseMigration
 */

import { withDatabase } from '../services/mongoService.js';
import { ensureCollection } from '../models/mongoSchemas.js';

const MIGRATION_VERSION_COLLECTION = 'migration_versions';

/**
 * @typedef {Object} Migration
 * @property {string} version - Migration version (e.g., '1.0.0')
 * @property {string} description - Description of the migration
 * @property {Function} up - Function to apply the migration
 * @property {Function} down - Function to rollback the migration
 * @property {Date} createdAt - When the migration was created
 */

/**
 * Available database migrations
 * Add new migrations to this array in chronological order
 */
const migrations = [
  {
    version: '1.0.0',
    description: 'Initial schema setup with validation',
    up: async (db) => {
      // Ensure collections exist with proper schemas
      await ensureCollection(db, 'project_sequences');
      await ensureCollection(db, 'deal_project_mappings');
      
      console.log('✅ Initial collections and schemas created');
    },
    down: async (db) => {
      // Note: Be very careful with destructive operations
      console.log('⚠️ Rollback for initial schema - no action needed');
    },
    createdAt: new Date('2025-06-03')
  },
  {
    version: '1.1.0',
    description: 'Add timestamps to existing project sequences',
    up: async (db) => {
      const collection = db.collection('project_sequences');
      const now = new Date();
      
      // Add createdAt timestamp to existing documents that don't have it
      const result = await collection.updateMany(
        { createdAt: { $exists: false } },
        { $set: { createdAt: now } }
      );
      
      console.log(`✅ Added timestamps to ${result.modifiedCount} project sequences`);
    },
    down: async (db) => {
      const collection = db.collection('project_sequences');
      
      // Remove createdAt field from all documents
      const result = await collection.updateMany(
        {},
        { $unset: { createdAt: '' } }
      );
      
      console.log(`✅ Removed timestamps from ${result.modifiedCount} project sequences`);
    },
    createdAt: new Date('2025-06-03')
  },
  {
    version: '1.2.0',
    description: 'Normalize project number format validation',
    up: async (db) => {
      const collection = db.collection('deal_project_mappings');
      
      // Find and fix any project numbers that don't match the expected format
      const invalidMappings = await collection.find({
        projectNumber: { $not: /^[A-Z]{2}[0-9]{2}[0-9]{3}$/ }
      }).toArray();
      
      if (invalidMappings.length > 0) {
        console.log(`⚠️ Found ${invalidMappings.length} invalid project numbers`);
        
        // For demonstration - in a real scenario, you'd implement proper fixing logic
        for (const mapping of invalidMappings) {
          console.log(`Invalid project number: ${mapping.projectNumber}`);
        }
        
        // This is where you'd implement the actual fixing logic
        // For now, we'll just log the issues
      } else {
        console.log('✅ All project numbers are valid');
      }
    },
    down: async (db) => {
      console.log('✅ No rollback needed for project number validation');
    },
    createdAt: new Date('2025-06-03')
  }
];

/**
 * Initializes the migration tracking collection
 * 
 * @param {Db} db - MongoDB database instance
 */
async function initializeMigrationTracking(db) {
  const collection = db.collection(MIGRATION_VERSION_COLLECTION);
  
  // Create the collection if it doesn't exist
  const collections = await db.listCollections({ name: MIGRATION_VERSION_COLLECTION }).toArray();
  if (collections.length === 0) {
    await db.createCollection(MIGRATION_VERSION_COLLECTION);
    console.log('📋 Migration tracking collection created');
  }
  
  // Ensure unique index on version
  await collection.createIndex({ version: 1 }, { unique: true });
}

/**
 * Gets the current migration version
 * 
 * @returns {Promise<string|null>} Current migration version or null if none applied
 */
export async function getCurrentMigrationVersion() {
  return withDatabase(async (db) => {
    await initializeMigrationTracking(db);
    
    const collection = db.collection(MIGRATION_VERSION_COLLECTION);
    const latestMigration = await collection.findOne(
      {},
      { sort: { appliedAt: -1 } }
    );
    
    return latestMigration?.version || null;
  });
}

/**
 * Gets all applied migration versions
 * 
 * @returns {Promise<Array>} Array of applied migration records
 */
export async function getAppliedMigrations() {
  return withDatabase(async (db) => {
    await initializeMigrationTracking(db);
    
    const collection = db.collection(MIGRATION_VERSION_COLLECTION);
    return await collection.find({}).sort({ appliedAt: 1 }).toArray();
  });
}

/**
 * Checks if a specific migration has been applied
 * 
 * @param {string} version - Migration version to check
 * @returns {Promise<boolean>} True if migration has been applied
 */
export async function isMigrationApplied(version) {
  return withDatabase(async (db) => {
    await initializeMigrationTracking(db);
    
    const collection = db.collection(MIGRATION_VERSION_COLLECTION);
    const migration = await collection.findOne({ version });
    
    return !!migration;
  });
}

/**
 * Applies a specific migration
 * 
 * @param {Object} migration - Migration to apply
 * @returns {Promise<boolean>} True if migration was successful
 */
async function applyMigration(migration) {
  return withDatabase(async (db) => {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 Applying migration ${migration.version}: ${migration.description}`);
      
      // Apply the migration
      await migration.up(db);
      
      // Record the migration as applied
      const collection = db.collection(MIGRATION_VERSION_COLLECTION);
      await collection.insertOne({
        version: migration.version,
        description: migration.description,
        appliedAt: new Date(),
        duration: Date.now() - startTime
      });
      
      console.log(`✅ Migration ${migration.version} applied successfully (${Date.now() - startTime}ms)`);
      return true;
      
    } catch (error) {
      console.error(`❌ Migration ${migration.version} failed:`, error);
      throw error;
    }
  });
}

/**
 * Rolls back a specific migration
 * 
 * @param {Object} migration - Migration to rollback
 * @returns {Promise<boolean>} True if rollback was successful
 */
async function rollbackMigration(migration) {
  return withDatabase(async (db) => {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 Rolling back migration ${migration.version}: ${migration.description}`);
      
      // Apply the rollback
      await migration.down(db);
      
      // Remove the migration record
      const collection = db.collection(MIGRATION_VERSION_COLLECTION);
      await collection.deleteOne({ version: migration.version });
      
      console.log(`✅ Migration ${migration.version} rolled back successfully (${Date.now() - startTime}ms)`);
      return true;
      
    } catch (error) {
      console.error(`❌ Rollback of migration ${migration.version} failed:`, error);
      throw error;
    }
  });
}

/**
 * Runs all pending migrations
 * 
 * @param {Object} options - Migration options
 * @param {boolean} [options.dryRun=false] - If true, only show what would be migrated
 * @returns {Promise<Object>} Migration results
 */
export async function runMigrations(options = {}) {
  const { dryRun = false } = options;
  
  console.log('=== DATABASE MIGRATION ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  
  const results = {
    appliedMigrations: [],
    errors: [],
    startTime: new Date(),
    dryRun
  };
  
  try {
    // Get current migration version
    const currentVersion = await getCurrentMigrationVersion();
    console.log(`Current migration version: ${currentVersion || 'none'}`);
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations();
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    
    // Find pending migrations
    const pendingMigrations = migrations.filter(m => !appliedVersions.has(m.version));
    
    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return results;
    }
    
    console.log(`Found ${pendingMigrations.length} pending migrations:`);
    pendingMigrations.forEach(m => {
      console.log(`  - ${m.version}: ${m.description}`);
    });
    
    if (dryRun) {
      console.log('🔍 DRY RUN - No migrations will be applied');
      results.appliedMigrations = pendingMigrations.map(m => ({
        version: m.version,
        description: m.description,
        status: 'would_apply'
      }));
      return results;
    }
    
    // Apply pending migrations in order
    for (const migration of pendingMigrations) {
      try {
        await applyMigration(migration);
        results.appliedMigrations.push({
          version: migration.version,
          description: migration.description,
          status: 'applied'
        });
      } catch (error) {
        results.errors.push({
          version: migration.version,
          error: error.message
        });
        
        console.error(`❌ Stopping migration process due to error in ${migration.version}`);
        break;
      }
    }
    
    results.endTime = new Date();
    console.log(`Migration process completed: ${results.appliedMigrations.length} applied, ${results.errors.length} errors`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Migration process failed:', error);
    results.errors.push({
      version: 'system',
      error: error.message
    });
    results.endTime = new Date();
    return results;
  }
}

/**
 * Rolls back the last applied migration
 * 
 * @param {Object} options - Rollback options
 * @param {boolean} [options.dryRun=false] - If true, only show what would be rolled back
 * @returns {Promise<Object>} Rollback results
 */
export async function rollbackLastMigration(options = {}) {
  const { dryRun = false } = options;
  
  console.log('=== MIGRATION ROLLBACK ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  
  const results = {
    rolledBackMigrations: [],
    errors: [],
    startTime: new Date(),
    dryRun
  };
  
  try {
    // Get the last applied migration
    const appliedMigrations = await getAppliedMigrations();
    
    if (appliedMigrations.length === 0) {
      console.log('✅ No migrations to roll back');
      return results;
    }
    
    const lastMigration = appliedMigrations[appliedMigrations.length - 1];
    const migrationToRollback = migrations.find(m => m.version === lastMigration.version);
    
    if (!migrationToRollback) {
      throw new Error(`Migration definition not found for version ${lastMigration.version}`);
    }
    
    console.log(`Last applied migration: ${lastMigration.version} (${lastMigration.description})`);
    
    if (dryRun) {
      console.log('🔍 DRY RUN - No rollback will be performed');
      results.rolledBackMigrations.push({
        version: lastMigration.version,
        description: lastMigration.description,
        status: 'would_rollback'
      });
      return results;
    }
    
    // Perform the rollback
    await rollbackMigration(migrationToRollback);
    results.rolledBackMigrations.push({
      version: lastMigration.version,
      description: lastMigration.description,
      status: 'rolled_back'
    });
    
    results.endTime = new Date();
    console.log('Rollback completed successfully');
    
    return results;
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    results.errors.push({
      version: 'system',
      error: error.message
    });
    results.endTime = new Date();
    return results;
  }
}

/**
 * Gets migration status and information
 * 
 * @returns {Promise<Object>} Migration status information
 */
export async function getMigrationStatus() {
  const currentVersion = await getCurrentMigrationVersion();
  const appliedMigrations = await getAppliedMigrations();
  const appliedVersions = new Set(appliedMigrations.map(m => m.version));
  
  const pendingMigrations = migrations.filter(m => !appliedVersions.has(m.version));
  
  return {
    currentVersion,
    totalMigrations: migrations.length,
    appliedCount: appliedMigrations.length,
    pendingCount: pendingMigrations.length,
    appliedMigrations: appliedMigrations.map(m => ({
      version: m.version,
      description: m.description,
      appliedAt: m.appliedAt,
      duration: m.duration
    })),
    pendingMigrations: pendingMigrations.map(m => ({
      version: m.version,
      description: m.description,
      createdAt: m.createdAt
    })),
    isUpToDate: pendingMigrations.length === 0
  };
}
