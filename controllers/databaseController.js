/**
 * Database Administration Controller
 * 
 * Provides database health monitoring, cleanup operations, analytics, and migration management.
 * All operations include proper logging and error handling.
 * 
 * @module controllers/databaseController
 */

import * as databaseHealthDao from '../models/databaseHealthDao.js';
import logger from '../lib/logger.js';
import { logSuccess, logWarning, logInfo } from '../middleware/routeLogger.js';

/**
 * Performs comprehensive database health check
 * 
 * @route GET /api/database/health
 * @access Admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const checkDatabaseHealth = async (req, res) => {
  try {
    logInfo(req, 'Starting database health check');
    
    const healthData = await databaseHealthDao.getDatabaseHealth();
    const status = healthData.overall.status;
    
    logSuccess(req, 'Database health check completed', {
      status,
      collections: healthData.database.collections,
      dataSizeMB: Math.round(healthData.database.dataSize / 1024 / 1024),
      activeConnections: healthData.server.connections?.current
    });
    
    const statusCode = status === 'healthy' ? 200 : (status === 'warning' ? 200 : 503);
    res.status(statusCode).json(healthData);
    
  } catch (error) {
    // Error will be handled by error middleware
    throw new Error(`Database health check failed: ${error.message}`);
  }
};

/**
 * Validates data consistency across database collections
 * 
 * @route GET /api/database/consistency
 * @access Admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const validateDataConsistency = async (req, res) => {
  try {
    logInfo(req, 'Starting data consistency validation');
    
    const validationResults = await databaseHealthDao.validateDataConsistency();
    const status = validationResults.overall.status;
    
    logSuccess(req, 'Data consistency validation completed', {
      status,
      issuesFound: validationResults.issues.length
    });
    
    if (validationResults.issues.length > 0) {
      validationResults.issues.forEach(issue => {
        logWarning(req, `Data consistency issue: ${issue.type}`, { count: issue.count });
      });
    }
    
    const statusCode = status === 'consistent' ? 200 : 200; // Always 200, but log issues
    res.status(statusCode).json(validationResults);
    
  } catch (error) {
    throw new Error(`Data consistency validation failed: ${error.message}`);
  }
};

/**
 * Performs database cleanup operations
 * 
 * @route POST /api/database/cleanup
 * @access Admin
 * @param {Object} req - Express request object
 * @param {boolean} [req.body.dryRun=true] - If true, only report what would be cleaned
 * @param {boolean} [req.body.cleanOrphanedMappings=true] - Clean mappings without deals
 * @param {boolean} [req.body.cleanInvalidData=false] - Clean invalid data (destructive)
 * @param {Object} res - Express response object
 */
export const performDatabaseCleanup = async (req, res) => {
  try {
    const {
      dryRun = true,
      cleanOrphanedMappings = true,
      cleanInvalidData = false
    } = req.body;
    
    logInfo(req, `Starting database cleanup (${dryRun ? 'dry run' : 'execute'})`, {
      cleanOrphanedMappings,
      cleanInvalidData
    });
    
    const cleanupResults = await databaseHealthDao.performDatabaseCleanup({
      dryRun,
      cleanOrphanedMappings,
      cleanInvalidData
    });
    
    const totalActions = cleanupResults.actions.length;
    const executedActions = cleanupResults.actions.filter(action => action.executed).length;
    
    logSuccess(req, 'Database cleanup completed', {
      mode: dryRun ? 'dry-run' : 'execute',
      totalActions,
      executedActions
    });
    
    // Log individual action results
    cleanupResults.actions.forEach(action => {
      if (action.executed) {
        logInfo(req, `Cleanup action executed: ${action.type}`, { count: action.count });
      } else if (action.wouldDelete > 0) {
        logInfo(req, `Cleanup action would execute: ${action.type}`, { wouldDelete: action.wouldDelete });
      }
    });
    
    const statusCode = dryRun ? 200 : (totalActions > 0 ? 200 : 204);
    res.status(statusCode).json(cleanupResults);
    
  } catch (error) {
    throw new Error(`Database cleanup failed: ${error.message}`);
  }
};

/**
 * Gets project generation analytics and trends
 * 
 * @route GET /api/database/analytics
 * @access Admin
 * @param {Object} req - Express request object
 * @param {number} [req.query.days=30] - Number of days to analyze
 * @param {Object} res - Express response object
 */
export const getProjectAnalytics = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    logInfo(req, `Getting project analytics for ${days} days`);
    
    const analytics = await databaseHealthDao.getProjectAnalytics(days);
    
    logSuccess(req, 'Project analytics retrieved', {
      days,
      totalProjects: analytics.summary.totalProjects,
      activeDepartments: analytics.summary.activeDepartments,
      mostActiveDepartment: analytics.summary.mostActiveDepartment
    });
    
    res.json(analytics);
    
  } catch (error) {
    throw new Error(`Failed to get project analytics: ${error.message}`);
  }
};

