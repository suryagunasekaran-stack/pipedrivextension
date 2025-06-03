/**
 * Database Connection Utility
 * 
 * Simple database connection utility for compatibility with the secure token service.
 * This integrates with the existing mongoService for consistent connection management.
 * 
 * @module lib/database
 */

import { connectToDatabase as mongoConnectToDatabase } from '../services/mongoService.js';

/**
 * Gets a database connection for token operations
 * 
 * @returns {Promise<Db>} MongoDB database instance
 */
export async function getDatabase() {
    return await mongoConnectToDatabase();
}

/**
 * Legacy function for backward compatibility
 */
export const connectToDatabase = getDatabase; 