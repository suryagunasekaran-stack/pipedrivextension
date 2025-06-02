import { connectToDatabase } from '../services/mongoService.js';

const departmentMappings = {
  // Pipedrive Department Value: Department Code for Project Number
  'Navy': 'NY',
  'Electrical': 'EL',
  'Machining': 'MC',
  'Afloat': 'AF',
  'Engine Recon': 'ED', 
  'Laser Cladding': 'LC', 
  // Add other mappings as needed. Ensure Pipedrive values are exact.
};

/**
 * Generates the next project number for a given Pipedrive deal and department.
 * It first checks if a project number already exists for the deal.
 * If not, it generates a new number, stores the mapping, and returns the number.
 * Handles concurrent requests by retrying if a generated project number already exists.
 * @param {string|number} pipedriveDealId - The ID of the Pipedrive deal to get or link a project number for.
 * @param {string} pipedriveDepartmentName - The name of the Pipedrive department.
 * @param {string} [existingProjectNumberToLink] - Optional. If provided, this deal will be linked to this existing project number if possible.
 * @returns {Promise<string>} The project number.
 */
export async function getNextProjectNumber(pipedriveDealId, pipedriveDepartmentName, existingProjectNumberToLink = null) {
  const db = await connectToDatabase();
  const dealProjectMappingsCollection = db.collection('deal_project_mappings');
  const projectSequencesCollection = db.collection('project_sequences'); // This is our counter collection

  // Validate pipedriveDealId
  if (pipedriveDealId === null || pipedriveDealId === undefined || String(pipedriveDealId).trim() === '') {
    throw new Error('Pipedrive Deal ID is required and cannot be empty.');
  }
  const dealIdAsInt = parseInt(pipedriveDealId, 10);
  if (isNaN(dealIdAsInt)) {
      throw new Error('Pipedrive Deal ID must be a valid number.');
  }

  // 1. Check if this specific deal is ALREADY linked to ANY project number.
  // We search for the dealId within the array pipedriveDealIds.
  const dealSpecificMapping = await dealProjectMappingsCollection.findOne({ pipedriveDealIds: dealIdAsInt });
  if (dealSpecificMapping) {
    console.log(`Deal ${pipedriveDealId} is already linked to project number ${dealSpecificMapping.projectNumber}.`);
    return dealSpecificMapping.projectNumber;
  }

  // 2. If an existingProjectNumberToLink is provided, try to link this deal to it.
  if (existingProjectNumberToLink) {
    const result = await dealProjectMappingsCollection.findOneAndUpdate(
      { projectNumber: existingProjectNumberToLink },
      { 
        $addToSet: { pipedriveDealIds: dealIdAsInt }, // Add dealId to the array if not already present
        $set: { lastUpdatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );
    if (result) {
      console.log(`Successfully linked Pipedrive Deal ID ${pipedriveDealId} to existing project number ${existingProjectNumberToLink}.`);
      return result.projectNumber;
    } else {
      // existingProjectNumberToLink was not found, proceed to generate a new one for this deal
      console.warn(`Specified project number ${existingProjectNumberToLink} to link with deal ${pipedriveDealId} not found. A new project number will be generated.`);
    }
  }

  // 3. If not (no existing mapping for this deal, and no valid existingProjectNumberToLink provided or found),
  //    generate a new project number and create a new project mapping document.
  const departmentCode = departmentMappings[pipedriveDepartmentName];
  if (!departmentCode) {
    console.error(`No department code mapping found for Pipedrive department: '${pipedriveDepartmentName}'`);
    throw new Error(`Department code not found for: "${pipedriveDepartmentName}". Please update departmentMappings in projectSequenceModel.js.`);
  }

  const currentYear = new Date().getFullYear() % 100; // Get last two digits of the year, e.g., 25 for 2025

  let newProjectNumber;
  let success = false;
  let attempts = 0;
  const maxAttempts = 5; // Prevent infinite loops

  while (!success && attempts < maxAttempts) {
    attempts++;
    try {
      // Atomically find and increment the sequence for the department and year
      const sequenceDoc = await projectSequencesCollection.findOneAndUpdate(
        { departmentCode: departmentCode, year: currentYear },
        { 
          $inc: { lastSequenceNumber: 1 },
          // $setOnInsert sets initial values only when creating a new document
          $setOnInsert: { 
            departmentCode: departmentCode, 
            year: currentYear,
            createdAt: new Date()
          } 
        },
        { 
          upsert: true, // Create the document if it doesn't exist
          returnDocument: 'after' // Return the document AFTER the update
        }
      );

      if (!sequenceDoc || sequenceDoc.lastSequenceNumber === null || sequenceDoc.lastSequenceNumber === undefined) {
        // This should not happen with correct findOneAndUpdate usage, especially with $setOnInsert and $inc.
        // lastSequenceNumber will be 1 for a new sequence (0 from $setOnInsert + 1 from $inc).
        console.error(`Failed to retrieve valid sequence number for ${departmentCode}${currentYear}. Sequence doc:`, sequenceDoc);
        throw new Error(`Failed to generate sequence number for ${departmentCode}${currentYear}. Document state unclear after update.`);
      }
      
      const currentSequence = sequenceDoc.lastSequenceNumber;
      // Format: DPTYYSSS (e.g., NY25001) - Ensure 3-digit sequence number
      newProjectNumber = `${departmentCode}${currentYear}${String(currentSequence).padStart(3, '0')}`;

      // 3. Attempt to store the new project number with the deal ID as the first element in an array
      await dealProjectMappingsCollection.insertOne({
        projectNumber: newProjectNumber,
        pipedriveDealIds: [dealIdAsInt], // Initialize with the current deal ID in an array
        department: pipedriveDepartmentName,
        departmentCode: departmentCode,
        year: currentYear,
        sequence: currentSequence,
        createdAt: new Date(),
        lastUpdatedAt: new Date()
      });
      
      success = true; // If insertOne is successful, the number is unique and stored.
      console.log(`Generated and stored new project number ${newProjectNumber} for deal ${pipedriveDealId}.`);
      return newProjectNumber;

    } catch (error) {
      if (error.code === 11000) { // MongoDB duplicate key error
        if (error.keyPattern && error.keyPattern.projectNumber) {
          // Duplicate projectNumber. This means another request got the same sequence and inserted it first.
          // Retry to get the next sequence number.
          console.warn(`Duplicate project number ${newProjectNumber} encountered for ${departmentCode}${currentYear}. Retrying... Attempt ${attempts} of ${maxAttempts}`);
          if (attempts >= maxAttempts) {
            throw new Error(`Failed to generate a unique project number for deal ${pipedriveDealId} due to persistent duplicates after ${maxAttempts} attempts.`);
          }
          // Loop continues, will fetch a new sequence number.
        } else if (error.keyPattern && error.keyPattern.pipedriveDealIds) {
          // This error condition changes. If we hit a duplicate on pipedriveDealIds, 
          // it means this specific dealId was somehow added to another project concurrently 
          // after our initial check. This is a more complex race condition to handle perfectly
          // without distributed transactions. For now, we can re-fetch and see.
          console.warn(`Race condition: Pipedrive Deal ID ${pipedriveDealId} was concurrently linked. Re-fetching.`);
          const concurrentlyAddedMapping = await dealProjectMappingsCollection.findOne({ pipedriveDealIds: dealIdAsInt });
          if (concurrentlyAddedMapping && concurrentlyAddedMapping.projectNumber) {
            return concurrentlyAddedMapping.projectNumber; // Return the number that was just added.
          }
          // If not found (shouldn't happen), throw the original error.
          throw error; 
        } else {
          // Other duplicate key error
          console.error(`MongoDB duplicate key error for deal ${pipedriveDealId}:`, error);
          throw error;
        }
      } else {
        // Non-duplicate error
        console.error(`Error generating project number for deal ${pipedriveDealId}:`, error);
        throw error;
      }
    }
  }

  // Should not be reached if logic is correct (either returns or throws within the loop)
  throw new Error(`Failed to generate a project number for deal ${pipedriveDealId} after ${maxAttempts} attempts.`);
}

// Optional: Function to get the mapping if needed elsewhere
export function getDepartmentCode(pipedriveDepartmentName) {
    return departmentMappings[pipedriveDepartmentName] || null;
}

