/**
 * Input Validation Middleware
 * 
 * Provides comprehensive input validation for all API endpoints.
 * Uses a declarative approach with validation schemas for maintainability.
 * 
 * @module middleware/inputValidation
 */

import logger from '../lib/logger.js';

/**
 * Validation rules for different data types
 */
const validators = {
    /**
     * Validates a required string field
     */
    requiredString: (value, fieldName) => {
        if (typeof value !== 'string' || value.trim().length === 0) {
            return `${fieldName} is required and must be a non-empty string`;
        }
        return null;
    },

    /**
     * Validates an optional string field
     */
    optionalString: (value, fieldName) => {
        if (value !== undefined && typeof value !== 'string') {
            return `${fieldName} must be a string`;
        }
        return null;
    },

    /**
     * Validates a required number field
     */
    requiredNumber: (value, fieldName) => {
        if (typeof value !== 'number' || isNaN(value)) {
            return `${fieldName} is required and must be a valid number`;
        }
        return null;
    },

    /**
     * Validates a positive number
     */
    positiveNumber: (value, fieldName) => {
        const numberError = validators.requiredNumber(value, fieldName);
        if (numberError) return numberError;
        if (value <= 0) {
            return `${fieldName} must be a positive number`;
        }
        return null;
    },

    /**
     * Validates an email address
     */
    email: (value, fieldName) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            return `${fieldName} must be a valid email address`;
        }
        return null;
    },

    /**
     * Validates a UUID
     */
    uuid: (value, fieldName) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
            return `${fieldName} must be a valid UUID`;
        }
        return null;
    },

    /**
     * Validates an ISO date string
     */
    isoDate: (value, fieldName) => {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
            return `${fieldName} must be a valid ISO date string`;
        }
        return null;
    },

    /**
     * Validates an array of items
     */
    array: (value, fieldName, itemValidator) => {
        if (!Array.isArray(value)) {
            return `${fieldName} must be an array`;
        }
        if (itemValidator) {
            for (let i = 0; i < value.length; i++) {
                const error = itemValidator(value[i], `${fieldName}[${i}]`);
                if (error) return error;
            }
        }
        return null;
    },

    /**
     * Validates line items for quotes/invoices
     */
    lineItems: (value, fieldName) => {
        const arrayError = validators.array(value, fieldName);
        if (arrayError) return arrayError;
        
        if (value.length === 0) {
            return `${fieldName} must contain at least one item`;
        }

        for (let i = 0; i < value.length; i++) {
            const item = value[i];
            if (!item.Description || typeof item.Description !== 'string') {
                return `${fieldName}[${i}].Description is required`;
            }
            if (typeof item.Quantity !== 'number' || item.Quantity <= 0) {
                return `${fieldName}[${i}].Quantity must be a positive number`;
            }
            if (typeof item.UnitAmount !== 'number' || item.UnitAmount < 0) {
                return `${fieldName}[${i}].UnitAmount must be a non-negative number`;
            }
        }
        return null;
    }
};

/**
 * Validation schemas for different endpoints
 */
const validationSchemas = {
    // Xero endpoints
    createXeroQuote: {
        body: {
            pipedriveCompanyId: validators.requiredString,
            pipedriveDealId: validators.requiredString
        }
    },

    acceptXeroQuote: {
        body: {
            dealId: validators.requiredString,
            pipedriveCompanyId: validators.requiredString
        }
    },

    createXeroProject: {
        body: {
            pipedriveCompanyId: validators.requiredString,
            contactId: validators.requiredString,
            name: validators.requiredString,
            vesselName: validators.requiredString,
            estimateAmount: validators.optionalString,
            deadline: (value) => value ? validators.isoDate(value, 'deadline') : null,
            quoteId: validators.optionalString,
            dealId: validators.optionalString
        }
    },

    updateQuotationOnXero: {
        body: {
            pipedriveCompanyId: validators.requiredString,
            dealId: validators.requiredString
        }
    },

    updateQuoteWithVersioning: {
        body: {
            dealId: validators.requiredString,
            companyId: validators.requiredString,
            quoteId: validators.requiredString
        }
    },

    createInvoiceFromQuote: {
        body: {
            companyId: validators.requiredString,
            quoteId: validators.requiredString
        }
    },

    createPartialInvoiceFromQuote: {
        body: {
            companyId: validators.requiredString,
            quoteId: validators.requiredString,
            selectedLineItems: validators.lineItems
        }
    },

    // Project endpoints
    createFullProject: {
        body: {
            pipedriveDealId: validators.requiredString,
            pipedriveCompanyId: validators.requiredString,
            existingProjectNumberToLink: validators.optionalString
        }
    },

    // Pipedrive endpoints
    getDealDetails: {
        query: {
            dealId: validators.requiredString,
            companyId: validators.requiredString
        }
    }
};

