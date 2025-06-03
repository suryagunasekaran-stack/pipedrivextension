import { CompanyConfig } from '../models/companyConfigModel.js';

// Cache for company configurations
const configCache = new Map();

/**
 * Get configuration for a specific company
 * @param {string} companyId - The company ID to get configuration for
 * @returns {Promise<Object>} Company configuration
 */
export async function getCompanyConfig(companyId) {
    // Check cache first
    if (configCache.has(companyId)) {
        return configCache.get(companyId);
    }

    // Get from database
    const config = await CompanyConfig.findOne({ companyId, isActive: true });
    if (!config) {
        throw new Error(`No configuration found for company ${companyId}`);
    }

    // Cache the result
    configCache.set(companyId, config);
    return config;
}

/**
 * Update configuration for a specific company
 * @param {string} companyId - The company ID to update
 * @param {Object} configData - The new configuration data
 * @returns {Promise<Object>} Updated company configuration
 */
export async function updateCompanyConfig(companyId, configData) {
    const config = await CompanyConfig.findOneAndUpdate(
        { companyId },
        { 
            $set: { 
                config: configData,
                updatedAt: Date.now()
            }
        },
        { new: true, upsert: true }
    );

    // Update cache
    configCache.set(companyId, config);
    return config;
}

/**
 * Get a specific configuration value for a company
 * @param {string} companyId - The company ID
 * @param {string} path - Dot-notation path to the config value (e.g., 'pipedrive.clientId')
 * @returns {Promise<any>} The configuration value
 */
export async function getConfigValue(companyId, path) {
    const config = await getCompanyConfig(companyId);
    return path.split('.').reduce((obj, key) => obj?.[key], config.config);
}

/**
 * Clear configuration cache for a company
 * @param {string} companyId - The company ID to clear cache for
 */
export function clearConfigCache(companyId) {
    if (companyId) {
        configCache.delete(companyId);
    } else {
        configCache.clear();
    }
}

/**
 * Initialize default configuration for a company
 * @param {string} companyId - The company ID
 * @param {string} name - Company name
 * @param {Object} config - Initial configuration
 * @returns {Promise<Object>} Created company configuration
 */
export async function initializeCompanyConfig(companyId, name, config = {}) {
    const defaultConfig = {
        pipedrive: {
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            redirectUri: process.env.REDIRECT_URI,
            apiDomain: null
        },
        xero: {
            clientId: process.env.XERO_CLIENT_ID,
            clientSecret: process.env.XERO_CLIENT_SECRET,
            redirectUri: process.env.XERO_REDIRECT_URI
        },
        frontend: {
            baseUrl: process.env.FRONTEND_BASE_URL
        },
        customFields: {
            department: process.env.PIPEDRIVE_QUOTE_CUSTOM_DEPARTMENT,
            vesselName: process.env.PIPEDRIVE_QUOTE_CUSTOM_VESSEL_NAME,
            salesInCharge: process.env.PIPEDRIVE_QUOTE_CUSTOM_SALES_IN_CHARGE,
            location: process.env.PIPEDRIVE_QUOTE_CUSTOM_LOCATION,
            quoteNumber: process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY
        }
    };

    const mergedConfig = {
        ...defaultConfig,
        ...config
    };

    return updateCompanyConfig(companyId, mergedConfig);
} 