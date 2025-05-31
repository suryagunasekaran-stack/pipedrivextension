import { getPipedriveAccessToken } from './tokenService.js';
import axios from 'axios'; // Changed to import

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

export async function getDealDetails(apiDomain, accessToken, dealId) {
    const url = `${apiDomain}/v1/deals/${dealId}`;
    const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    return response.data.data;
}

export async function getPersonDetails(apiDomain, accessToken, personId) {
    const url = `${apiDomain}/v1/persons/${personId}`;
    const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    return response.data.data;
}

export async function getOrganizationDetails(apiDomain, accessToken, orgId) {
    // Assuming a similar structure for organization details if needed
    const url = `${apiDomain}/v1/organizations/${orgId}`;
    const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    return response.data.data;
}

export async function getDealProducts(apiDomain, accessToken, dealId) {
    const url = `${apiDomain}/v1/deals/${dealId}/products`;
    const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    return response.data.data || [];
}

// Add other Pipedrive API call functions as needed

export const updateDealWithQuoteNumber = async (dealId, quoteNumber, companyId) => {
  const accessToken = await getPipedriveAccessToken(companyId);
  if (!accessToken) {
    throw new Error('Pipedrive access token not found.');
  }

  const pipedriveApiUrl = process.env.PIPEDRIVE_API_URL;
  const quoteCustomFieldKey = process.env.PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY; // Ensure this is in your .env

  if (!quoteCustomFieldKey) {
    console.error('PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY is not set in .env. Skipping deal update.');
    return null; // Or throw an error if this update is critical
  }

  try {
    const response = await axios.put(
      `${pipedriveApiUrl}/v1/deals/${dealId}`,
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
      'Error updating Pipedrive deal:',
      error.response ? error.response.data : error.message
    );
    // Decide if this error should be propagated or handled (e.g., by logging and continuing)
    // For now, let's re-throw to make the caller aware
    throw error;
  }
};
