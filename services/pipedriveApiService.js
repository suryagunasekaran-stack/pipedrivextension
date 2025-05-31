import { getPipedriveAccessToken } from './tokenService.js';
import axios from 'axios';

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
        return response.data.data; // Pipedrive API typically wraps data in a 'data' object
    } catch (error) {
        console.error('Error fetching Pipedrive organization details:', error.response ? error.response.data : error.message);
        // Optionally, check for 404 specifically if needed
        // if (error.response && error.response.status === 404) {
        //     return null; // Or throw a custom "NotFound" error
        // }
        throw error; // Re-throw to be handled by the caller
    }
};

export const getDealProducts = async (apiDomain, accessToken, dealId) => {
    const url = `${apiDomain}/v1/deals/${dealId}/products`;
    const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    return response.data.data || [];
}

// Add other Pipedrive API call functions as needed

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
    console.log('Pipedrive deal updated successfully with Xero quote number:', response.data);
    return response.data;
  } catch (error) {
    console.error(
      'Error updating Pipedrive deal field:', // Clarified error message
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
    throw error; // Re-throw to be handled by the controller
  }
};
