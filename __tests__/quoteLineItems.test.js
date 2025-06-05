import { validateLineItem, calculateLineItemTotal, formatLineItem } from '../utils/quoteLineItemUtils';

describe('Quote Line Item Validation', () => {
  describe('validateLineItem', () => {
    test('should validate correct line item format', () => {
      const validLineItem = {
        description: 'Test Item',
        quantity: 2,
        unitAmount: 100.50,
        accountCode: '200',
        taxType: 'NONE'
      };
      expect(validateLineItem(validLineItem)).toBe(true);
    });

    test('should reject line items with missing required fields', () => {
      const invalidLineItems = [
        { quantity: 2, unitAmount: 100.50 }, // Missing description
        { description: 'Test', unitAmount: 100.50 }, // Missing quantity
        { description: 'Test', quantity: 2 }, // Missing unitAmount
      ];
      invalidLineItems.forEach(item => {
        expect(validateLineItem(item)).toBe(false);
      });
    });

    test('should validate numeric fields', () => {
      const invalidNumericItems = [
        { description: 'Test', quantity: '2', unitAmount: 100.50 }, // String quantity
        { description: 'Test', quantity: 2, unitAmount: '100.50' }, // String unitAmount
        { description: 'Test', quantity: -1, unitAmount: 100.50 }, // Negative quantity
        { description: 'Test', quantity: 2, unitAmount: -100.50 }, // Negative unitAmount
      ];
      invalidNumericItems.forEach(item => {
        expect(validateLineItem(item)).toBe(false);
      });
    });

    test('should validate optional fields', () => {
      const validLineItem = {
        description: 'Test Item',
        quantity: 2,
        unitAmount: 100.50,
        accountCode: '200',
        taxType: 'NONE',
        discountRate: 10,
        discountAmount: 20.10
      };
      expect(validateLineItem(validLineItem)).toBe(true);
    });
  });

  describe('calculateLineItemTotal', () => {
    test('should calculate correct line item total', () => {
      const testCases = [
        {
          input: { quantity: 2, unitAmount: 100.50 },
          expected: 201.00
        },
        {
          input: { quantity: 1, unitAmount: 99.99 },
          expected: 99.99
        },
        {
          input: { quantity: 3, unitAmount: 50.00, discountRate: 10 },
          expected: 135.00 // 150 - 15 (10% discount)
        },
        {
          input: { quantity: 2, unitAmount: 100.00, discountAmount: 20.00 },
          expected: 180.00 // 200 - 20 (fixed discount)
        }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(calculateLineItemTotal(input)).toBe(expected);
      });
    });

    test('should handle decimal precision correctly', () => {
      const testCases = [
        {
          input: { quantity: 2, unitAmount: 100.555 },
          expected: 201.11 // Rounded to 2 decimal places
        },
        {
          input: { quantity: 3, unitAmount: 33.333 },
          expected: 100.00 // Rounded to 2 decimal places
        }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(calculateLineItemTotal(input)).toBe(expected);
      });
    });

    test('should throw error for invalid input', () => {
      expect(() => calculateLineItemTotal({ quantity: -1, unitAmount: 100 }))
        .toThrow('Invalid line item values');
      expect(() => calculateLineItemTotal({ quantity: 1, unitAmount: -100 }))
        .toThrow('Invalid line item values');
    });
  });

  describe('formatLineItem', () => {
    test('should format line item for Xero API', () => {
      const input = {
        description: 'Test Item',
        quantity: 2,
        unitAmount: 100.50,
        accountCode: '200',
        taxType: 'NONE'
      };

      const expected = {
        Description: 'Test Item',
        Quantity: 2,
        UnitAmount: 100.50,
        AccountCode: '200',
        TaxType: 'NONE',
        LineAmount: 201.00
      };

      expect(formatLineItem(input)).toEqual(expected);
    });

    test('should handle optional fields in formatting', () => {
      const input = {
        description: 'Test Item',
        quantity: 2,
        unitAmount: 100.50,
        accountCode: '200',
        taxType: 'NONE',
        discountRate: 10,
        discountAmount: 20.10,
        tracking: [{ Name: 'Department', Option: 'Sales' }]
      };

      const formatted = formatLineItem(input);
      expect(formatted).toHaveProperty('DiscountRate', 10);
      expect(formatted).toHaveProperty('DiscountAmount', 20.10);
      expect(formatted).toHaveProperty('Tracking');
      expect(formatted.Tracking).toHaveLength(1);
    });

    test('should validate input before formatting', () => {
      const invalidInput = {
        description: 'Test Item',
        quantity: -1,
        unitAmount: 100.50
      };

      expect(() => formatLineItem(invalidInput))
        .toThrow('Invalid line item');
    });
  });
}); 