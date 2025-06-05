import { validateProjectNumber, generateProjectNumber, parseProjectNumber } from '../utils/projectNumberUtils';

describe('Project Number Validation', () => {
  describe('validateProjectNumber', () => {
    test('should validate correct project number format', () => {
      const validNumbers = ['NY25001', 'LA25002', 'SF25003'];
      validNumbers.forEach(number => {
        expect(validateProjectNumber(number)).toBe(true);
      });
    });

    test('should reject invalid project number formats', () => {
      const invalidNumbers = [
        'NY2501',    // Missing leading zero
        'N250001',   // Invalid department code length
        'NY250001',  // Too many digits
        'ny25001',   // Lowercase department code
        'NY2500A',   // Invalid sequence character
        'NY2500',    // Missing sequence digit
      ];
      invalidNumbers.forEach(number => {
        expect(validateProjectNumber(number)).toBe(false);
      });
    });

    test('should validate department code format', () => {
      const validDeptCodes = ['NY', 'LA', 'SF'];
      const invalidDeptCodes = ['N', 'LAX', 'ny', 'N1'];

      validDeptCodes.forEach(code => {
        expect(validateProjectNumber(`${code}25001`)).toBe(true);
      });

      invalidDeptCodes.forEach(code => {
        expect(validateProjectNumber(`${code}25001`)).toBe(false);
      });
    });

    test('should validate year format', () => {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      const validYear = `${currentYear}001`;
      const invalidYear = `${parseInt(currentYear) + 1}001`;

      expect(validateProjectNumber(`NY${validYear}`)).toBe(true);
      expect(validateProjectNumber(`NY${invalidYear}`)).toBe(false);
    });
  });

  describe('generateProjectNumber', () => {
    test('should generate valid project number', () => {
      const deptCode = 'NY';
      const sequence = 1;
      const projectNumber = generateProjectNumber(deptCode, sequence);
      
      expect(validateProjectNumber(projectNumber)).toBe(true);
      expect(projectNumber).toMatch(/^NY\d{5}$/);
    });

    test('should handle sequence padding', () => {
      const sequences = [1, 10, 100];
      sequences.forEach(seq => {
        const number = generateProjectNumber('NY', seq);
        expect(number.length).toBe(7); // 2 chars dept + 2 chars year + 3 chars sequence
        expect(number.slice(-3)).toBe(seq.toString().padStart(3, '0'));
      });
    });

    test('should throw error for invalid department code', () => {
      expect(() => generateProjectNumber('N', 1)).toThrow('Invalid department code');
      expect(() => generateProjectNumber('NYC', 1)).toThrow('Invalid department code');
      expect(() => generateProjectNumber('ny', 1)).toThrow('Invalid department code');
    });
  });

  describe('parseProjectNumber', () => {
    test('should correctly parse valid project number', () => {
      const projectNumber = 'NY25001';
      const parsed = parseProjectNumber(projectNumber);
      
      expect(parsed).toEqual({
        departmentCode: 'NY',
        year: '25',
        sequence: 1
      });
    });

    test('should throw error for invalid project number', () => {
      expect(() => parseProjectNumber('NY2501')).toThrow('Invalid project number format');
      expect(() => parseProjectNumber('N250001')).toThrow('Invalid project number format');
      expect(() => parseProjectNumber('NY2500A')).toThrow('Invalid project number format');
    });

    test('should handle sequence numbers correctly', () => {
      const testCases = [
        { input: 'NY25001', expected: 1 },
        { input: 'NY25010', expected: 10 },
        { input: 'NY25100', expected: 100 }
      ];

      testCases.forEach(({ input, expected }) => {
        const parsed = parseProjectNumber(input);
        expect(parsed.sequence).toBe(expected);
      });
    });
  });
}); 