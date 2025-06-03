// filepath: /Users/suryagunasekaran/Desktop/pipedriveapplication/services/mongoService.js
import { MongoClient } from 'mongodb';

let db;

export async function connectToDatabase() {
  if (db) return db;
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in .env file');
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(); // By default, uses the database specified in the MONGODB_URI

  // Ensure indexes for project_sequences (counters)
  try {
    const projectSequencesCollection = db.collection('project_sequences');
    await projectSequencesCollection.createIndex(
      { departmentCode: 1, year: 1 },
      { unique: true }
    );
  } catch (indexError) {
    if (indexError.codeName === 'IndexOptionsConflict' || indexError.codeName === 'IndexKeySpecsConflict') {
      console.warn('Index on project_sequences already exists with different options or key specs. Manual review might be needed.');
    } else if (indexError.codeName === 'NamespaceExists' || indexError.message.includes('already exists')) {
        // Index on project_sequences (departmentCode, year) likely already exists.
    } else {
      console.error('Error creating index for project_sequences:', indexError);
    }
  }

  // Ensure indexes for deal_project_mappings
  try {
    const dealProjectMappingsCollection = db.collection('deal_project_mappings');
    
    // Index on pipedriveDealIds array - this allows efficient lookups when checking if a deal ID exists
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
      console.warn('Index on deal_project_mappings already exists with different options or key specs. Manual review might be needed.');
    } else if (indexError.codeName === 'NamespaceExists' || indexError.message.includes('already exists')) {
        // Index on deal_project_mappings already exists.
    } else {
      console.error('Error creating index for deal_project_mappings:', indexError);
    }
  }
  return db;
}
