/**
 * MongoDB Database Connection and Index Management
 * 
 * This module provides database connection functionality and ensures proper
 * indexing for the project management collections. It handles connection
 * pooling, database initialization, and automatic index creation for optimal
 * query performance.
 * 
 * Collections managed:
 * - project_sequences: Unique compound index on (departmentCode, year)
 * - deal_project_mappings: Indexes on pipedriveDealIds array and unique projectNumber
 * 
 * @module services/mongoService
 */

import { MongoClient } from 'mongodb';

let db;

/**
 * Establishes connection to MongoDB and ensures required indexes exist
 * 
 * This function implements connection pooling by reusing existing connections
 * and automatically creates necessary database indexes for optimal performance.
 * Index creation is idempotent and handles existing index conflicts gracefully.
 * 
 * @returns {Promise<Db>} The MongoDB database instance
 * @throws {Error} When MONGODB_URI environment variable is not configured
 */
export async function connectToDatabase() {
  if (db) return db;
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in .env file');
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();

  // Ensure indexes for project_sequences (counters)
  try {
    const projectSequencesCollection = db.collection('project_sequences');
    await projectSequencesCollection.createIndex(
      { departmentCode: 1, year: 1 },
      { unique: true }
    );
  } catch (indexError) {
    if (indexError.codeName === 'IndexOptionsConflict' || indexError.codeName === 'IndexKeySpecsConflict') {
      console.warn('Index on project_sequences already exists with different options. Manual review might be needed.');
    } else if (indexError.codeName === 'NamespaceExists' || indexError.message.includes('already exists')) {
      // Index already exists, no action needed
    } else {
      console.error('Error creating index for project_sequences:', indexError);
    }
  }

  // Ensure indexes for deal_project_mappings
  try {
    const dealProjectMappingsCollection = db.collection('deal_project_mappings');
    
    // Index on pipedriveDealIds array for efficient deal lookups
    await dealProjectMappingsCollection.createIndex(
      { pipedriveDealIds: 1 }
    );
    
    // Unique index on projectNumber
    await dealProjectMappingsCollection.createIndex(
      { projectNumber: 1 },
      { unique: true }
    );
  } catch (indexError) {
    if (indexError.codeName === 'IndexOptionsConflict' || indexError.codeName === 'IndexKeySpecsConflict') {
      console.warn('Index on deal_project_mappings already exists with different options. Manual review might be needed.');
    } else if (indexError.codeName === 'NamespaceExists' || indexError.message.includes('already exists')) {
      // Index already exists, no action needed
    } else {
      console.error('Error creating index for deal_project_mappings:', indexError);
    }
  }
  return db;
}
