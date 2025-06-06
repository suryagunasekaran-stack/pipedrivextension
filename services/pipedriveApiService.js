/**
 * Pipedrive API Integration Service
 * 
 * This module provides a comprehensive interface to the Pipedrive CRM API,
 * handling user authentication, deal management, contact information retrieval,
 * and custom field updates. All functions include proper error handling and
 * validation for reliable integration with the Pipedrive platform.
 * 
 * Key features:
 * - User and company information retrieval
 * - Deal, person, and organization data fetching
 * - Custom field updates for quotes and project numbers
 * - Product information retrieval for deals
 * 
 * @module services/pipedriveApiService
 */

import { getValidAccessToken } from './secureTokenService.js';
import axios from 'axios';

/**
 * Retrieves the current user's information from Pipedrive
 * 
 * @param {string} apiDomain - The Pipedrive API domain
 * @param {string} accessToken - Valid Pipedrive access token
 * @returns {Promise<Object>} User data including company_id
 * @throws {Error} When user data or company_id cannot be retrieved
 */
export async function getPipedriveUserMe(apiDomain, accessToken) {
    const userMeUrl = `${apiDomain}/v1/users/me`;
    const userResponse = await axios.get(userMeUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!userResponse.data || !userResponse.data.data || !userResponse.data.data.company_id) {
        throw new Error('Could not retrieve company_id from Pipedrive /v1/users/me');
    }
    return userResponse.data.data;
}

/**
 * Retrieves detailed information for a specific deal
 * 
 * @param {string} apiDomain - The Pipedrive API domain
 * @param {string} accessToken - Valid Pipedrive access token
 * @param {string|number} dealId - The ID of the deal to retrieve
 * @returns {Promise<Object>} Complete deal information
 * @throws {Error} When API credentials are missing or request fails
 */
export const getDealDetails = async (apiDomain, accessToken, dealId) => {
    if (!accessToken || !apiDomain) {
        console.error("Missing Pipedrive API domain or access token for getDealDetails.");
        throw new Error("Pipedrive API domain or access token not available.");
    }
    try {
        const response = await axios.get(`${apiDomain}/v1/deals/${dealId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data.data;
    } catch (error) {
        console.error('Error fetching Pipedrive deal details:', error.response ? error.response.data : error.message);
        throw error;
    }
};

/**
 * Retrieves detailed information for a specific person
 * 
 * @param {string} apiDomain - The Pipedrive API domain
 * @param {string} accessToken - Valid Pipedrive access token
 * @param {string|number} personId - The ID of the person to retrieve
 * @returns {Promise<Object>} Complete person information
 * @throws {Error} When API credentials are missing or request fails
 */
export const getPersonDetails = async (apiDomain, accessToken, personId) => {
    if (!accessToken || !apiDomain) {
        console.error("Missing Pipedrive API domain or access token for getPersonDetails.");
        throw new Error("Pipedrive API domain or access token not available.");
    }
    try {
        const response = await axios.get(`${apiDomain}/v1/persons/${personId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data.data;
    } catch (error) {
        console.error('Error fetching Pipedrive person details:', error.response ? error.response.data : error.message);
        throw error;
    }
};

/**
 * Retrieves detailed information for a specific organization
 * 
 * @param {string} apiDomain - The Pipedrive API domain
 * @param {string} accessToken - Valid Pipedrive access token
 * @param {string|number} orgId - The ID of the organization to retrieve
 * @returns {Promise<Object>} Complete organization information
 * @throws {Error} When API credentials are missing, orgId is not provided, or request fails
 */
export const getOrganizationDetails = async (apiDomain, accessToken, orgId) => {
    if (!accessToken || !apiDomain) {
        console.error("Missing Pipedrive API domain or access token for getOrganizationDetails.");
        throw new Error("Pipedrive API domain or access token not available.");
    }
    if (!orgId) {
        console.error("Organization ID is required for getOrganizationDetails.");
        throw new Error("Organization ID not provided.");
    }
    try {
        const response = await axios.get(`${apiDomain}/v1/organizations/${orgId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data.data;
    } catch (error) {
        console.error('Error fetching Pipedrive organization details:', error.response ? error.response.data : error.message);
        throw error;
    }
};

/**
 * Retrieves all products associated with a specific deal
 * 
 * @param {string} apiDomain - The Pipedrive API domain
 * @param {string} accessToken - Valid Pipedrive access token
 * @param {string|number} dealId - The ID of the deal to get products for
 * @returns {Promise<Array>} Array of product data or empty array if none found
 */
export const getDealProducts = async (apiDomain, accessToken, dealId) => {
    const url = `${apiDomain}/v1/deals/${dealId}/products`;
    const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    return response.data.data || [];
}

/**
 * Updates a deal with a quote number in a custom field
 * 
 * @param {string} apiDomain - The Pipedrive API domain
 * @param {string} accessToken - Valid Pipedrive access token
 * @param {string|number} dealId - The ID of the deal to update
 * @param {string} quoteNumber - The quote number to store in the deal
 * @returns {Promise<Object>} Updated deal data from Pipedrive
 * @throws {Error} When credentials are missing, custom field key is not configured, or update fails
 */
export const updateDealWithQuoteNumber = async (apiDomain, accessToken, dealId, quoteNumber) => {
  if (!accessToken) {
    throw new Error('Pipedrive access token not provided.');
  }
  if (!apiDomain) {
    throw new Error('Pipedrive API domain not provided.');
  }

  const quoteCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY;

  if (!quoteCustomFieldKey) {
    console.error('PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY is not set in .env. Skipping deal update.');
    throw new Error('PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY is not configured.'); 
  }

  try {
    const response = await axios.put(
      `${apiDomain}/v1/deals/${dealId}`,
      { [quoteCustomFieldKey]: quoteNumber },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      'Error updating Pipedrive deal field:',
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
    throw error;
  }
};

/**
 * Updates a deal with a project number in a custom field
 * 
 * @param {string} apiDomain - The Pipedrive API domain
 * @param {string} accessToken - Valid Pipedrive access token
 * @param {string|number} dealId - The ID of the deal to update
 * @param {string} projectNumber - The project number to store in the deal
 * @returns {Promise<Object>} Updated deal data from Pipedrive
 * @throws {Error} When credentials are missing, custom field key is not configured, or update fails
 */
export const updateDealWithProjectNumber = async (apiDomain, accessToken, dealId, projectNumber) => {
  if (!accessToken) {
    throw new Error('Pipedrive access token not provided.');
  }
  if (!apiDomain) {
    throw new Error('Pipedrive API domain not provided.');
  }

  const projectNumberCustomFieldKey = process.env.PIPEDRIVE_PROJECT_NUMBER_CUSTOM_FIELD_KEY;

  if (!projectNumberCustomFieldKey) {
    console.error('PIPEDRIVE_PROJECT_NUMBER_CUSTOM_FIELD_KEY is not set in .env. Skipping deal update.');
    throw new Error('PIPEDRIVE_PROJECT_NUMBER_CUSTOM_FIELD_KEY is not configured.'); 
  }

  try {
    const response = await axios.put(
      `${apiDomain}/v1/deals/${dealId}`,
      { [projectNumberCustomFieldKey]: projectNumber },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      'Error updating Pipedrive deal with project number:',
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
    throw error;
  }
};
