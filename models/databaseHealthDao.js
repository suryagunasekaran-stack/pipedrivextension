/**
 * Database Health and Analytics Data Access Object (DAO)
 * 
 * This module provides data access methods for database health monitoring,
 * analytics, and administrative operations. It uses the improved connection
 * management system for reliable database access.
 * 
 * Key features:
 * - Database health monitoring and metrics
 * - Collection statistics and performance data
 * - Data consistency validation
 * - Administrative cleanup operations
 * - Query performance analysis
 * 
 * @module models/databaseHealthDao
 */

import { withDatabase } from '../services/mongoService.js';
import { ensureCollection } from './mongoSchemas.js';

/**
 * Gets comprehensive database health information
 * 
 * @returns {Promise<Object>} Database health metrics and status
 */
export async function getDatabaseHealth() {
  return withDatabase(async (db, client) => {
    const healthData = {
      timestamp: new Date(),
      server: {},
      database: {},
      collections: {},
      performance: {}
    };

    try {
      // Server information
      const serverStatus = await db.admin().serverStatus();
      healthData.server = {
        version: serverStatus.version,
        uptime: serverStatus.uptime,
        connections: serverStatus.connections,
        memory: {
          resident: serverStatus.mem?.resident,
          virtual: serverStatus.mem?.virtual,
          mapped: serverStatus.mem?.mapped
        },
        opcounters: serverStatus.opcounters
      };

      // Database statistics
      const dbStats = await db.stats();
      healthData.database = {
        name: db.databaseName,
        collections: dbStats.collections,
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        indexes: dbStats.indexes,
        indexSize: dbStats.indexSize,
        avgObjSize: dbStats.avgObjSize
      };

      // Collection-specific health
      const projectSequencesHealth = await getCollectionHealth(db, 'project_sequences');
      const dealMappingsHealth = await getCollectionHealth(db, 'deal_project_mappings');
      
      healthData.collections = {
        project_sequences: projectSequencesHealth,
        deal_project_mappings: dealMappingsHealth
      };

      // Performance metrics
      healthData.performance = await getPerformanceMetrics(db);

      return healthData;
    } catch (error) {
      console.error('Error collecting database health data:', error);
      throw new Error(`Database health check failed: ${error.message}`);
    }
  });
}

/**
 * Gets health information for a specific collection
 * 
 * @param {Db} db - MongoDB database instance
 * @param {string} collectionName - Name of the collection to analyze
 * @returns {Promise<Object>} Collection health information
 */
async function getCollectionHealth(db, collectionName) {
  try {
    const collection = await ensureCollection(db, collectionName);
    
    // Collection statistics
    const stats = await db.command({ collStats: collectionName });
    
    // Document count and recent activity
    const totalDocs = await collection.countDocuments();
    const recentDocs = await collection.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    });

    // Index usage statistics
    const indexStats = await collection.aggregate([
      { $indexStats: {} }
    ]).toArray();

    return {
      documentCount: totalDocs,
      recentDocuments: recentDocs,
      size: stats.size,
      storageSize: stats.storageSize,
      avgObjSize: stats.avgObjSize,
      indexCount: stats.nindexes,
      totalIndexSize: stats.totalIndexSize,
      indexUsage: indexStats,
      capped: stats.capped || false
    };
  } catch (error) {
    console.warn(`Could not get health data for collection ${collectionName}:`, error.message);
    return {
      error: error.message,
      accessible: false
    };
  }
}

/**
 * Gets performance metrics for database operations
 * 
 * @param {Db} db - MongoDB database instance
 * @returns {Promise<Object>} Performance metrics
 */
async function getPerformanceMetrics(db) {
  try {
    // Get current operations that might be slow
    const currentOps = await db.admin().command({ currentOp: true, microsecs_running: { $gte: 1000 } });
    
    // Get profiler data if available (requires profiling to be enabled)
    let slowQueries = [];
    try {
      const profileCollection = db.collection('system.profile');
      slowQueries = await profileCollection.find()
        .sort({ ts: -1 })
        .limit(10)
        .toArray();
    } catch (profileError) {
      // Profiling might not be enabled, which is fine
    }

    return {
      currentOperations: currentOps.inprog?.length || 0,
      slowQueries: slowQueries.length,
      recentSlowQueries: slowQueries.slice(0, 5).map(op => ({
        operation: op.command,
        duration: op.millis,
        timestamp: op.ts
      }))
    };
  } catch (error) {
    console.warn('Could not collect performance metrics:', error.message);
    return {
      error: error.message,
      available: false
    };
  }
}

