/**
 * Project Number Generation Business Logic
 * 
 * This module handles the business logic for generating and managing unique
 * project numbers for Pipedrive deals. It focuses purely on business rules
 * and delegates all database operations to the DAO layer.
 * 
 * Project number format: DPTYYSSS where:
 * - DPT: Department code (NY, EL, MC, AF, ED, LC)
 * - YY: Last two digits of the year
 * - SSS: Sequential 3-digit number padded with zeros
 * 
 * Key features:
 * - Pure business logic separation from data access
 * - Comprehensive input validation
 * - Race condition handling through DAO layer
 * - Deal linking and project management
 * - Error handling with meaningful messages
 * 
 * @module models/projectSequenceModel
 */

import * as projectDao from './projectSequenceDao.js';

/**
 * Mapping of Pipedrive department names to 2-letter codes
 */
const departmentMappings = {
  'Navy': 'NY',
  'Electrical': 'EL',
  'Machining': 'MC',
  'Afloat': 'AF',
  'Engine Recon': 'ED', 
  'Laser Cladding': 'LC'
};

/**
 * Validates a Pipedrive deal ID
 * 
 * @param {string|number} pipedriveDealId - The deal ID to validate
 * @returns {number} The validated deal ID as an integer
 * @throws {Error} When deal ID is invalid
 */
function validateDealId(pipedriveDealId) {
  if (pipedriveDealId === null || 
      pipedriveDealId === undefined || 
      String(pipedriveDealId).trim() === '') {
    throw new Error('Pipedrive Deal ID is required and cannot be empty.');
  }
  
  const dealIdAsInt = parseInt(pipedriveDealId, 10);
  if (isNaN(dealIdAsInt) || dealIdAsInt <= 0) {
    throw new Error('Pipedrive Deal ID must be a positive integer.');
  }
  
  return dealIdAsInt;
}

/**
 * Validates and maps a department name to its code
 * 
 * @param {string} pipedriveDepartmentName - The department name to validate
 * @returns {string} The 2-letter department code
 * @throws {Error} When department name is not mapped
 */
function validateAndMapDepartment(pipedriveDepartmentName) {
  if (!pipedriveDepartmentName || typeof pipedriveDepartmentName !== 'string') {
    throw new Error('Department name is required and must be a string.');
  }
  
  const departmentCode = departmentMappings[pipedriveDepartmentName];
  if (!departmentCode) {
    const availableDepartments = Object.keys(departmentMappings).join(', ');
    throw new Error(
      `Department code not found for: "${pipedriveDepartmentName}". ` +
      `Available departments: ${availableDepartments}`
    );
  }
  
  return departmentCode;
}

/**
 * Formats a project number from its components
 * 
 * @param {string} departmentCode - The 2-letter department code
 * @param {number} year - The 2-digit year
 * @param {number} sequence - The sequence number
 * @returns {string} The formatted project number (e.g., 'NY25001')
 */
function formatProjectNumber(departmentCode, year, sequence) {
  return `${departmentCode}${year}${String(sequence).padStart(3, '0')}`;
}

/**
 * Generates or retrieves a project number for a Pipedrive deal
 * 
 * This function implements the core business logic for project numbering:
 * - Returns existing project number if deal is already mapped
 * - Links deal to existing project if specified and valid
 * - Generates new sequential project number with proper validation
 * - Handles all business rules and delegates database operations to DAO
 * 
 * @param {string|number} pipedriveDealId - The Pipedrive deal ID to process
 * @param {string} pipedriveDepartmentName - Department name from Pipedrive
 * @param {string} [existingProjectNumberToLink] - Optional project number to link this deal to
 * @returns {Promise<string>} The project number in format DPTYYSSS (e.g., 'NY25001')
 * @throws {Error} When validation fails or database operations encounter errors
 */
