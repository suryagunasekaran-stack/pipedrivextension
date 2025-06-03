/**
 * Project Number Generation and Management System
 * 
 * This module handles the generation and management of unique project numbers
 * for Pipedrive deals. Project numbers follow the format DPTYYSSS where:
 * - DPT: Department code (NY, EL, MC, AF, ED, LC)
 * - YY: Last two digits of the year
 * - SSS: Sequential 3-digit number padded with zeros
 * 
 * Features:
 * - Atomic sequence generation using MongoDB's findOneAndUpdate
 * - Race condition handling for concurrent requests
 * - Deal-to-project mapping with support for multiple deals per project
 * - Validation and error handling for edge cases
 * 
 * @module models/projectSequenceModel
 */

import { connectToDatabase } from '../services/mongoService.js';

const departmentMappings = {
  'Navy': 'NY',
  'Electrical': 'EL',
  'Machining': 'MC',
  'Afloat': 'AF',
  'Engine Recon': 'ED', 
  'Laser Cladding': 'LC'
};

/**
 * Generates or retrieves a project number for a Pipedrive deal
 * 
 * This function implements a sophisticated project numbering system that:
 * - Returns existing project number if deal is already mapped
 * - Links deal to existing project if specified
 * - Generates new sequential project number with race condition protection
 * - Handles concurrent requests through atomic MongoDB operations
 * 
 * @param {string|number} pipedriveDealId - The Pipedrive deal ID to process
 * @param {string} pipedriveDepartmentName - Department name from Pipedrive (must match departmentMappings)
 * @param {string} [existingProjectNumberToLink] - Optional project number to link this deal to
 * @returns {Promise<string>} The project number in format DPTYYSSS (e.g., 'NY25001')
 * @throws {Error} When deal ID is invalid, department is unmapped, or generation fails
 */
export async function getNextProjectNumber(pipedriveDealId, pipedriveDepartmentName, existingProjectNumberToLink = null) {
  const db = await connectToDatabase();
  const dealProjectMappingsCollection = db.collection('deal_project_mappings');
  const projectSequencesCollection = db.collection('project_sequences');

  if (pipedriveDealId === null || pipedriveDealId === undefined || String(pipedriveDealId).trim() === '') {
    throw new Error('Pipedrive Deal ID is required and cannot be empty.');
  }
  const dealIdAsInt = parseInt(pipedriveDealId, 10);
  if (isNaN(dealIdAsInt)) {
      throw new Error('Pipedrive Deal ID must be a valid number.');
  }

  // Check if deal is already linked to any project
  const dealSpecificMapping = await dealProjectMappingsCollection.findOne({ pipedriveDealIds: dealIdAsInt });
  if (dealSpecificMapping) {
    return dealSpecificMapping.projectNumber;
  }

  // Link to existing project if specified
  if (existingProjectNumberToLink) {
    const result = await dealProjectMappingsCollection.findOneAndUpdate(
      { projectNumber: existingProjectNumberToLink },
      { 
        $addToSet: { pipedriveDealIds: dealIdAsInt },
        $set: { lastUpdatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );
    if (result) {
      return result.projectNumber;
    } else {
      console.warn(`Project number ${existingProjectNumberToLink} not found for deal ${pipedriveDealId}. Generating new number.`);
    }
  }

  // Generate new project number
  const departmentCode = departmentMappings[pipedriveDepartmentName];
  if (!departmentCode) {
    console.error(`No department code mapping found for Pipedrive department: '${pipedriveDepartmentName}'`);
    throw new Error(`Department code not found for: "${pipedriveDepartmentName}". Please update departmentMappings in projectSequenceModel.js.`);
  }

  const currentYear = new Date().getFullYear() % 100;

  let newProjectNumber;
  let success = false;
  let attempts = 0;
  const maxAttempts = 5;

  while (!success && attempts < maxAttempts) {
    attempts++;
    try {
      // Atomically increment sequence for department/year
      const sequenceDoc = await projectSequencesCollection.findOneAndUpdate(
        { departmentCode: departmentCode, year: currentYear },
        { 
          $inc: { lastSequenceNumber: 1 },
          $setOnInsert: { 
            departmentCode: departmentCode, 
            year: currentYear,
            createdAt: new Date()
          } 
        },
        { 
          upsert: true,
          returnDocument: 'after'
        }
      );

      if (!sequenceDoc || sequenceDoc.lastSequenceNumber === null || sequenceDoc.lastSequenceNumber === undefined) {
        console.error(`Failed to retrieve valid sequence number for ${departmentCode}${currentYear}. Sequence doc:`, sequenceDoc);
        throw new Error(`Failed to generate sequence number for ${departmentCode}${currentYear}. Document state unclear after update.`);
      }
      
      const currentSequence = sequenceDoc.lastSequenceNumber;
      newProjectNumber = `${departmentCode}${currentYear}${String(currentSequence).padStart(3, '0')}`;

      // Store the new project mapping
      await dealProjectMappingsCollection.insertOne({
        projectNumber: newProjectNumber,
        pipedriveDealIds: [dealIdAsInt],
        department: pipedriveDepartmentName,
        departmentCode: departmentCode,
        year: currentYear,
        sequence: currentSequence,
        createdAt: new Date(),
        lastUpdatedAt: new Date()
      });
      
      success = true;
      return newProjectNumber;

    } catch (error) {
      if (error.code === 11000) {
        if (error.keyPattern && error.keyPattern.projectNumber) {
          console.warn(`Duplicate project number ${newProjectNumber} encountered. Retrying... Attempt ${attempts} of ${maxAttempts}`);
          if (attempts >= maxAttempts) {
            throw new Error(`Failed to generate a unique project number for deal ${pipedriveDealId} after ${maxAttempts} attempts.`);
          }
        } else if (error.keyPattern && error.keyPattern.pipedriveDealIds) {
          console.warn(`Race condition: Deal ID ${pipedriveDealId} was concurrently linked. Re-fetching.`);
          const concurrentlyAddedMapping = await dealProjectMappingsCollection.findOne({ pipedriveDealIds: dealIdAsInt });
          if (concurrentlyAddedMapping && concurrentlyAddedMapping.projectNumber) {
            return concurrentlyAddedMapping.projectNumber;
          }
          throw error; 
        } else {
          console.error(`MongoDB duplicate key error for deal ${pipedriveDealId}:`, error);
          throw error;
        }
      } else {
        console.error(`Error generating project number for deal ${pipedriveDealId}:`, error);
        throw error;
      }
    }
  }

  throw new Error(`Failed to generate a project number for deal ${pipedriveDealId} after ${maxAttempts} attempts.`);
}

/**
 * Gets the department code for a given Pipedrive department name
 * 
 * @param {string} pipedriveDepartmentName - The department name from Pipedrive
 * @returns {string|null} The 2-letter department code or null if not found
 */
export function getDepartmentCode(pipedriveDepartmentName) {
    return departmentMappings[pipedriveDepartmentName] || null;
}