/**
 * Validates data consistency across collections
 * 
 * @returns {Promise<Object>} Data consistency validation results
 */
export async function validateDataConsistency() {
  return withDatabase(async (db) => {
    const validationResults = {
      timestamp: new Date(),
      issues: [],
      summary: {
        orphanedMappings: 0,
        invalidProjectNumbers: 0,
        duplicateSequences: 0,
        missingSequences: 0
      }
    };

    try {
      // Check for orphaned project mappings (invalid project number format)
      const mappingsCollection = await ensureCollection(db, 'deal_project_mappings');
      const invalidMappings = await mappingsCollection.find({
        projectNumber: { $not: /^[A-Z]{2}[0-9]{2}[0-9]{3}$/ }
      }).toArray();

      validationResults.summary.invalidProjectNumbers = invalidMappings.length;
      if (invalidMappings.length > 0) {
        validationResults.issues.push({
          type: 'invalid_project_numbers',
          count: invalidMappings.length,
          examples: invalidMappings.slice(0, 3).map(m => m.projectNumber)
        });
      }

      // Check for empty deal ID arrays
      const emptyMappings = await mappingsCollection.find({
        $or: [
          { pipedriveDealIds: { $size: 0 } },
          { pipedriveDealIds: { $exists: false } }
        ]
      }).toArray();

      validationResults.summary.orphanedMappings = emptyMappings.length;
      if (emptyMappings.length > 0) {
        validationResults.issues.push({
          type: 'orphaned_mappings',
          count: emptyMappings.length,
          description: 'Project mappings without associated deal IDs'
        });
      }

      // Check for sequence number integrity
      const sequencesCollection = await ensureCollection(db, 'project_sequences');
      const allSequences = await sequencesCollection.find().toArray();
      
      // Validate that each department/year has a corresponding sequence
      const allMappings = await mappingsCollection.find().toArray();
      const usedDepartmentYears = new Set();
      
      allMappings.forEach(mapping => {
        usedDepartmentYears.add(`${mapping.departmentCode}-${mapping.year}`);
      });

      const existingSequenceKeys = new Set();
      allSequences.forEach(seq => {
        existingSequenceKeys.add(`${seq.departmentCode}-${seq.year}`);
      });

      const missingSequences = [...usedDepartmentYears].filter(
        key => !existingSequenceKeys.has(key)
      );

      validationResults.summary.missingSequences = missingSequences.length;
      if (missingSequences.length > 0) {
        validationResults.issues.push({
          type: 'missing_sequences',
          count: missingSequences.length,
          missing: missingSequences
        });
      }

      return validationResults;
    } catch (error) {
      console.error('Error validating data consistency:', error);
      throw new Error(`Data consistency validation failed: ${error.message}`);
    }
  });
}

/**
 * Performs comprehensive database cleanup
 * 
 * @param {Object} options - Cleanup options
 * @param {boolean} [options.dryRun=true] - If true, only report what would be cleaned
 * @param {boolean} [options.cleanOrphanedMappings=true] - Clean mappings without deals
 * @param {boolean} [options.cleanInvalidData=false] - Clean invalid data (destructive)
 * @returns {Promise<Object>} Cleanup results
 */
