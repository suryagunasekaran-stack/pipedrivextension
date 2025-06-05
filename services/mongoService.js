/**
 * MongoDB Database Connection and Operations Management
 * 
 * This module provides improved database connection functionality with proper
 * connection lifecycle management. Instead of maintaining persistent connections,
 * it creates connections per operation and ensures proper cleanup.
 * 
 * Key improvements:
 * - Per-operation connection management
 * - Automatic connection cleanup
 * - Connection pooling through MongoDB driver
 * - Schema-based collection and index management
 * - Database operation wrapper functions
 * 
 * @module services/mongoService
 */

import { MongoClient } from 'mongodb';
import logger from '../lib/logger.js';

let client = null;

/**
 * Creates a new MongoDB client connection
 * 
 * @returns {Promise<MongoClient>} MongoDB client instance
 * @throws {Error} When MONGODB_URI environment variable is not configured
 */
async function createClient() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in .env file');
  }
  
  const mongoClient = new MongoClient(process.env.MONGODB_URI, {
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
  });
  
  await mongoClient.connect();
  return mongoClient;
}

/**
 * Validates database connection and environment
 * 
 * @param {Db} db - MongoDB database instance
 */
async function validateDatabaseConnection(db) {
  try {
    // Ping the database to ensure connection is working
    await db.admin().ping();
    logger.debug('Database connection validated successfully');
  } catch (error) {
    logger.error('Database connection validation failed', { error: error.message });
    throw new Error('Database connection is not working properly');
  }
}

/**
 * Executes a database operation with automatic connection management
 * 
 * This function creates a new connection for each operation, ensuring proper
 * resource cleanup and avoiding connection pool exhaustion. All database
 * operations should use this pattern for consistency.
 * 
 * @param {Function} operation - Async function that receives (db, client) and returns a result
 * @returns {Promise<any>} Result of the database operation
 * @throws {Error} When database operation fails
 */
export async function withDatabase(operation) {
  let currentClient = null;
  
  try {
    currentClient = await createClient();
    const db = currentClient.db();
    
    // Validate the connection is working
    await validateDatabaseConnection(db);
    
    // Execute the operation
    const result = await operation(db, currentClient);
    return result;
  } catch (error) {
    logger.error('Database operation failed', { error: error.message });
    throw error;
  } finally {
    // Always close the connection
    if (currentClient) {
      await currentClient.close();
    }
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use withDatabase() instead for better connection management
 */
export async function connectToDatabase() {
  logger.warn('connectToDatabase() is deprecated. Use withDatabase() for better connection management.');
  if (!client) {
    client = await createClient();
  }
  return client.db();
}

/**
 * Gets database health and connection information
 * 
 * @returns {Promise<Object>} Database health information
 */
export async function getDatabaseHealth() {
  return withDatabase(async (db, client) => {
    const adminDb = db.admin();
    const serverStatus = await adminDb.serverStatus();
    
    return {
      connected: true,
      serverVersion: serverStatus.version,
      uptime: serverStatus.uptime,
      collections: await db.listCollections().toArray(),
      connectionStatus: 'healthy'
    };
  });
}

/**
 * Performs database cleanup operations
 * 
 * @returns {Promise<Object>} Cleanup results
 */
export async function performDatabaseCleanup() {
  return withDatabase(async (db) => {
    const cleanupResults = {
      orphanedMappings: 0,
      emptySequences: 0
    };

    // Remove project mappings with empty deal arrays
    const dealMappingsCollection = db.collection('deal_project_mappings');
    const orphanedResult = await dealMappingsCollection.deleteMany({
      $or: [
        { pipedriveDealIds: { $size: 0 } },
        { pipedriveDealIds: { $exists: false } }
      ]
    });
    cleanupResults.orphanedMappings = orphanedResult.deletedCount;

    return cleanupResults;
  });
}
