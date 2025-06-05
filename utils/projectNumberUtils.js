/**
 * Validates a project number format
 * @param {string} projectNumber - The project number to validate
 * @returns {boolean} - Whether the project number is valid
 */
export function validateProjectNumber(projectNumber) {
  // Must match pattern: 2 uppercase letters + 2 digits + 3 digits
  const projectNumberRegex = /^[A-Z]{2}\d{2}\d{3}$/;
  
  if (!projectNumberRegex.test(projectNumber)) {
    return false;
  }

  // Extract components
  const departmentCode = projectNumber.slice(0, 2);
  const year = projectNumber.slice(2, 4);
  const sequence = projectNumber.slice(4);

  // Validate year (must be current year)
  const currentYear = new Date().getFullYear().toString().slice(-2);
  if (year !== currentYear) {
    return false;
  }

  // Validate sequence (must be 3 digits)
  if (!/^\d{3}$/.test(sequence)) {
    return false;
  }

  return true;
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
 * @returns {Object} - Parsed components
 * @throws {Error} - If project number is invalid
 */
export function parseProjectNumber(projectNumber) {
  if (!validateProjectNumber(projectNumber)) {
    throw new Error('Invalid project number format');
  }

  return {
    departmentCode: projectNumber.slice(0, 2),
    year: projectNumber.slice(2, 4),
    sequence: parseInt(projectNumber.slice(4), 10)
  };
} 