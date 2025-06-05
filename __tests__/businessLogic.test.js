// Pure business logic utility functions for testing
// These are simple functions that demonstrate pure function testing

/**
 * Formats a project number display string
 * @param {string} projectNumber - Project number like 'NY25001'
 * @returns {string} Formatted display string
 */
function formatProjectDisplay(projectNumber) {
    if (!projectNumber || typeof projectNumber !== 'string') {
        return 'No Project Number';
    }
    
    // Validate format first
    const projectNumberRegex = /^[A-Z]{2}[0-9]{2}[0-9]{3}$/;
    if (!projectNumberRegex.test(projectNumber)) {
        return 'Invalid Project Number';
    }
    
    const dept = projectNumber.substring(0, 2);
    const year = '20' + projectNumber.substring(2, 4);
    const sequence = parseInt(projectNumber.substring(4, 7), 10);
    
    return `Project ${dept}-${year}-${sequence}`;
}

/**
 * Calculates deal priority score based on value and department
 * @param {number} dealValue - Deal value in currency
 * @param {string} department - Department name
 * @returns {number} Priority score (1-10)
 */
function calculateDealPriority(dealValue, department) {
    if (typeof dealValue !== 'number' || dealValue < 0) {
        return 1; // Lowest priority for invalid values
    }
    
    let baseScore = 1;
    
    // Value-based scoring
    if (dealValue >= 100000) baseScore += 4;
    else if (dealValue >= 50000) baseScore += 3;
    else if (dealValue >= 20000) baseScore += 2;
    else if (dealValue >= 5000) baseScore += 1;
    
    // Department-based modifier
    const departmentModifiers = {
        'Navy': 2,
        'Electrical': 1.5,
        'Engine Recon': 1.5,
        'Machining': 1,
        'Afloat': 1,
        'Laser Cladding': 0.5
    };
    
    const modifier = departmentModifiers[department] || 1;
    const finalScore = Math.min(10, Math.round(baseScore * modifier));
    
    return finalScore;
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

/**
 * Extracts company domain from email
 * @param {string} email - Email address
 * @returns {string|null} Company domain or null if invalid
 */
function extractCompanyDomain(email) {
    if (!isValidEmail(email)) {
        return null;
    }
    
    const parts = email.trim().split('@');
    return parts[1].toLowerCase();
}

/**
 * Formats currency value for display
 * @param {number} value - Numeric value
 * @param {string} currency - Currency code (USD, EUR, etc.)
 * @returns {string} Formatted currency string
 */
function formatCurrency(value, currency = 'USD') {
    if (typeof value !== 'number' || isNaN(value)) {
        return '---';
    }
    
    const currencySymbols = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'CAD': 'C$',
        'AUD': 'A$'
    };
    
    const symbol = currencySymbols[currency] || currency;
    const formattedValue = Math.abs(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return value < 0 ? `-${symbol}${formattedValue}` : `${symbol}${formattedValue}`;
}

describe('Business Logic Utilities - Pure Functions', () => {

    describe('formatProjectDisplay', () => {
        
        test('should format valid project numbers correctly', () => {
            expect(formatProjectDisplay('NY25001')).toBe('Project NY-2025-1');
            expect(formatProjectDisplay('EL24042')).toBe('Project EL-2024-42');
            expect(formatProjectDisplay('MC26999')).toBe('Project MC-2026-999');
        });

        test('should handle invalid project numbers', () => {
            expect(formatProjectDisplay('INVALID')).toBe('Invalid Project Number');
            expect(formatProjectDisplay('NY2500')).toBe('Invalid Project Number');
            expect(formatProjectDisplay('ny25001')).toBe('Invalid Project Number');
        });

        test('should handle null, undefined, and non-string inputs', () => {
            expect(formatProjectDisplay(null)).toBe('No Project Number');
            expect(formatProjectDisplay(undefined)).toBe('No Project Number');
            expect(formatProjectDisplay(123456)).toBe('No Project Number');
            expect(formatProjectDisplay('')).toBe('No Project Number');
        });

        test('should handle leading zeros correctly', () => {
            expect(formatProjectDisplay('NY25000')).toBe('Project NY-2025-0');
            expect(formatProjectDisplay('AF00001')).toBe('Project AF-2000-1');
        });
    });

    describe('calculateDealPriority', () => {
        
        test('should calculate priority based on deal value', () => {
            expect(calculateDealPriority(150000, 'Navy')).toBe(10); // High value + Navy modifier
            expect(calculateDealPriority(75000, 'Machining')).toBe(4); // Good value + neutral modifier
            expect(calculateDealPriority(25000, 'Electrical')).toBe(5); // Medium value + positive modifier
        });

        test('should handle department modifiers correctly', () => {
            const baseValue = 50000; // Gets base score of 4
            
            expect(calculateDealPriority(baseValue, 'Navy')).toBe(8); // 4 * 2 = 8
            expect(calculateDealPriority(baseValue, 'Electrical')).toBe(6); // 4 * 1.5 = 6
            expect(calculateDealPriority(baseValue, 'Machining')).toBe(4); // 4 * 1 = 4
            expect(calculateDealPriority(baseValue, 'Laser Cladding')).toBe(2); // 4 * 0.5 = 2
        });

        test('should handle invalid inputs', () => {
            expect(calculateDealPriority(-1000, 'Navy')).toBe(1);
            expect(calculateDealPriority('invalid', 'Navy')).toBe(1);
            expect(calculateDealPriority(null, 'Navy')).toBe(1);
        });

        test('should cap priority at 10', () => {
            expect(calculateDealPriority(1000000, 'Navy')).toBe(10);
        });

        test('should handle unknown departments with default modifier', () => {
            expect(calculateDealPriority(50000, 'Unknown Department')).toBe(4);
        });
    });

    describe('isValidEmail', () => {
        
        test('should validate correct email formats', () => {
            expect(isValidEmail('test@example.com')).toBe(true);
            expect(isValidEmail('user.name@company.co.uk')).toBe(true);
            expect(isValidEmail('test+tag@domain.org')).toBe(true);
        });

        test('should reject invalid email formats', () => {
            expect(isValidEmail('invalid-email')).toBe(false);
            expect(isValidEmail('@example.com')).toBe(false);
            expect(isValidEmail('test@')).toBe(false);
            expect(isValidEmail('test@.com')).toBe(false);
            expect(isValidEmail('test spaces@example.com')).toBe(false);
        });

        test('should handle null, undefined, and non-string inputs', () => {
            expect(isValidEmail(null)).toBe(false);
            expect(isValidEmail(undefined)).toBe(false);
            expect(isValidEmail(123)).toBe(false);
            expect(isValidEmail('')).toBe(false);
        });

        test('should handle whitespace', () => {
            expect(isValidEmail('  test@example.com  ')).toBe(true);
            expect(isValidEmail(' ')).toBe(false);
        });
    });

    describe('extractCompanyDomain', () => {
        
        test('should extract domains from valid emails', () => {
            expect(extractCompanyDomain('john@example.com')).toBe('example.com');
            expect(extractCompanyDomain('user@COMPANY.CO.UK')).toBe('company.co.uk');
            expect(extractCompanyDomain('test@sub.domain.org')).toBe('sub.domain.org');
        });

        test('should return null for invalid emails', () => {
            expect(extractCompanyDomain('invalid-email')).toBeNull();
            expect(extractCompanyDomain('@example.com')).toBeNull();
            expect(extractCompanyDomain('test@')).toBeNull();
        });

        test('should handle null and undefined inputs', () => {
            expect(extractCompanyDomain(null)).toBeNull();
            expect(extractCompanyDomain(undefined)).toBeNull();
        });

        test('should handle whitespace correctly', () => {
            expect(extractCompanyDomain('  test@example.com  ')).toBe('example.com');
        });
    });

    describe('formatCurrency', () => {
        
        test('should format positive values correctly', () => {
            expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
            expect(formatCurrency(1000000, 'EUR')).toBe('€1,000,000.00');
            expect(formatCurrency(999.99, 'GBP')).toBe('£999.99');
        });

        test('should format negative values correctly', () => {
            expect(formatCurrency(-1234.56, 'USD')).toBe('-$1,234.56');
            expect(formatCurrency(-999, 'EUR')).toBe('-€999.00');
        });

        test('should handle zero correctly', () => {
            expect(formatCurrency(0, 'USD')).toBe('$0.00');
        });

        test('should use default USD currency', () => {
            expect(formatCurrency(100)).toBe('$100.00');
        });

        test('should handle unknown currencies', () => {
            expect(formatCurrency(100, 'XYZ')).toBe('XYZ100.00');
        });

        test('should handle invalid numeric values', () => {
            expect(formatCurrency('invalid', 'USD')).toBe('---');
            expect(formatCurrency(null, 'USD')).toBe('---');
            expect(formatCurrency(undefined, 'USD')).toBe('---');
            expect(formatCurrency(NaN, 'USD')).toBe('---');
        });

        test('should handle decimal precision correctly', () => {
            expect(formatCurrency(100.1, 'USD')).toBe('$100.10');
            expect(formatCurrency(100.999, 'USD')).toBe('$101.00'); // rounds
        });
    });

    describe('Integration Tests - Business Logic Consistency', () => {
        
        test('should consistently handle email processing', () => {
            const validEmail = 'test@company.com';
            
            expect(isValidEmail(validEmail)).toBe(true);
            expect(extractCompanyDomain(validEmail)).toBe('company.com');
        });

        test('should handle project display and priority consistently', () => {
            const projectNumber = 'NY25001';
            const dealValue = 75000;
            const department = 'Navy';
            
            expect(formatProjectDisplay(projectNumber)).toBe('Project NY-2025-1');
            expect(calculateDealPriority(dealValue, department)).toBe(8);
        });
    });
}); 