/**
 * Validates request data against a schema
 * 
 * @param {Object} data - Data to validate
 * @param {Object} schema - Validation schema
 * @returns {Array} Array of error messages
 */
function validateAgainstSchema(data, schema) {
    const errors = [];

    for (const [field, validator] of Object.entries(schema)) {
        const value = data[field];
        
        if (typeof validator === 'function') {
            const error = validator(value, field);
            if (error) {
                errors.push(error);
            }
        } else if (typeof validator === 'object' && validator !== null) {
            // Nested validation
            const nestedErrors = validateAgainstSchema(value || {}, validator);
            errors.push(...nestedErrors);
        }
    }

    return errors;
}

/**
 * Creates validation middleware for a specific endpoint
 * 
 * @param {string} schemaName - Name of the validation schema to use
 * @returns {Function} Express middleware function
 */
export function validate(schemaName) {
    return (req, res, next) => {
        const schema = validationSchemas[schemaName];
        
        if (!schema) {
            logger.error('Validation schema not found', { schemaName });
            return next();
        }

        const errors = [];

        // Validate body
        if (schema.body) {
            const bodyErrors = validateAgainstSchema(req.body, schema.body);
            errors.push(...bodyErrors.map(error => ({ location: 'body', message: error })));
        }

        // Validate query
        if (schema.query) {
            const queryErrors = validateAgainstSchema(req.query, schema.query);
            errors.push(...queryErrors.map(error => ({ location: 'query', message: error })));
        }

        // Validate params
        if (schema.params) {
            const paramErrors = validateAgainstSchema(req.params, schema.params);
            errors.push(...paramErrors.map(error => ({ location: 'params', message: error })));
        }

        if (errors.length > 0) {
            logger.warn('Input validation failed', {
                endpoint: schemaName,
                errors,
                body: req.body,
                query: req.query,
                params: req.params
            });

            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                validationErrors: errors
            });
        }

        next();
    };
}

/**
 * Sanitizes input to prevent XSS and injection attacks
 * 
 * @param {any} input - Input to sanitize
 * @returns {any} Sanitized input
 */
export function sanitizeInput(input) {
    if (typeof input === 'string') {
        // Remove any HTML tags and trim whitespace
        return input.replace(/<[^>]*>?/gm, '').trim();
    } else if (Array.isArray(input)) {
        return input.map(sanitizeInput);
    } else if (input && typeof input === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(input)) {
            sanitized[key] = sanitizeInput(value);
        }
        return sanitized;
    }
    return input;
}

/**
 * Middleware to sanitize all inputs
 */
export function sanitizeAll(req, res, next) {
    req.body = sanitizeInput(req.body);
    req.query = sanitizeInput(req.query);
    req.params = sanitizeInput(req.params);
    next();
}

/**
 * Custom validators for specific business rules
 */
export const customValidators = {
    projectNumber: (value) => {
        const projectNumberRegex = /^[A-Z]{2}\d{5}$/;
        if (!projectNumberRegex.test(value)) {
            return 'Project number must be in format XX00000 (2 letters + 5 digits)';
        }
        return null;
    },

    quoteNumber: (value) => {
        const quoteNumberRegex = /^QU-\d{4}(\s+v\d+)?$/;
        if (!quoteNumberRegex.test(value)) {
            return 'Quote number must be in format QU-0000 or QU-0000 v2';
        }
        return null;
    }
};

export default {
    validate,
    sanitizeAll,
    sanitizeInput,
    validators,
    customValidators
}; 