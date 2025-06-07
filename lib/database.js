/**
 * Database Connection Utility
 * 
 * This module provides database connection utilities with proper connection management.
 * It now uses the modern withDatabase pattern for better resource management.
 * 
 * @module lib/database
 */

import { withDatabase as mongoWithDatabase, connectToDatabase as mongoConnectToDatabase } from '../services/mongoService.js';
import logger from './logger.js';

/**
 * Modern database operation wrapper with automatic connection management
 * 
 * @param {Function} operation - Database operation function that receives (db, client)
 * @returns {Promise<any>} Result of the database operation
 */
export async function withDatabase(operation) {
    return mongoWithDatabase(operation);
}

/**
 * Gets a database connection for token operations
 * @deprecated Use withDatabase() instead for better connection management
 * @returns {Promise<Db>} MongoDB database instance
 */
export async function getDatabase() {
    logger.warn('getDatabase() is deprecated. Use withDatabase() for better connection management.');
    return await mongoConnectToDatabase();
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use withDatabase() instead for better connection management
 */
export const connectToDatabase = getDatabase; 