/**
 * Database Administration Routes
 * 
 * This module defines API routes for database health monitoring, analytics,
 * and administrative operations. These routes are intended for system
 * administrators and monitoring tools.
 * 
 * Key endpoints:
 * - GET /health - Database health check and metrics
 * - GET /consistency - Data consistency validation
 * - POST /cleanup - Database cleanup operations
 * - GET /analytics - Project generation analytics
 * - GET /performance - Database performance metrics
 * 
 * @module routes/databaseRoutes
 */

import express from 'express';
import * as databaseController from '../controllers/databaseController.js';
import { logRoute } from '../middleware/routeLogger.js';

const router = express.Router();

/**
 * @route   GET /api/database/health
 * @desc    Get comprehensive database health information
 * @access  Admin
 * @returns {Object} Database health metrics, server status, and collection statistics
 */
router.get('/health', 
    logRoute('Database Health Check'), 
    databaseController.checkDatabaseHealth
);

/**
 * @route   GET /api/database/consistency
 * @desc    Validate data consistency across database collections
 * @access  Admin
 * @returns {Object} Data consistency validation results and recommendations
 */
router.get('/consistency', 
    logRoute('Data Consistency Validation'), 
    databaseController.validateDataConsistency
);

/**
 * @route   POST /api/database/cleanup
 * @desc    Perform database cleanup operations
 * @access  Admin
 * @body    {boolean} [dryRun=true] - If true, only report what would be cleaned
 * @body    {boolean} [cleanOrphanedMappings=true] - Clean mappings without deals
 * @body    {boolean} [cleanInvalidData=false] - Clean invalid data (destructive)
 * @returns {Object} Cleanup results and recommendations
 */
router.post('/cleanup', 
    logRoute('Database Cleanup'), 
    databaseController.performDatabaseCleanup
);

/**
 * @route   GET /api/database/analytics
 * @desc    Get project generation analytics and trends
 * @access  Admin
 * @query   {number} [days=30] - Number of days to analyze (1-365)
 * @returns {Object} Project analytics, trends, and insights
 */
router.get('/analytics', 
    logRoute('Project Analytics'), 
    databaseController.getProjectAnalytics
);

/**
 * @route   GET /api/database/performance
 * @desc    Get database performance metrics
 * @access  Admin
 * @returns {Object} Database performance metrics and analysis
 */
router.get('/performance', 
    logRoute('Database Performance Metrics'), 
    databaseController.getDatabasePerformance
);

// Migration Management Routes

/**
 * @route   GET /api/database/migration/status
 * @desc    Get current migration status and available migrations
 * @access  Admin
 * @returns {Object} Migration status, pending migrations, and recommendations
 */
router.get('/migration/status', 
    logRoute('Migration Status Check'), 
    databaseController.getMigrationStatus
);

/**
 * @route   POST /api/database/migration/run
 * @desc    Run pending database migrations
 * @access  Admin
 * @body    {boolean} [dryRun=true] - If true, only report what would be migrated
 * @body    {string} [targetVersion] - Target migration version (defaults to latest)
 * @body    {boolean} [force=false] - Force migration even if already applied
 * @returns {Object} Migration results and recommendations
 */
router.post('/migration/run', 
    logRoute('Run Database Migrations'), 
    databaseController.runMigrations
);

/**
 * @route   POST /api/database/migration/rollback
 * @desc    Rollback the last applied migration
 * @access  Admin
 * @body    {boolean} [dryRun=true] - If true, only report what would be rolled back
 * @body    {boolean} [force=false] - Force rollback even if risky
 * @returns {Object} Rollback results and recommendations
 */
router.post('/migration/rollback', 
    logRoute('Rollback Migration'), 
    databaseController.rollbackLastMigration
);

export default router;
