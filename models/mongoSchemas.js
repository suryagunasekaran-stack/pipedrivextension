/**
 * MongoDB Schema Definitions and Validation Rules
 * 
 * This module defines MongoDB collection schemas with validation rules,
 * indexes, and TypeScript-style interfaces for the project management system.
 * These schemas enforce data integrity and provide clear documentation
 * for database collections.
 * 
 * Collections defined:
 * - project_sequences: Sequential numbering for each department/year
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

/**
 * MongoDB schema validation for project_sequences collection
 */
export const ProjectSequenceSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["departmentCode", "year", "lastSequenceNumber"],
      properties: {
        departmentCode: {
          bsonType: "string",
          pattern: "^[A-Z]{2}$",
          description: "Must be a 2-letter uppercase department code"
        },
        year: {
          bsonType: "int",
          minimum: 0,
          maximum: 99,
          description: "Must be a 2-digit year (0-99)"
        },
        lastSequenceNumber: {
          bsonType: "int",
          minimum: 0,
          description: "Must be a non-negative integer"
        },
        createdAt: {
          bsonType: "date",
          description: "Timestamp when the sequence was created"
        }
      }
    }
  },
  indexes: [
    {
      key: { departmentCode: 1, year: 1 },
      options: { unique: true, name: "department_year_unique" }
    }
  ]
};

/**
 * MongoDB schema validation for deal_project_mappings collection
 */
export const DealProjectMappingSchema = {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["projectNumber", "pipedriveDealIds", "department", "departmentCode", "year", "sequence", "createdAt", "lastUpdatedAt"],
      properties: {
        projectNumber: {
          bsonType: "string",
          pattern: "^[A-Z]{2}[0-9]{2}[0-9]{3}$",
          description: "Must follow format: DPTYYSSS (e.g., NY25001)"
        },
        pipedriveDealIds: {
          bsonType: "array",
          items: {
            bsonType: "int",
            minimum: 1
          },
          minItems: 1,
          description: "Must contain at least one positive integer deal ID"
        },
        department: {
          bsonType: "string",
          minLength: 1,
          description: "Full department name from Pipedrive"
        },
        departmentCode: {
          bsonType: "string",
          pattern: "^[A-Z]{2}$",
          description: "Must be a 2-letter uppercase department code"
        },
        year: {
          bsonType: "int",
          minimum: 0,
          maximum: 99,
          description: "Must be a 2-digit year (0-99)"
        },
        sequence: {
          bsonType: "int",
          minimum: 1,
          description: "Must be a positive sequence number"
        },
        createdAt: {
          bsonType: "date",
          description: "Timestamp when the project was created"
        },
        lastUpdatedAt: {
          bsonType: "date",
          description: "Timestamp when the mapping was last updated"
        }
      }
    }
  },
  indexes: [
    {
      key: { projectNumber: 1 },
      options: { unique: true, name: "project_number_unique" }
    },
    {
      key: { pipedriveDealIds: 1 },
      options: { name: "pipedrive_deal_ids_index" }
    },
    {
      key: { departmentCode: 1, year: 1 },
      options: { name: "department_year_index" }
    },
    {
      key: { createdAt: 1 },
      options: { name: "created_at_index" }
    }
  ]
};

/**
 * Collection configuration with schema validation
 */
export const CollectionConfigs = {
  project_sequences: {
    name: 'project_sequences',
    schema: ProjectSequenceSchema
  },
  deal_project_mappings: {
    name: 'deal_project_mappings',
    schema: DealProjectMappingSchema
  }
};

/**
 * Creates or updates collection with schema validation and indexes
 * 
 * @param {Db} db - MongoDB database instance
 * @param {string} collectionName - Name of the collection to create/update
 * @returns {Promise<Collection>} The created or updated collection
 */
export async function ensureCollection(db, collectionName) {
  const config = CollectionConfigs[collectionName];
  if (!config) {
    throw new Error(`No configuration found for collection: ${collectionName}`);
  }

  try {
    // Check if collection exists
    const collections = await db.listCollections({ name: collectionName }).toArray();
    
    if (collections.length === 0) {
      // Create collection with validation
      await db.createCollection(collectionName, config.schema);
      console.log(`Created collection '${collectionName}' with schema validation`);
    } else {
      // Update validation rules for existing collection
      await db.command({
        collMod: collectionName,
        validator: config.schema.validator
      });
      console.log(`Updated schema validation for collection '${collectionName}'`);
    }

    // Ensure indexes
    const collection = db.collection(collectionName);
    for (const indexDef of config.schema.indexes) {
      try {
        await collection.createIndex(indexDef.key, indexDef.options);
      } catch (indexError) {
        if (indexError.codeName === 'IndexOptionsConflict' || 
            indexError.message.includes('already exists')) {
          console.warn(`Index ${indexDef.options.name} already exists for ${collectionName}`);
        } else {
          throw indexError;
        }
      }
    }

    return collection;
  } catch (error) {
    console.error(`Error ensuring collection ${collectionName}:`, error);
    throw error;
  }
}
