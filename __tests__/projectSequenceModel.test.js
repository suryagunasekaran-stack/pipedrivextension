import { 
    getDepartmentCode, 
    getAllDepartmentMappings, 
    isValidProjectNumberFormat, 
    parseProjectNumber 
} from '../models/projectSequenceModel.js';

describe('Project Sequence Model - Pure Business Logic Tests', () => {

    describe('getDepartmentCode', () => {
        
        test('should return correct department code for valid department names', () => {
            expect(getDepartmentCode('Navy')).toBe('NY');
            expect(getDepartmentCode('Electrical')).toBe('EL');
            expect(getDepartmentCode('Machining')).toBe('MC');
            expect(getDepartmentCode('Afloat')).toBe('AF');
            expect(getDepartmentCode('Engine Recon')).toBe('ED');
            expect(getDepartmentCode('Laser Cladding')).toBe('LC');
        });

        test('should return null for invalid department names', () => {
            expect(getDepartmentCode('Unknown Department')).toBeNull();
            expect(getDepartmentCode('Sales')).toBeNull();
            expect(getDepartmentCode('Marketing')).toBeNull();
            expect(getDepartmentCode('')).toBeNull();
        });

        test('should be case sensitive', () => {
            expect(getDepartmentCode('navy')).toBeNull();
            expect(getDepartmentCode('NAVY')).toBeNull();
            expect(getDepartmentCode('Navy')).toBe('NY');
        });

        test('should handle null and undefined inputs', () => {
            expect(getDepartmentCode(null)).toBeNull();
            expect(getDepartmentCode(undefined)).toBeNull();
        });

        test('should handle non-string inputs', () => {
            expect(getDepartmentCode(123)).toBeNull();
            expect(getDepartmentCode({})).toBeNull();
            expect(getDepartmentCode([])).toBeNull();
            expect(getDepartmentCode(true)).toBeNull();
        });
    });

    describe('getAllDepartmentMappings', () => {
        
        test('should return all department mappings', () => {
            const mappings = getAllDepartmentMappings();
            
            expect(mappings).toEqual({
                'Navy': 'NY',
                'Electrical': 'EL',
                'Machining': 'MC',
                'Afloat': 'AF',
                'Engine Recon': 'ED',
                'Laser Cladding': 'LC'
            });
        });

        test('should return a copy (not reference to original)', () => {
            const mappings1 = getAllDepartmentMappings();
            const mappings2 = getAllDepartmentMappings();
            
            // Should have same content
            expect(mappings1).toEqual(mappings2);
            
            // But should be different objects
            expect(mappings1).not.toBe(mappings2);
            
            // Modifying one shouldn't affect the other
            mappings1['New Department'] = 'ND';
            expect(mappings2).not.toHaveProperty('New Department');
        });

        test('should have exactly 6 departments', () => {
            const mappings = getAllDepartmentMappings();
            expect(Object.keys(mappings)).toHaveLength(6);
        });

        test('should have unique department codes', () => {
            const mappings = getAllDepartmentMappings();
            const codes = Object.values(mappings);
            const uniqueCodes = [...new Set(codes)];
            
            expect(codes).toHaveLength(uniqueCodes.length);
        });
    });

    describe('isValidProjectNumberFormat', () => {
        
        test('should validate correct project number formats', () => {
            expect(isValidProjectNumberFormat('NY25001')).toBe(true);
            expect(isValidProjectNumberFormat('EL25042')).toBe(true);
            expect(isValidProjectNumberFormat('MC25999')).toBe(true);
            expect(isValidProjectNumberFormat('AF24001')).toBe(true);
            expect(isValidProjectNumberFormat('ED23123')).toBe(true);
            expect(isValidProjectNumberFormat('LC26000')).toBe(true);
        });

        test('should reject invalid project number formats', () => {
            // Wrong length
            expect(isValidProjectNumberFormat('NY2500')).toBe(false);  // too short
            expect(isValidProjectNumberFormat('NY250001')).toBe(false); // too long
            
            // Wrong pattern
            expect(isValidProjectNumberFormat('N925001')).toBe(false);  // single letter
            expect(isValidProjectNumberFormat('NY2A001')).toBe(false);  // letter in year
            expect(isValidProjectNumberFormat('NY25A01')).toBe(false);  // letter in sequence
            expect(isValidProjectNumberFormat('ny25001')).toBe(false);  // lowercase
            expect(isValidProjectNumberFormat('NY 25001')).toBe(false); // space
            expect(isValidProjectNumberFormat('NY-25001')).toBe(false); // hyphen
        });

        test('should handle null, undefined, and empty inputs', () => {
            expect(isValidProjectNumberFormat(null)).toBe(false);
            expect(isValidProjectNumberFormat(undefined)).toBe(false);
            expect(isValidProjectNumberFormat('')).toBe(false);
        });

        test('should handle non-string inputs', () => {
            expect(isValidProjectNumberFormat(123456)).toBe(false);
            expect(isValidProjectNumberFormat({})).toBe(false);
            expect(isValidProjectNumberFormat([])).toBe(false);
            expect(isValidProjectNumberFormat(true)).toBe(false);
        });

        test('should validate edge cases with zeros', () => {
            expect(isValidProjectNumberFormat('NY00000')).toBe(true);
            expect(isValidProjectNumberFormat('NY00001')).toBe(true);
            expect(isValidProjectNumberFormat('NY99999')).toBe(true);
        });

        test('should validate special department codes', () => {
            expect(isValidProjectNumberFormat('AA25001')).toBe(true);
            expect(isValidProjectNumberFormat('ZZ25001')).toBe(true);
            expect(isValidProjectNumberFormat('XY25001')).toBe(true);
        });
    });

    describe('parseProjectNumber', () => {
        
        test('should correctly parse valid project numbers', () => {
            expect(parseProjectNumber('NY25001')).toEqual({
                departmentCode: 'NY',
                year: 25,
                sequence: 1
            });

            expect(parseProjectNumber('EL24042')).toEqual({
                departmentCode: 'EL',
                year: 24,
                sequence: 42
            });

            expect(parseProjectNumber('MC26999')).toEqual({
                departmentCode: 'MC',
                year: 26,
                sequence: 999
            });
        });

        test('should handle project numbers with leading zeros', () => {
            expect(parseProjectNumber('AF23001')).toEqual({
                departmentCode: 'AF',
                year: 23,
                sequence: 1
            });

            expect(parseProjectNumber('ED00042')).toEqual({
                departmentCode: 'ED',
                year: 0,
                sequence: 42
            });

            expect(parseProjectNumber('LC25000')).toEqual({
                departmentCode: 'LC',
                year: 25,
                sequence: 0
            });
        });

        test('should return null for invalid project numbers', () => {
            expect(parseProjectNumber('NY2500')).toBeNull();    // too short
            expect(parseProjectNumber('NY250001')).toBeNull();  // too long
            expect(parseProjectNumber('N925001')).toBeNull();   // single letter
            expect(parseProjectNumber('NY2A001')).toBeNull();   // letter in year
            expect(parseProjectNumber('NY25A01')).toBeNull();   // letter in sequence
            expect(parseProjectNumber('ny25001')).toBeNull();   // lowercase
            expect(parseProjectNumber('')).toBeNull();          // empty
        });

        test('should return null for null, undefined, and non-string inputs', () => {
            expect(parseProjectNumber(null)).toBeNull();
            expect(parseProjectNumber(undefined)).toBeNull();
            expect(parseProjectNumber(123456)).toBeNull();
            expect(parseProjectNumber({})).toBeNull();
            expect(parseProjectNumber([])).toBeNull();
        });

        test('should parse all valid department codes correctly', () => {
            const departmentCodes = ['NY', 'EL', 'MC', 'AF', 'ED', 'LC'];
            
            departmentCodes.forEach(code => {
                const projectNumber = `${code}25001`;
                const parsed = parseProjectNumber(projectNumber);
                
                expect(parsed).toEqual({
                    departmentCode: code,
                    year: 25,
                    sequence: 1
                });
            });
        });

        test('should handle edge cases with years', () => {
            expect(parseProjectNumber('NY00001')).toEqual({
                departmentCode: 'NY',
                year: 0,
                sequence: 1
            });

            expect(parseProjectNumber('NY99001')).toEqual({
                departmentCode: 'NY',
                year: 99,
                sequence: 1
            });
        });

        test('should handle edge cases with sequences', () => {
            expect(parseProjectNumber('NY25000')).toEqual({
                departmentCode: 'NY',
                year: 25,
                sequence: 0
            });

            expect(parseProjectNumber('NY25999')).toEqual({
                departmentCode: 'NY',
                year: 25,
                sequence: 999
            });
        });
    });

    describe('Integration Tests - Business Logic Consistency', () => {
        
        test('getDepartmentCode should work with all mappings from getAllDepartmentMappings', () => {
            const allMappings = getAllDepartmentMappings();
            
            Object.entries(allMappings).forEach(([departmentName, expectedCode]) => {
                expect(getDepartmentCode(departmentName)).toBe(expectedCode);
            });
        });

        test('parseProjectNumber should handle all valid department codes', () => {
            const allMappings = getAllDepartmentMappings();
            const departmentCodes = Object.values(allMappings);
            
            departmentCodes.forEach(code => {
                const projectNumber = `${code}25123`;
                expect(isValidProjectNumberFormat(projectNumber)).toBe(true);
                
                const parsed = parseProjectNumber(projectNumber);
                expect(parsed).toEqual({
                    departmentCode: code,
                    year: 25,
                    sequence: 123
                });
            });
        });

        test('isValidProjectNumberFormat and parseProjectNumber should be consistent', () => {
            const testCases = [
                'NY25001',
                'EL24042', 
                'MC26999',
                'AF00001',
                'ED99000',
                'LC25123',
                'INVALID',
                'NY2500',
                'ny25001',
                ''
            ];

            testCases.forEach(testCase => {
                const isValid = isValidProjectNumberFormat(testCase);
                const parsed = parseProjectNumber(testCase);
                
                if (isValid) {
                    expect(parsed).not.toBeNull();
                    expect(parsed).toHaveProperty('departmentCode');
                    expect(parsed).toHaveProperty('year');
                    expect(parsed).toHaveProperty('sequence');
                } else {
                    expect(parsed).toBeNull();
                }
            });
        });
    });
}); 