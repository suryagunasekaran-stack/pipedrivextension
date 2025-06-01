import { MongoClient } from 'mongodb';

let db;

const departmentMappings = {
  // Pipedrive Department Value: Department Code for Project Number
  'Navy': 'NY',
  'Electrical': 'EL',
  'Machining': 'MC',
  'Afloat': 'AF',
  'Engine Recon': 'ED', // Assuming 'Engine Recon' from Pipedrive maps to 'ER'
  'Laser Cladding': 'LC', // Assuming 'Laser Cladding' from Pipedrive maps to 'LC'
  // Add other mappings as needed. Ensure Pipedrive values are exact.
};

async function connectToDatabase() {
  if (db) return db;
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in .env file');
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(); // By default, uses the database specified in the MONGODB_URI
  
  // Ensure the unique index exists
  try {
    await db.collection('project_sequences').createIndex(
      { departmentCode: 1, year: 1 },
      { unique: true }
    );
    console.log('Unique index on project_sequences (departmentCode, year) ensured.');
  } catch (indexError) {
    if (indexError.codeName === 'IndexOptionsConflict' || indexError.codeName === 'IndexKeySpecsConflict') {
      console.warn('Index on project_sequences already exists with different options or key specs. Manual review might be needed if issues arise.');
    } else if (indexError.codeName === 'NamespaceExists') {
        // This can happen if the index already exists, which is fine.
        console.log('Index on project_sequences (departmentCode, year) likely already exists.');
    }
    else {
      console.error('Error creating index for project_sequences:', indexError);
      // Depending on the error, you might want to throw it or handle it differently
    }
  }
  return db;
}

export async function getNextProjectNumber(pipedriveDepartmentName) {
  const database = await connectToDatabase();
  const collection = database.collection('project_sequences');

  const departmentCode = departmentMappings[pipedriveDepartmentName];
  if (!departmentCode) {
    console.error(`No department code mapping found for Pipedrive department: '${pipedriveDepartmentName}'`);
    throw new Error(`Department code not found for: ${pipedriveDepartmentName}. Please update mappings.`);
  }

  const currentYear = new Date().getFullYear() % 100; // Get last two digits of the year, e.g., 25 for 2025

  try {
    const sequenceDoc = await collection.findOneAndUpdate(
      { departmentCode: departmentCode, year: currentYear },
      { 
        $inc: { lastSequenceNumber: 1 },
        $setOnInsert: { departmentCode: departmentCode, year: currentYear, lastSequenceNumber: 0 } // lastSequenceNumber will become 1 after $inc
      },
      { 
        upsert: true,
        returnDocument: 'after'
      }
    );

    if (!sequenceDoc || sequenceDoc.lastSequenceNumber === null || sequenceDoc.lastSequenceNumber === undefined ) {
        // This case should ideally be handled by findOneAndUpdate returning the updated doc.
        // If it's null, it might mean the upsert didn't behave as expected or there's an issue.
        // For a fresh sequence, lastSequenceNumber will be 1 (0 from $setOnInsert + 1 from $inc).
        // Let's re-fetch if it's not what we expect, though this is a fallback.
        const freshDoc = await collection.findOne({ departmentCode: departmentCode, year: currentYear });
        if (!freshDoc || freshDoc.lastSequenceNumber === null || freshDoc.lastSequenceNumber === undefined) {
            throw new Error(`Failed to generate sequence number for ${departmentCode}${currentYear}. Document state unclear.`);
        }
        return `${departmentCode}${currentYear}${freshDoc.lastSequenceNumber}`;
    }
    
    // The sequenceDoc.lastSequenceNumber is the new, incremented number.
    return `${departmentCode}${currentYear}${sequenceDoc.lastSequenceNumber}`;

  } catch (error) {
    console.error('Error generating project number:', error);
    throw error;
  }
}

// Optional: Function to get the mapping if needed elsewhere
export function getDepartmentCode(pipedriveDepartmentName) {
    return departmentMappings[pipedriveDepartmentName] || null;
}
