/**
 * Validates a project number format
 * @param {string} projectNumber - The project number to validate
 * @returns {boolean} - Whether the project number is valid
 */
export function validateProjectNumber(projectNumber) {
  if (!projectNumber || typeof projectNumber !== 'string') {
    return false;
  }
  
  // Must match pattern: 2 uppercase letters + 2 digits + 3 digits
  const projectNumberRegex = /^[A-Z]{2}\d{2}\d{3}$/;
  
  return projectNumberRegex.test(projectNumber);
}

/**
 * Generates a project number from department code and sequence
 * @param {string} departmentCode - Two-letter department code
 * @param {number} sequence - Sequence number
 * @returns {string} - Generated project number
 * @throws {Error} - If department code is invalid
 */
export function generateProjectNumber(departmentCode, sequence) {
  // Validate department code
  if (!/^[A-Z]{2}$/.test(departmentCode)) {
    throw new Error('Invalid department code');
  }

  // Get current year
  const currentYear = new Date().getFullYear().toString().slice(-2);

  // Format sequence with leading zeros
  const formattedSequence = sequence.toString().padStart(3, '0');

  // Combine components
  return `${departmentCode}${currentYear}${formattedSequence}`;
}

/**
 * Parses a project number into its components
 * @param {string} projectNumber - The project number to parse
 * @returns {Object|null} - Parsed components or null if invalid
 */
export function parseProjectNumber(projectNumber) {
  if (!validateProjectNumber(projectNumber)) {
    return null;
  }

  return {
    departmentCode: projectNumber.slice(0, 2),
    year: parseInt(projectNumber.slice(2, 4), 10),
    sequence: parseInt(projectNumber.slice(4), 10)
  };
} 