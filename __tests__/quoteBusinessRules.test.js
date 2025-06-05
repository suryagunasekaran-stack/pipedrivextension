import { validateQuoteCreation, mapProductsToLineItems, validateQuoteNumber } from '../utils/quoteBusinessRules';

describe('Quote Creation Business Rules', () => {
  describe('validateQuoteCreation', () => {
    test('should prevent quote creation for deal with existing quote', () => {
      const dealWithQuote = {
        id: '123',
        custom_fields: {
          [process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY]: 'Q-2024-001'
        }
      };

      expect(() => validateQuoteCreation(dealWithQuote))
        .toThrow('Deal already has an associated quote');
    });

    test('should prevent quote creation with empty products', () => {
      const dealWithoutProducts = {
        id: '123',
        custom_fields: {},
        products: []
      };

      expect(() => validateQuoteCreation(dealWithoutProducts))
        .toThrow('Quote must have at least one product');
    });

    test('should prevent quote creation without organization', () => {
      const dealWithoutOrg = {
        id: '123',
        custom_fields: {},
        products: [{ id: 1, name: 'Test Product' }],
        org_id: null
      };

      expect(() => validateQuoteCreation(dealWithoutOrg))
        .toThrow('Deal must be associated with an organization');
    });

    test('should validate quote creation with valid data', () => {
      const validDeal = {
        id: '123',
        custom_fields: {},
        products: [{ id: 1, name: 'Test Product', quantity: 1, item_price: 100 }],
        org_id: { value: '456' }
      };

      expect(validateQuoteCreation(validDeal)).toBe(true);
    });
  });

  describe('mapProductsToLineItems', () => {
    test('should correctly map Pipedrive products to Xero line items', () => {
      const pipedriveProducts = [
        {
          name: 'Product 1',
          quantity: 2,
          item_price: 100.5,
          product_id: 101
        },
        {
          name: 'Product 2',
          quantity: 1,
          item_price: 200.75,
          product_id: 102
        }
      ];

      const expectedLineItems = [
        {
          Description: 'Product 1',
          Quantity: 2,
          UnitAmount: 100.5,
          LineAmount: 201,
          AccountCode: '200',
          TaxType: 'NONE',
          Tracking: [
            {
              Name: 'ProductID',
              Option: '101'
            }
          ]
        },
        {
          Description: 'Product 2',
          Quantity: 1,
          UnitAmount: 200.75,
          LineAmount: 200.75,
          AccountCode: '200',
          TaxType: 'NONE',
          Tracking: [
            {
              Name: 'ProductID',
              Option: '102'
            }
          ]
        }
      ];

      const lineItems = mapProductsToLineItems(pipedriveProducts);
      expect(lineItems).toEqual(expectedLineItems);
    });

    test('should handle products with missing optional fields', () => {
      const productsWithMissingFields = [
        {
          id: 1,
          name: 'Product 1',
          quantity: 1,
          item_price: 100
        }
      ];

      const lineItems = mapProductsToLineItems(productsWithMissingFields);
      expect(lineItems[0]).toHaveProperty('Description', 'Product 1');
      expect(lineItems[0]).toHaveProperty('Quantity', 1);
      expect(lineItems[0]).toHaveProperty('UnitAmount', 100);
    });

    test('should throw error for products with missing required fields', () => {
      const invalidProducts = [
        { id: 1, name: 'Product 1' }, // Missing quantity and price
        { id: 2, quantity: 1 }, // Missing name and price
        { id: 3, item_price: 100 } // Missing name and quantity
      ];

      invalidProducts.forEach(product => {
        expect(() => mapProductsToLineItems([product]))
          .toThrow('Invalid product data');
      });
    });

    test('should handle product discounts and special pricing', () => {
      const productsWithDiscounts = [
        {
          id: 1,
          name: 'Discounted Product',
          quantity: 2,
          item_price: 100,
          discount_rate: 10
        },
        {
          id: 2,
          name: 'Special Price Product',
          quantity: 1,
          item_price: 200,
          special_price: 150
        }
      ];

      const lineItems = mapProductsToLineItems(productsWithDiscounts);
      
      // Check discounted product
      expect(lineItems[0]).toHaveProperty('DiscountRate', 10);
      expect(lineItems[0].LineAmount).toBe(180); // 200 - 20 (10% discount)

      // Check special price product
      expect(lineItems[1].UnitAmount).toBe(150);
      expect(lineItems[1].LineAmount).toBe(150);
    });
  });

  describe('validateQuoteNumber', () => {
    test('should validate correct quote number format', () => {
      const validQuoteNumbers = ['Q-2024-001', 'Q-2024-999'];
      validQuoteNumbers.forEach(number => {
        expect(validateQuoteNumber(number)).toBe(true);
      });
    });

    test('should reject invalid quote number formats', () => {
      const invalidQuoteNumbers = [
        'Q2024-001',    // Missing hyphen
        'Q-2024-1',     // Missing leading zeros
        'Q-24-001',     // Invalid year format
        'Q-2024-1000',  // Too many digits
        'q-2024-001'    // Lowercase prefix
      ];
      invalidQuoteNumbers.forEach(number => {
        expect(validateQuoteNumber(number)).toBe(false);
      });
    });

    test('should validate quote number uniqueness', () => {
      const existingQuoteNumbers = ['Q-2024-001', 'Q-2024-002'];
      const newQuoteNumber = 'Q-2024-001';

      expect(() => validateQuoteNumber(newQuoteNumber, existingQuoteNumbers))
        .toThrow('Quote number already exists');
    });
  });
}); 