export async function getNextProjectNumber(pipedriveDealId, pipedriveDepartmentName, existingProjectNumberToLink = null) {
  // Validate inputs
  const dealIdAsInt = validateDealId(pipedriveDealId);
  const departmentCode = validateAndMapDepartment(pipedriveDepartmentName);
  
  // Check if deal is already linked to any project
  const existingMapping = await projectDao.findProjectMappingByDealId(dealIdAsInt);
  if (existingMapping) {
    return existingMapping.projectNumber;
  }

  // Link to existing project if specified
  if (existingProjectNumberToLink) {
    const linkResult = await projectDao.addDealToProject(existingProjectNumberToLink, dealIdAsInt);
    if (linkResult) {
      return linkResult.projectNumber;
    } else {
      console.warn(
        `Project number ${existingProjectNumberToLink} not found for deal ${pipedriveDealId}. ` +
        'Generating new number.'
      );
    }
  }

  // Generate new project number
  const currentYear = new Date().getFullYear() % 100;
  
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      // Get next sequence number atomically
      const sequence = await projectDao.getNextSequenceNumber(departmentCode, currentYear);
      const newProjectNumber = formatProjectNumber(departmentCode, currentYear, sequence);

      // Create the project mapping
      const mappingData = {
        projectNumber: newProjectNumber,
        pipedriveDealIds: [dealIdAsInt],
        department: pipedriveDepartmentName,
        departmentCode,
        year: currentYear,
        sequence
      };

      await projectDao.createProjectMapping(mappingData);
      return newProjectNumber;

    } catch (error) {
      if (error.code === 11000) { // MongoDB duplicate key error
        if (error.keyPattern?.projectNumber) {
          console.warn(
            `Duplicate project number encountered on attempt ${attempts}/${maxAttempts}. ` +
            'Retrying...'
          );
          
          if (attempts >= maxAttempts) {
            throw new Error(
              `Failed to generate unique project number for deal ${pipedriveDealId} ` +
              `after ${maxAttempts} attempts due to conflicts.`
            );
          }
          continue;
        } else if (error.keyPattern?.pipedriveDealIds) {
          // Race condition: Deal was added concurrently
          console.warn(`Race condition detected for deal ${pipedriveDealId}. Re-fetching mapping.`);
          const concurrentMapping = await projectDao.findProjectMappingByDealId(dealIdAsInt);
          if (concurrentMapping?.projectNumber) {
            return concurrentMapping.projectNumber;
          }
        }
      }
      
      // Re-throw unexpected errors
      console.error(`Error generating project number for deal ${pipedriveDealId}:`, error);
      throw error;
    }
  }

  throw new Error(
    `Failed to generate project number for deal ${pipedriveDealId} ` +
    `after ${maxAttempts} attempts.`
  );
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

/**
 * Gets all available department mappings
 * 
 * @returns {Object} Object mapping department names to codes
 */
export function getAllDepartmentMappings() {
  return { ...departmentMappings };
}

/**
 * Validates if a project number follows the correct format
 * 
 * @param {string} projectNumber - The project number to validate
 * @returns {boolean} True if the format is valid
 */
export function isValidProjectNumberFormat(projectNumber) {
  if (!projectNumber || typeof projectNumber !== 'string') {
    return false;
  }
  
  // Format: DPTYYSSS (2 letters + 2 digits + 3 digits)
  const projectNumberRegex = /^[A-Z]{2}[0-9]{2}[0-9]{3}$/;
  return projectNumberRegex.test(projectNumber);
}

/**
 * Parses a project number into its components
 * 
 * @param {string} projectNumber - The project number to parse
 * @returns {Object|null} Object with departmentCode, year, sequence or null if invalid
 */
export function parseProjectNumber(projectNumber) {
  if (!isValidProjectNumberFormat(projectNumber)) {
    return null;
  }
  
  return {
    departmentCode: projectNumber.substring(0, 2),
    year: parseInt(projectNumber.substring(2, 4), 10),
    sequence: parseInt(projectNumber.substring(4, 7), 10)
  };
}

/**
 * Links an additional deal to an existing project
 * 
 * @param {string} projectNumber - The project number to link to
 * @param {string|number} pipedriveDealId - The deal ID to link
 * @returns {Promise<boolean>} True if the deal was successfully linked
 * @throws {Error} When validation fails or linking is not possible
 */
export async function linkDealToProject(projectNumber, pipedriveDealId) {
  if (!isValidProjectNumberFormat(projectNumber)) {
    throw new Error(`Invalid project number format: ${projectNumber}`);
  }
  
  const dealIdAsInt = validateDealId(pipedriveDealId);
  
  // Check if deal is already linked somewhere
  const existingMapping = await projectDao.findProjectMappingByDealId(dealIdAsInt);
  if (existingMapping) {
    if (existingMapping.projectNumber === projectNumber) {
      return true; // Already linked to this project
    } else {
      throw new Error(
        `Deal ${pipedriveDealId} is already linked to project ${existingMapping.projectNumber}`
      );
    }
  }
  
  const result = await projectDao.addDealToProject(projectNumber, dealIdAsInt);
  return result !== null;
}

