import { validateProjectNumber } from './projectNumberUtils.js';

/**
 * Validates if a project can be created for a deal
 * @param {Object} deal - The Pipedrive deal object
 * @returns {boolean} - Whether project creation is valid
 * @throws {Error} - If project creation is not valid
 */
export function validateProjectCreation(deal) {
  // Check for existing project
  if (deal.custom_fields && 
      deal.custom_fields[process.env.PIPEDRIVE_PROJECT_NUMBER_CUSTOM_FIELD_KEY]) {
    throw new Error('Deal already has an associated project');
  }

  // Check for department first
  if (!deal[process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]) {
    throw new Error('Department is required for project creation');
  }

  // Check for vessel name
  if (!deal[process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME] || deal[process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME] === null) {
    throw new Error('Vessel name is required for project creation');
  }

  return true;
}

/**
 * Validates project number assignment
 * @param {string} projectNumber - The project number to validate
 * @param {Array} existingProjectNumbers - Array of existing project numbers
 * @param {Object} deal - The Pipedrive deal object
 * @returns {boolean} - Whether the project number is valid
 * @throws {Error} - If project number is invalid or duplicate
 */
export function validateProjectNumberAssignment(projectNumber, existingProjectNumbers = [], deal = null) {
  if (!projectNumber) {
    throw new Error('Project number is required');
  }

  if (typeof projectNumber !== 'string') {
    throw new Error('Project number must be a string');
  }

  // Validate format
  if (!validateProjectNumber(projectNumber)) {
    throw new Error('Invalid project number format');
  }

  // Check for duplicates
  if (existingProjectNumbers && existingProjectNumbers.includes(projectNumber)) {
    throw new Error('Project number already exists');
  }

  // Validate department code if deal is provided
  if (deal) {
    if (typeof deal !== 'object') {
      throw new Error('Deal must be an object');
    }

    const departmentCode = projectNumber.slice(0, 2);
    const dealDepartment = deal[process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT];
    
    if (!dealDepartment) {
      throw new Error('Deal department is required for project number validation');
    }

    // Map department name to code (this would be expanded based on your department mapping)
    const departmentCodeMap = {
      'New York': 'NY',
      'Los Angeles': 'LA',
      'San Francisco': 'SF'
    };

    if (departmentCodeMap[dealDepartment] !== departmentCode) {
      throw new Error('Project number department code does not match deal department');
    }
  }

  return true;
}

/**
 * Validates deal data for project creation
 * @param {Object} deal - The Pipedrive deal object
 * @returns {boolean} - Whether the deal is valid for project creation
 * @throws {Error} - If deal data is invalid
 */
export function validateDealForProject(deal) {
  if (!deal) {
    throw new Error('Deal is required');
  }

  if (typeof deal !== 'object') {
    throw new Error('Deal must be an object');
  }

  // Validate deal value
  if (deal.value === undefined || deal.value === null) {
    throw new Error('Deal value is required');
  }

  if (typeof deal.value !== 'number' || deal.value <= 0) {
    throw new Error('Deal value must be a positive number');
  }

  // Validate expected close date
  if (deal.expected_close_date) {
    if (typeof deal.expected_close_date !== 'string') {
      throw new Error('Expected close date must be a string');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(deal.expected_close_date)) {
      throw new Error('Invalid expected close date format');
    }
  }

  // Validate organization
  if (!deal.org_id || !deal.org_id.value) {
    throw new Error('Deal must be associated with an organization');
  }

  // Validate required custom fields
  if (!deal[process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]) {
    throw new Error('Department is required for project creation');
  }

  if (!deal[process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME] || deal[process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME] === null) {
    throw new Error('Vessel name is required for project creation');
  }

  return true;
} 