/**
 * Gets database performance metrics
 * 
 * @route GET /api/database/performance
 * @access Admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getDatabasePerformance = async (req, res) => {
  try {
    logInfo(req, 'Getting database performance metrics');
    
    const healthData = await databaseHealthDao.getDatabaseHealth();
    
    const performance = {
      connections: healthData.server.connections,
      operations: healthData.performance,
      memory: healthData.server.memory,
      indexes: healthData.performance.indexes
    };
    
    const connectionUtilization = healthData.server.connections ? 
      (healthData.server.connections.current / healthData.server.connections.available) * 100 : 0;
    
    logSuccess(req, 'Database performance metrics retrieved', {
      connectionUtilization: `${connectionUtilization.toFixed(1)}%`,
      currentOperations: healthData.performance.currentOperations,
      memoryUsageGB: Math.round((healthData.server.memory?.resident || 0) / 1024)
    });
    
    res.json(performance);
    
  } catch (error) {
    throw new Error(`Failed to get database performance metrics: ${error.message}`);
  }
};

/**
 * Gets current migration status (placeholder implementation)
 * 
 * @route GET /api/database/migration/status
 * @access Admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getMigrationStatus = async (req, res) => {
  try {
    logInfo(req, 'Getting migration status');
    
    // Placeholder implementation - migration system not implemented yet
    const migrationStatus = {
      currentVersion: '1.0.0',
      totalMigrations: 0,
      appliedMigrations: [],
      pendingMigrations: []
    };
    
    logSuccess(req, 'Migration status retrieved', {
      currentVersion: migrationStatus.currentVersion,
      totalMigrations: migrationStatus.totalMigrations
    });
    
    const needsUpdate = migrationStatus.pendingMigrations.length > 0;
    const status = needsUpdate ? 'pending' : 'up_to_date';
    
    res.status(200).json({
      success: true,
      status,
      migration: migrationStatus,
      summary: {
        currentVersion: migrationStatus.currentVersion,
        needsUpdate,
        pendingCount: migrationStatus.pendingMigrations.length,
        appliedCount: migrationStatus.appliedMigrations.length
      },
      recommendations: needsUpdate ? [
        'Database migrations are pending',
        'Review pending migrations before applying',
        'Backup database before running migrations',
        'Test migrations in development environment first'
      ] : [
        'Database is up to date',
        'No migrations needed',
        'Continue regular monitoring'
      ],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    throw new Error(`Failed to get migration status: ${error.message}`);
  }
};

/**
 * Runs pending database migrations (placeholder implementation)
 * 
 * @route POST /api/database/migration/run
 * @access Admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const runMigrations = async (req, res) => {
  try {
    const { dryRun = true, targetVersion = null, force = false } = req.body;
    
    logInfo(req, `Running migrations (${dryRun ? 'dry run' : 'execute'})`, {
      targetVersion: targetVersion || 'latest',
      force
    });
    
    // Placeholder implementation
    const migrationResult = {
      migrationsApplied: [],
      migrationsSkipped: [],
      newVersion: '1.0.0'
    };
    
    const appliedCount = migrationResult.migrationsApplied.length;
    const skippedCount = migrationResult.migrationsSkipped.length;
    
    logSuccess(req, 'Migrations completed', {
      mode: dryRun ? 'dry_run' : 'executed',
      appliedCount,
      skippedCount
    });
    
    const statusCode = dryRun ? 200 : (appliedCount > 0 ? 200 : 204);
    
    res.status(statusCode).json({
      success: true,
      migration: migrationResult,
      summary: {
        mode: dryRun ? 'dry_run' : 'executed',
        appliedCount,
        skippedCount,
        newVersion: migrationResult.newVersion,
        hasChanges: appliedCount > 0
      },
      recommendations: dryRun && appliedCount > 0 ? [
        'Review the proposed migrations',
        'Run with dryRun=false to execute migrations',
        'Ensure database backup is available',
        'Monitor application after migration'
      ] : appliedCount > 0 ? [
        'Migrations completed successfully',
        'Monitor application for any issues',
        'Update application version if needed',
        'Schedule regular migration checks'
      ] : [
        'No migrations needed',
        'Database is already up to date',
        'Continue regular monitoring'
      ],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    throw new Error(`Failed to run database migrations: ${error.message}`);
  }
};

/**
 * Rolls back the last applied migration (placeholder implementation)
 * 
 * @route POST /api/database/migration/rollback
 * @access Admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const rollbackLastMigration = async (req, res) => {
  try {
    const { dryRun = true, force = false } = req.body;
    
    logInfo(req, `Rolling back migration (${dryRun ? 'dry run' : 'execute'})`, { force });
    
    // Placeholder implementation
    const rollbackResult = {
      rolledBackMigration: null,
      newVersion: '1.0.0'
    };
    
    logSuccess(req, 'Rollback completed', {
      mode: dryRun ? 'dry_run' : 'executed',
      hasChanges: false
    });
    
    const hasChanges = rollbackResult.rolledBackMigration !== null;
    const statusCode = dryRun ? 200 : (hasChanges ? 200 : 204);
    
    res.status(statusCode).json({
      success: true,
      rollback: rollbackResult,
      summary: {
        mode: dryRun ? 'dry_run' : 'executed',
        hasChanges,
        rolledBackVersion: rollbackResult.rolledBackMigration?.version || null,
        newVersion: rollbackResult.newVersion
      },
      recommendations: dryRun && hasChanges ? [
        'Review the proposed rollback operation',
        'Run with dryRun=false to execute rollback',
        'Ensure database backup is available',
        'Test application after rollback'
      ] : hasChanges ? [
        'Rollback completed successfully',
        'Test application functionality',
        'Monitor for any issues',
        'Update application version if needed'
      ] : [
        'No migration to rollback',
        'Database is at initial state',
        'Continue regular monitoring'
      ],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    throw new Error(`Failed to rollback migration: ${error.message}`);
  }
};
