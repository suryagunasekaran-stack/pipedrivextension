/**
 * @typedef {Object} ProjectSequence
 * @property {string} departmentCode - The 2-letter code for the department (e.g., 'NY', 'EL').
 * @property {number} year - The 2-digit year (e.g., 25 for 2025).
 * @property {number} lastSequenceNumber - The last sequence number used for this department and year.
 * @property {ObjectId} [_id] - Optional: MongoDB's default unique identifier.
 */

/**
 * @typedef {Object} DealProjectMapping
 * @property {string} projectNumber - The generated unique project number (e.g., \'NY25001\').
 * @property {number[]} pipedriveDealIds - An array of Pipedrive deal IDs associated with this project number.
 * @property {string} department - The full name of the Pipedrive department for this project.
 * @property {string} departmentCode - The 2-letter code for the department.
 * @property {number} year - The 2-digit year the project number was generated in.
 * @property {number} sequence - The sequence number part of the project number.
 * @property {Date} createdAt - The timestamp when the project number was first created.
 * @property {Date} lastUpdatedAt - The timestamp when the mapping was last updated (e.g., a new deal linked).
 * @property {ObjectId} [_id] - Optional: MongoDB\'s default unique identifier.
 */

// Note: Since we are not using an ODM like Mongoose, these schemas are for documentation
// and to guide development. They are not strictly enforced at the database level beyond
// the unique indexes defined in mongoService.js.

// Example of how you might mentally use this or in JSDoc comments:
// /** @type {ProjectSequence} */
// const newSequence = { ... };

// /** @type {DealProjectMapping} */
// const newMapping = { ... };

export const ProjectSequenceSchema = {}; // Placeholder for potential future use with validation libraries
export const DealProjectMappingSchema = {}; // Placeholder
