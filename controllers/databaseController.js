/**
 * Database Health and Analytics Controller
 * 
 * This controller provides endpoints for database health monitoring, analytics,
 * migration management, and administrative operations. It's designed for system
 * administrators and monitoring tools to assess database performance and data integrity.
 * 
 * Key features:
 * - Database health checks and metrics
 * - Project generation analytics and trends
 * - Data consistency validation
 * - Database migration management
 * - Administrative cleanup operations
 * - Performance monitoring
 * 
 * @module controllers/databaseController
 */

import * as databaseHealthDao from '../models/databaseHealthDao.js';
import * as databaseMigration from '../utils/databaseMigration.js';

/**
 * Gets comprehensive database health information
 * 
 * @route GET /api/database/health
 * @access Admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getDatabaseHealth = async (req, res) => {
  try {
    console.log('=== DATABASE HEALTH CHECK ===');
    
    const healthData = await databaseHealthDao.getDatabaseHealth();
    
    // Determine overall health status
    const isHealthy = healthData.server.connections?.current < (healthData.server.connections?.available * 0.8);
    const status = isHealthy ? 'healthy' : 'warning';
    
    console.log(`Database health status: ${status}`);
    console.log(`Total collections: ${healthData.database.collections}`);
    console.log(`Data size: ${Math.round(healthData.database.dataSize / 1024 / 1024)} MB`);
    console.log(`Active connections: ${healthData.server.connections?.current}/${healthData.server.connections?.available}`);
    
    res.status(200).json({
      success: true,
      status,
      timestamp: new Date().toISOString(),
      health: healthData,
      summary: {
        status,
        uptime: healthData.server.uptime,
        collections: healthData.database.collections,
        totalConnections: healthData.server.connections?.current || 0,
        memoryUsage: healthData.server.memory?.resident || 0,
        dataSize: healthData.database.dataSize,
        indexSize: healthData.database.indexSize
      }
    });
    
  } catch (error) {
    console.error('Error getting database health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get database health information',
      details: error.message,
      timestamp: new Date().toISOString()
    });
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
    console.log('=== DATA CONSISTENCY VALIDATION ===');
    
    const validationResults = await databaseHealthDao.validateDataConsistency();
    
    const hasIssues = validationResults.issues.length > 0;
    const status = hasIssues ? 'issues_found' : 'consistent';
    
    console.log(`Data consistency status: ${status}`);
    console.log(`Issues found: ${validationResults.issues.length}`);
    
    if (hasIssues) {
      validationResults.issues.forEach(issue => {
        console.log(`- ${issue.type}: ${issue.count} items`);
      });
    }
    
    res.status(200).json({
      success: true,
      status,
      timestamp: new Date().toISOString(),
      validation: validationResults,
      recommendations: hasIssues ? [
        'Run database cleanup to resolve data inconsistencies',
        'Check application logic for data validation issues',
        'Consider setting up automated data validation monitoring'
      ] : [
        'Data is consistent across all collections',
        'Continue regular consistency checks',
        'Monitor for future inconsistencies'
      ]
    });
    
  } catch (error) {
    console.error('Error validating data consistency:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate data consistency',
      details: error.message,
      timestamp: new Date().toISOString()
    });
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
    
    console.log('=== DATABASE CLEANUP ===');
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
    console.log(`Clean orphaned mappings: ${cleanOrphanedMappings}`);
    console.log(`Clean invalid data: ${cleanInvalidData}`);
    
    const cleanupResults = await databaseHealthDao.performDatabaseCleanup({
      dryRun,
      cleanOrphanedMappings,
      cleanInvalidData
    });
    
    const totalActions = cleanupResults.actions.length;
    const executedActions = cleanupResults.actions.filter(action => action.executed).length;
    
    console.log(`Cleanup completed: ${executedActions}/${totalActions} actions executed`);
    
    cleanupResults.actions.forEach(action => {
      if (action.executed) {
        console.log(`✅ ${action.type}: ${action.count} items cleaned`);
      } else {
        console.log(`📋 ${action.type}: ${action.wouldDelete || 0} items would be cleaned`);
      }
    });
    
    const statusCode = dryRun ? 200 : (totalActions > 0 ? 200 : 204);
    
    res.status(statusCode).json({
      success: true,
      cleanup: cleanupResults,
      summary: {
        mode: dryRun ? 'dry_run' : 'executed',
        totalActions,
        executedActions,
        hasChanges: executedActions > 0
      },
      recommendations: dryRun && totalActions > 0 ? [
        'Review the proposed cleanup actions',
        'Run with dryRun=false to execute cleanup',
        'Consider scheduling regular cleanup operations'
      ] : executedActions > 0 ? [
        'Cleanup completed successfully',
        'Monitor application for any issues',
        'Schedule regular cleanup operations'
      ] : [
        'No cleanup actions needed',
        'Database is already clean',
        'Continue regular monitoring'
      ],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error performing database cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform database cleanup',
      details: error.message,
      timestamp: new Date().toISOString()
    });
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
    
    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        error: 'Days parameter must be between 1 and 365',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`=== PROJECT ANALYTICS (${days} days) ===`);
    
    const analytics = await databaseHealthDao.getProjectAnalytics({ days });
    
    console.log(`Total projects: ${analytics.summary.totalProjects}`);
    console.log(`Active departments: ${analytics.summary.activeDepartments}`);
    console.log(`Most active department: ${analytics.summary.mostActiveDepartment || 'None'}`);
    
    // Calculate trends
    const avgProjectsPerDay = analytics.summary.totalProjects / days;
    const trendDirection = analytics.dailyTrends.length >= 7 ? 
      (analytics.dailyTrends.slice(-3).reduce((sum, day) => sum + day.count, 0) / 3) >
      (analytics.dailyTrends.slice(-7, -4).reduce((sum, day) => sum + day.count, 0) / 3) ? 'increasing' : 'decreasing'
      : 'stable';
    
    res.status(200).json({
      success: true,
      period: analytics.period,
      analytics,
      insights: {
        averageProjectsPerDay: Math.round(avgProjectsPerDay * 100) / 100,
        trendDirection,
        peakDay: analytics.dailyTrends.reduce((peak, day) => 
          day.count > (peak?.count || 0) ? day : peak, null),
        departmentLeader: analytics.departmentTrends[0] || null,
        currentYearProgress: analytics.currentYearStats.reduce((sum, dept) => sum + dept.count, 0)
      },
      recommendations: [
        avgProjectsPerDay > 10 ? 'High project volume - consider optimizing workflows' : 'Project volume is manageable',
        analytics.summary.activeDepartments > 4 ? 'Multiple departments active - ensure coordination' : 'Department activity is focused',
        trendDirection === 'increasing' ? 'Project volume is growing - plan for scale' : 'Project volume is stable'
      ],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting project analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get project analytics',
      details: error.message,
      timestamp: new Date().toISOString()
    });
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
    console.log('=== DATABASE PERFORMANCE METRICS ===');
    
    // Get health data which includes performance metrics
    const healthData = await databaseHealthDao.getDatabaseHealth();
    
    const performance = {
      connections: healthData.server.connections,
      memory: healthData.server.memory,
      operations: healthData.server.opcounters,
      collections: {
        project_sequences: healthData.collections.project_sequences,
        deal_project_mappings: healthData.collections.deal_project_mappings
      },
      performance: healthData.performance,
      timestamp: new Date()
    };
    
    // Performance analysis
    const connectionUtilization = healthData.server.connections ? 
      (healthData.server.connections.current / healthData.server.connections.available) * 100 : 0;
    
    const avgDocumentSize = {
      sequences: healthData.collections.project_sequences?.avgObjSize || 0,
      mappings: healthData.collections.deal_project_mappings?.avgObjSize || 0
    };
    
    console.log(`Connection utilization: ${connectionUtilization.toFixed(1)}%`);
    console.log(`Current operations: ${healthData.performance.currentOperations}`);
    console.log(`Memory usage: ${Math.round((healthData.server.memory?.resident || 0) / 1024)} GB`);
    
    res.status(200).json({
      success: true,
      performance,
      analysis: {
        connectionUtilization: Math.round(connectionUtilization * 100) / 100,
        memoryUsageGB: Math.round((healthData.server.memory?.resident || 0) / 1024 * 100) / 100,
        avgDocumentSizes: avgDocumentSize,
        indexEfficiency: {
          sequences: healthData.collections.project_sequences?.indexCount || 0,
          mappings: healthData.collections.deal_project_mappings?.indexCount || 0
        }
      },
      recommendations: [
        connectionUtilization > 80 ? 'High connection usage - consider connection pooling optimization' : 'Connection usage is healthy',
        (healthData.server.memory?.resident || 0) > 8192 ? 'High memory usage - monitor for memory leaks' : 'Memory usage is normal',
        healthData.performance.currentOperations > 10 ? 'High operation count - check for slow queries' : 'Operation count is normal'
      ],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting database performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get database performance metrics',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Gets current migration status and available migrations
 * 
 * @route GET /api/database/migration/status
 * @access Admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getMigrationStatus = async (req, res) => {
  try {
    console.log('=== MIGRATION STATUS CHECK ===');
    
    const migrationStatus = await databaseMigration.getMigrationStatus();
    
    console.log(`Current version: ${migrationStatus.currentVersion}`);
    console.log(`Total migrations: ${migrationStatus.totalMigrations}`);
    console.log(`Applied migrations: ${migrationStatus.appliedMigrations.length}`);
    console.log(`Pending migrations: ${migrationStatus.pendingMigrations.length}`);
    
    if (migrationStatus.pendingMigrations.length > 0) {
      console.log('Pending migrations:');
      migrationStatus.pendingMigrations.forEach(migration => {
        console.log(`- ${migration.version}: ${migration.description}`);
      });
    }
    
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
    console.error('Error getting migration status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get migration status',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Runs pending database migrations
 * 
 * @route POST /api/database/migration/run
 * @access Admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const runMigrations = async (req, res) => {
  try {
    const { dryRun = true, targetVersion = null, force = false } = req.body;
    
    console.log('=== RUNNING DATABASE MIGRATIONS ===');
    console.log(`Mode: ${dryRun ? 'dry-run' : 'execute'}`);
    console.log(`Target version: ${targetVersion || 'latest'}`);
    console.log(`Force mode: ${force}`);
    
    const migrationResult = await databaseMigration.runMigrations({
      dryRun,
      targetVersion,
      force
    });
    
    const appliedCount = migrationResult.migrationsApplied.length;
    const skippedCount = migrationResult.migrationsSkipped.length;
    
    console.log(`Migrations completed: ${appliedCount} applied, ${skippedCount} skipped`);
    
    if (appliedCount > 0) {
      console.log('Applied migrations:');
      migrationResult.migrationsApplied.forEach(migration => {
        console.log(`✅ ${migration.version}: ${migration.description}`);
      });
    }
    
    if (skippedCount > 0) {
      console.log('Skipped migrations:');
      migrationResult.migrationsSkipped.forEach(migration => {
        console.log(`⏭️ ${migration.version}: ${migration.reason}`);
      });
    }
    
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
    console.error('Error running migrations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run database migrations',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Rolls back the last applied migration
 * 
 * @route POST /api/database/migration/rollback
 * @access Admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const rollbackLastMigration = async (req, res) => {
  try {
    const { dryRun = true, force = false } = req.body;
    
    console.log('=== ROLLING BACK LAST MIGRATION ===');
    console.log(`Mode: ${dryRun ? 'dry-run' : 'execute'}`);
    console.log(`Force mode: ${force}`);
    
    const rollbackResult = await databaseMigration.rollbackLastMigration({
      dryRun,
      force
    });
    
    if (rollbackResult.rolledBackMigration) {
      console.log(`Rolled back migration: ${rollbackResult.rolledBackMigration.version}`);
      console.log(`Description: ${rollbackResult.rolledBackMigration.description}`);
      console.log(`New version: ${rollbackResult.newVersion}`);
    } else {
      console.log('No migration to rollback');
    }
    
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
    console.error('Error rolling back migration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rollback migration',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
