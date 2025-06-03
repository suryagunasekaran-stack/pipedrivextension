/**
 * Project Sequence Data Access Object (DAO)
 * 
 * This module provides data access methods for project sequence and deal mapping
 * operations. It separates database concerns from business logic and uses the
 * improved connection management for per-operation database access.
 * 
 * Key features:
 * - Atomic sequence generation with race condition handling
 * - Deal-to-project mapping operations
 * - Connection-per-operation pattern
 * - Comprehensive error handling and validation
 * - Query optimization with proper indexing
 * 
 * @module models/projectSequenceDao
 */

import { withDatabase } from '../services/mongoService.js';
import { ensureCollection } from './mongoSchemas.js';

/**
 * Finds an existing project mapping for a given deal ID
 * 
 * @param {number} dealId - The Pipedrive deal ID to search for
 * @returns {Promise<Object|null>} The project mapping or null if not found
 */
export async function findProjectMappingByDealId(dealId) {
  return withDatabase(async (db) => {
    const collection = await ensureCollection(db, 'deal_project_mappings');
    return await collection.findOne({ pipedriveDealIds: dealId });
  });
}

/**
 * Finds an existing project mapping by project number
 * 
 * @param {string} projectNumber - The project number to search for
 * @returns {Promise<Object|null>} The project mapping or null if not found
 */
export async function findProjectMappingByNumber(projectNumber) {
  return withDatabase(async (db) => {
    const collection = await ensureCollection(db, 'deal_project_mappings');
    return await collection.findOne({ projectNumber });
  });
}

/**
 * Adds a deal ID to an existing project mapping
 * 
 * @param {string} projectNumber - The project number to update
 * @param {number} dealId - The deal ID to add
 * @returns {Promise<Object|null>} The updated project mapping or null if not found
 */
export async function addDealToProject(projectNumber, dealId) {
  return withDatabase(async (db) => {
    const collection = await ensureCollection(db, 'deal_project_mappings');
    const result = await collection.findOneAndUpdate(
      { projectNumber },
      { 
        $addToSet: { pipedriveDealIds: dealId },
        $set: { lastUpdatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );
    return result;
  });
}

/**
 * Atomically increments the sequence number for a department and year
 * 
 * @param {string} departmentCode - The 2-letter department code
 * @param {number} year - The 2-digit year
 * @returns {Promise<number>} The new sequence number
 */
export async function getNextSequenceNumber(departmentCode, year) {
  return withDatabase(async (db) => {
    const collection = await ensureCollection(db, 'project_sequences');
    
    const sequenceDoc = await collection.findOneAndUpdate(
      { departmentCode, year },
      { 
        $inc: { lastSequenceNumber: 1 },
        $setOnInsert: { 
          departmentCode, 
          year,
          createdAt: new Date()
        } 
      },
      { 
        upsert: true,
        returnDocument: 'after'
      }
    );

    if (!sequenceDoc || 
        sequenceDoc.lastSequenceNumber === null || 
        sequenceDoc.lastSequenceNumber === undefined) {
      throw new Error(`Failed to generate sequence number for ${departmentCode}${year}`);
    }
    
    return sequenceDoc.lastSequenceNumber;
  });
}

/**
 * Creates a new project mapping
 * 
 * @param {Object} mappingData - The project mapping data
 * @param {string} mappingData.projectNumber - The generated project number
 * @param {number[]} mappingData.pipedriveDealIds - Array of deal IDs
 * @param {string} mappingData.department - Full department name
 * @param {string} mappingData.departmentCode - 2-letter department code
 * @param {number} mappingData.year - 2-digit year
 * @param {number} mappingData.sequence - Sequence number
 * @returns {Promise<Object>} The created project mapping
 */
export async function createProjectMapping(mappingData) {
  return withDatabase(async (db) => {
    const collection = await ensureCollection(db, 'deal_project_mappings');
    
    const document = {
      ...mappingData,
      createdAt: new Date(),
      lastUpdatedAt: new Date()
    };
    
    const result = await collection.insertOne(document);
    return { ...document, _id: result.insertedId };
  });
}

/**
 * Gets all project mappings for a specific department and year
 * 
 * @param {string} departmentCode - The 2-letter department code
 * @param {number} year - The 2-digit year
 * @param {Object} [options={}] - Query options
 * @param {number} [options.limit] - Maximum number of results
 * @param {Object} [options.sort] - Sort criteria
 * @returns {Promise<Array>} Array of project mappings
 */
export async function getProjectMappingsByDepartmentYear(departmentCode, year, options = {}) {
  return withDatabase(async (db) => {
    const collection = await ensureCollection(db, 'deal_project_mappings');
    
    let query = collection.find({ departmentCode, year });
    
    if (options.sort) {
      query = query.sort(options.sort);
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    return await query.toArray();
  });
}

/**
 * Gets the current sequence state for a department and year
 * 
 * @param {string} departmentCode - The 2-letter department code
 * @param {number} year - The 2-digit year
 * @returns {Promise<Object|null>} The sequence document or null if not found
 */
export async function getSequenceState(departmentCode, year) {
  return withDatabase(async (db) => {
    const collection = await ensureCollection(db, 'project_sequences');
    return await collection.findOne({ departmentCode, year });
  });
}

/**
 * Gets all project mappings associated with a specific deal ID
 * 
 * @param {number} dealId - The Pipedrive deal ID
 * @returns {Promise<Array>} Array of project mappings containing the deal
 */
export async function getProjectMappingsByDealId(dealId) {
  return withDatabase(async (db) => {
    const collection = await ensureCollection(db, 'deal_project_mappings');
    return await collection.find({ pipedriveDealIds: dealId }).toArray();
  });
}

/**
 * Removes a deal ID from a project mapping
 * 
 * @param {string} projectNumber - The project number to update
 * @param {number} dealId - The deal ID to remove
 * @returns {Promise<Object|null>} The updated project mapping or null if not found
 */
export async function removeDealFromProject(projectNumber, dealId) {
  return withDatabase(async (db) => {
    const collection = await ensureCollection(db, 'deal_project_mappings');
    const result = await collection.findOneAndUpdate(
      { projectNumber },
      { 
        $pull: { pipedriveDealIds: dealId },
        $set: { lastUpdatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );
    return result;
  });
}

/**
 * Deletes a project mapping if it has no associated deals
 * 
 * @param {string} projectNumber - The project number to check and potentially delete
 * @returns {Promise<boolean>} True if the mapping was deleted, false otherwise
 */
export async function deleteEmptyProjectMapping(projectNumber) {
  return withDatabase(async (db) => {
    const collection = await ensureCollection(db, 'deal_project_mappings');
    const result = await collection.deleteOne({ 
      projectNumber,
      $or: [
        { pipedriveDealIds: { $size: 0 } },
        { pipedriveDealIds: { $exists: false } }
      ]
    });
    return result.deletedCount > 0;
  });
}
