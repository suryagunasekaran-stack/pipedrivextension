/**
 * MongoDB Schema Definitions for Project Management System
 * 
 * This module defines TypeScript-style interfaces and MongoDB document schemas
 * for the project numbering system. These definitions provide type safety
 * through JSDoc annotations and serve as documentation for database collections.
 * 
 * Collections:
 * - project_sequences: Tracks sequential numbering for each department/year
 * - deal_project_mappings: Maps Pipedrive deals to generated project numbers
 * 
 * @module models/mongoSchemas
 */

/**
 * @typedef {Object} ProjectSequence
 * @property {string} departmentCode - The 2-letter code for the department (e.g., 'NY', 'EL')
 * @property {number} year - The 2-digit year (e.g., 25 for 2025)
 * @property {number} lastSequenceNumber - The last sequence number used for this department and year
 * @property {Date} [createdAt] - Timestamp when the sequence was initialized
 * @property {ObjectId} [_id] - MongoDB's default unique identifier
 */

/**
 * @typedef {Object} DealProjectMapping
 * @property {string} projectNumber - The generated unique project number (e.g., 'NY25001')
 * @property {number[]} pipedriveDealIds - Array of Pipedrive deal IDs associated with this project number
 * @property {string} department - The full name of the Pipedrive department for this project
 * @property {string} departmentCode - The 2-letter code for the department
 * @property {number} year - The 2-digit year the project number was generated in
 * @property {number} sequence - The sequence number part of the project number
 * @property {Date} createdAt - Timestamp when the project number was first created
 * @property {Date} lastUpdatedAt - Timestamp when the mapping was last updated
 * @property {ObjectId} [_id] - MongoDB's default unique identifier
 */

export const ProjectSequenceSchema = {};
export const DealProjectMappingSchema = {};