export async function performDatabaseCleanup(options = {}) {
  const {
    dryRun = true,
    cleanOrphanedMappings = true,
    cleanInvalidData = false
  } = options;

  return withDatabase(async (db) => {
    const cleanupResults = {
      timestamp: new Date(),
      dryRun,
      actions: []
    };

    try {
      if (cleanOrphanedMappings) {
        const mappingsCollection = await ensureCollection(db, 'deal_project_mappings');
        
        // Find orphaned mappings
        const orphanedMappings = await mappingsCollection.find({
          $or: [
            { pipedriveDealIds: { $size: 0 } },
            { pipedriveDealIds: { $exists: false } }
          ]
        }).toArray();

        if (orphanedMappings.length > 0) {
          if (!dryRun) {
            const deleteResult = await mappingsCollection.deleteMany({
              $or: [
                { pipedriveDealIds: { $size: 0 } },
                { pipedriveDealIds: { $exists: false } }
              ]
            });
            
            cleanupResults.actions.push({
              type: 'delete_orphaned_mappings',
              executed: true,
              count: deleteResult.deletedCount
            });
          } else {
            cleanupResults.actions.push({
              type: 'delete_orphaned_mappings',
              executed: false,
              wouldDelete: orphanedMappings.length,
              examples: orphanedMappings.slice(0, 3).map(m => m.projectNumber)
            });
          }
        }
      }

      if (cleanInvalidData) {
        const mappingsCollection = await ensureCollection(db, 'deal_project_mappings');
        
        // Find invalid project numbers
        const invalidMappings = await mappingsCollection.find({
          projectNumber: { $not: /^[A-Z]{2}[0-9]{2}[0-9]{3}$/ }
        }).toArray();

        if (invalidMappings.length > 0) {
          if (!dryRun) {
            const deleteResult = await mappingsCollection.deleteMany({
              projectNumber: { $not: /^[A-Z]{2}[0-9]{2}[0-9]{3}$/ }
            });
            
            cleanupResults.actions.push({
              type: 'delete_invalid_project_numbers',
              executed: true,
              count: deleteResult.deletedCount
            });
          } else {
            cleanupResults.actions.push({
              type: 'delete_invalid_project_numbers',
              executed: false,
              wouldDelete: invalidMappings.length,
              examples: invalidMappings.slice(0, 3).map(m => m.projectNumber)
            });
          }
        }
      }

      return cleanupResults;
    } catch (error) {
      console.error('Error performing database cleanup:', error);
      throw new Error(`Database cleanup failed: ${error.message}`);
    }
  });
}

/**
 * Gets analytics data for project generation trends
 * 
 * @param {Object} options - Analytics options
 * @param {number} [options.days=30] - Number of days to analyze
 * @returns {Promise<Object>} Analytics data
 */
export async function getProjectAnalytics(options = {}) {
  const { days = 30 } = options;
  
  return withDatabase(async (db) => {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    try {
      const mappingsCollection = await ensureCollection(db, 'deal_project_mappings');
      
      // Project creation trends by department
      const departmentTrends = await mappingsCollection.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$departmentCode',
            count: { $sum: 1 },
            department: { $first: '$department' }
          }
        },
        { $sort: { count: -1 } }
      ]).toArray();

      // Daily project creation trends
      const dailyTrends = await mappingsCollection.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]).toArray();

      // Current year statistics
      const currentYear = new Date().getFullYear() % 100;
      const currentYearStats = await mappingsCollection.aggregate([
        { $match: { year: currentYear } },
        {
          $group: {
            _id: '$departmentCode',
            count: { $sum: 1 },
            maxSequence: { $max: '$sequence' },
            department: { $first: '$department' }
          }
        },
        { $sort: { maxSequence: -1 } }
      ]).toArray();

      return {
        period: {
          startDate,
          endDate: new Date(),
          days
        },
        departmentTrends,
        dailyTrends: dailyTrends.map(trend => ({
          date: `${trend._id.year}-${String(trend._id.month).padStart(2, '0')}-${String(trend._id.day).padStart(2, '0')}`,
          count: trend.count
        })),
        currentYearStats,
        summary: {
          totalProjects: departmentTrends.reduce((sum, dept) => sum + dept.count, 0),
          activeDepartments: departmentTrends.length,
          mostActiveDepartment: departmentTrends[0]?.department || null
        }
      };
    } catch (error) {
      console.error('Error generating project analytics:', error);
      throw new Error(`Project analytics generation failed: ${error.message}`);
    }
  });
}
