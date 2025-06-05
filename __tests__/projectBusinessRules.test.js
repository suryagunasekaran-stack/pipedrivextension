import { validateProjectCreation, validateProjectNumberAssignment, validateDealForProject } from '../utils/projectBusinessRules';

beforeAll(() => {
  process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT = 'department';
  process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME = 'vessel_name';
  process.env.PIPEDRIVE_PROJECT_NUMBER_CUSTOM_FIELD_KEY = 'project_number';
});

describe('Project Creation Business Rules', () => {
  describe('validateProjectCreation', () => {
    test('should prevent project creation for deal with existing project', () => {
      const dealWithProject = {
        id: '123',
        custom_fields: {
          [process.env.PIPEDRIVE_PROJECT_NUMBER_CUSTOM_FIELD_KEY]: 'NY25001'
        }
      };

      expect(() => validateProjectCreation(dealWithProject))
        .toThrow('Deal already has an associated project');
    });

    test('should prevent project creation without department', () => {
      const dealWithoutDepartment = {
        id: '123',
        custom_fields: {},
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: null
      };

      expect(() => validateProjectCreation(dealWithoutDepartment))
        .toThrow('Department is required for project creation');
    });

    test('should prevent project creation without vessel name', () => {
      const dealWithoutVessel = {
        id: '123',
        custom_fields: {},
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: 'New York',
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: null
      };

      expect(() => validateProjectCreation(dealWithoutVessel))
        .toThrow('Vessel name is required for project creation');
    });

    test('should validate project creation with valid data', () => {
      const validDeal = {
        id: '123',
        custom_fields: {},
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: 'New York',
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: 'Vessel 1'
      };

      expect(validateProjectCreation(validDeal)).toBe(true);
    });
  });

  describe('validateProjectNumberAssignment', () => {
    test('should throw error for missing or invalid project number', () => {
      expect(() => validateProjectNumberAssignment())
        .toThrow('Project number is required');
      expect(() => validateProjectNumberAssignment(null))
        .toThrow('Project number is required');
      expect(() => validateProjectNumberAssignment(123))
        .toThrow('Project number must be a string');
    });

    test('should prevent duplicate project number assignment', () => {
      const existingProjectNumbers = ['NY25001', 'NY25002'];
      const newProjectNumber = 'NY25001';

      expect(() => validateProjectNumberAssignment(newProjectNumber, existingProjectNumbers))
        .toThrow('Project number already exists');
    });

    test('should validate project number format', () => {
      const validProjectNumbers = ['NY25001', 'LA25002'];
      const invalidProjectNumbers = [
        'NY2501',    // Missing leading zero
        'N250001',   // Invalid department code length
        'NY250001',  // Too many digits
        'ny25001',   // Lowercase department code
        'NY2500A'    // Invalid sequence character
      ];

      validProjectNumbers.forEach(number => {
        expect(validateProjectNumberAssignment(number)).toBe(true);
      });

      invalidProjectNumbers.forEach(number => {
        expect(() => validateProjectNumberAssignment(number))
          .toThrow('Invalid project number format');
      });
    });

    test('should validate department code in project number', () => {
      const deal = {
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: 'New York'
      };
      const projectNumber = 'LA25001'; // Wrong department code

      expect(() => validateProjectNumberAssignment(projectNumber, [], deal))
        .toThrow('Project number department code does not match deal department');
    });

    test('should throw error for invalid deal object', () => {
      const projectNumber = 'NY25001';
      expect(() => validateProjectNumberAssignment(projectNumber, [], 'not an object'))
        .toThrow('Deal must be an object');
    });

    test('should throw error for missing deal department', () => {
      const projectNumber = 'NY25001';
      const deal = {};
      expect(() => validateProjectNumberAssignment(projectNumber, [], deal))
        .toThrow('Deal department is required for project number validation');
    });
  });

  describe('validateDealForProject', () => {
    test('should throw error for missing or invalid deal', () => {
      expect(() => validateDealForProject())
        .toThrow('Deal is required');
      expect(() => validateDealForProject(null))
        .toThrow('Deal is required');
      expect(() => validateDealForProject('not an object'))
        .toThrow('Deal must be an object');
    });

    test('should validate deal has required fields for project', () => {
      const validDeal = {
        id: '123',
        value: 1000,
        expected_close_date: '2024-12-31',
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: 'New York',
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: 'Vessel 1',
        org_id: { value: '456' }
      };

      expect(validateDealForProject(validDeal)).toBe(true);
    });

    test('should validate deal value is positive number', () => {
      const invalidDeals = [
        { value: -1000 },
        { value: 0 },
        { value: '1000' },
        { value: null },
        { value: undefined }
      ];

      invalidDeals.forEach(deal => {
        expect(() => validateDealForProject({
          ...deal,
          [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: 'New York',
          [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: 'Vessel 1',
          org_id: { value: '456' }
        })).toThrow(/Deal value must be a positive number|Deal value is required/);
      });
    });

    test('should validate expected close date format', () => {
      const dealWithInvalidDate = {
        id: '123',
        value: 1000,
        expected_close_date: 'invalid-date',
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: 'New York',
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: 'Vessel 1',
        org_id: { value: '456' }
      };

      expect(() => validateDealForProject(dealWithInvalidDate))
        .toThrow('Invalid expected close date format');

      const dealWithNonStringDate = {
        id: '123',
        value: 1000,
        expected_close_date: 123,
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: 'New York',
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: 'Vessel 1',
        org_id: { value: '456' }
      };

      expect(() => validateDealForProject(dealWithNonStringDate))
        .toThrow('Expected close date must be a string');
    });

    test('should validate organization association', () => {
      const dealWithoutOrg = {
        id: '123',
        value: 1000,
        expected_close_date: '2024-12-31',
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT]: 'New York',
        [process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME]: 'Vessel 1',
        org_id: null
      };

      expect(() => validateDealForProject(dealWithoutOrg))
        .toThrow('Deal must be associated with an organization');
    });
  });
}); 