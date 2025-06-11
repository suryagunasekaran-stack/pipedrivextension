/**
 * Batch Operations Service
 * 
 * Optimizes API calls by batching operations and implementing request-level caching.
 * Reduces redundant API calls and improves performance.
 * 
 * @module services/batchOperationsService
 */

import * as pipedriveApiService from './pipedriveApiService.js';
import * as xeroApiService from './xeroApiService.js';
import logger from '../lib/logger.js';

/**
 * Request-level cache for avoiding redundant API calls within a single request
 */
class RequestCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Get or fetch data with caching
     * 
     * @param {string} key - Cache key
     * @param {Function} fetchFunction - Function to fetch data if not cached
     * @returns {Promise<any>} Cached or fetched data
     */
    async getOrFetch(key, fetchFunction) {
        if (this.cache.has(key)) {
            logger.debug('Cache hit', { key });
            return this.cache.get(key);
        }

        logger.debug('Cache miss, fetching', { key });
        try {
            const data = await fetchFunction();
            this.cache.set(key, data);
            return data;
        } catch (error) {
            logger.error('Error fetching data for cache', { key, error: error.message });
            throw error;
        }
    }

    /**
     * Clear the cache
     */
    clear() {
        this.cache.clear();
    }
}

/**
 * Batch Operations Manager
 */
class BatchOperationsService {
    /**
     * Fetch multiple Pipedrive entities in parallel with caching
     * 
     * @param {Object} params - Parameters for batch fetch
     * @param {Object} params.auth - Authentication details {apiDomain, accessToken}
     * @param {Array<string>} params.dealIds - Array of deal IDs to fetch
     * @param {Array<string>} params.personIds - Array of person IDs to fetch
     * @param {Array<string>} params.orgIds - Array of organization IDs to fetch
     * @param {RequestCache} params.cache - Request cache instance
     * @returns {Promise<Object>} Object containing all fetched entities
     */
    async batchFetchPipedriveEntities(params) {
        const { auth, dealIds = [], personIds = [], orgIds = [], cache } = params;
        const results = {
            deals: {},
            persons: {},
            organizations: {}
        };

        // Create promises for all fetches
        const promises = [];

        // Fetch deals
        for (const dealId of dealIds) {
            const promise = cache.getOrFetch(
                `pipedrive:deal:${dealId}`,
                () => pipedriveApiService.getDealDetails(auth.apiDomain, auth.accessToken, dealId)
            ).then(deal => {
                results.deals[dealId] = deal;
            }).catch(error => {
                logger.error('Error fetching deal', { dealId, error: error.message });
                results.deals[dealId] = null;
            });
            promises.push(promise);
        }

        // Fetch persons
        for (const personId of personIds) {
            const promise = cache.getOrFetch(
                `pipedrive:person:${personId}`,
                () => pipedriveApiService.getPersonDetails(auth.apiDomain, auth.accessToken, personId)
            ).then(person => {
                results.persons[personId] = person;
            }).catch(error => {
                logger.error('Error fetching person', { personId, error: error.message });
                results.persons[personId] = null;
            });
            promises.push(promise);
        }

        // Fetch organizations
        for (const orgId of orgIds) {
            const promise = cache.getOrFetch(
                `pipedrive:org:${orgId}`,
                () => pipedriveApiService.getOrganizationDetails(auth.apiDomain, auth.accessToken, orgId)
            ).then(org => {
                results.organizations[orgId] = org;
            }).catch(error => {
                logger.error('Error fetching organization', { orgId, error: error.message });
                results.organizations[orgId] = null;
            });
            promises.push(promise);
        }

        // Wait for all fetches to complete
        await Promise.all(promises);

        logger.info('Batch fetch completed', {
            dealsCount: Object.keys(results.deals).length,
            personsCount: Object.keys(results.persons).length,
            organizationsCount: Object.keys(results.organizations).length
        });

        return results;
    }

    /**
     * Fetch deal with all related entities in one batch operation
     * 
     * @param {Object} params - Parameters
     * @param {Object} params.auth - Authentication details
     * @param {string} params.dealId - Deal ID
     * @param {RequestCache} params.cache - Request cache
     * @returns {Promise<Object>} Complete deal data with related entities
     */
    async fetchDealWithRelatedEntities(params) {
        const { auth, dealId, cache } = params;

        // First fetch the deal
        const deal = await cache.getOrFetch(
            `pipedrive:deal:${dealId}`,
            () => pipedriveApiService.getDealDetails(auth.apiDomain, auth.accessToken, dealId)
        );

        if (!deal) {
            throw new Error(`Deal ${dealId} not found`);
        }

        // Collect IDs of related entities
        const personIds = deal.person_id?.value ? [deal.person_id.value] : [];
        const orgIds = deal.org_id?.value ? [deal.org_id.value] : [];

        // Batch fetch related entities
        const relatedEntities = await this.batchFetchPipedriveEntities({
            auth,
            personIds,
            orgIds,
            cache
        });

        // Fetch products separately (usually requires different endpoint)
        const products = await cache.getOrFetch(
            `pipedrive:deal-products:${dealId}`,
            () => pipedriveApiService.getDealProducts(auth.apiDomain, auth.accessToken, dealId)
        );

        return {
            deal,
            person: personIds.length > 0 ? relatedEntities.persons[personIds[0]] : null,
            organization: orgIds.length > 0 ? relatedEntities.organizations[orgIds[0]] : null,
            products
        };
    }

    /**
     * Batch create Xero tasks
     * 
     * @param {Object} params - Parameters
     * @param {Object} params.auth - Xero authentication
     * @param {string} params.projectId - Project ID
     * @param {Array<string>} params.taskNames - Task names to create
     * @returns {Promise<Array>} Created tasks
     */
    async batchCreateXeroTasks(params) {
        const { auth, projectId, taskNames } = params;

        logger.info('Starting batch task creation', {
            projectId,
            taskCount: taskNames.length
        });

        const taskPromises = taskNames.map(taskName => 
            xeroApiService.createXeroTask(
                auth.accessToken,
                auth.tenantId,
                projectId,
                taskName
            )
            .then(task => ({
                success: true,
                taskName,
                task
            }))
            .catch(error => ({
                success: false,
                taskName,
                error: error.message
            }))
        );

        const results = await Promise.all(taskPromises);

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        logger.info('Batch task creation completed', {
            projectId,
            successful: successful.length,
            failed: failed.length,
            failedTasks: failed.map(f => f.taskName)
        });

        return results;
    }

    /**
     * Batch update multiple Pipedrive deals
     * 
     * @param {Object} params - Parameters
     * @param {Object} params.auth - Pipedrive authentication
     * @param {Array<Object>} params.updates - Array of {dealId, data} objects
     * @returns {Promise<Array>} Update results
     */
    async batchUpdatePipedriveDeals(params) {
        const { auth, updates } = params;

        logger.info('Starting batch deal update', {
            updateCount: updates.length
        });

        const updatePromises = updates.map(({ dealId, data }) =>
            pipedriveApiService.updateDeal(auth.apiDomain, auth.accessToken, dealId, data)
            .then(deal => ({
                success: true,
                dealId,
                deal
            }))
            .catch(error => ({
                success: false,
                dealId,
                error: error.message
            }))
        );

        const results = await Promise.all(updatePromises);

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        logger.info('Batch deal update completed', {
            successful: successful.length,
            failed: failed.length,
            failedDeals: failed.map(f => f.dealId)
        });

        return results;
    }

    /**
     * Optimize quote creation by pre-fetching all required data
     * 
     * @param {Object} params - Parameters
     * @param {Object} params.pipedriveAuth - Pipedrive authentication
     * @param {string} params.dealId - Deal ID
     * @param {RequestCache} params.cache - Request cache
     * @returns {Promise<Object>} All data needed for quote creation
     */
    async prepareQuoteCreationData(params) {
        const { pipedriveAuth, dealId, cache } = params;

        // Fetch deal with all related entities in one batch
        const dealData = await this.fetchDealWithRelatedEntities({
            auth: pipedriveAuth,
            dealId,
            cache
        });

        // Validate required data
        if (!dealData.organization) {
            throw new Error('Deal must be associated with an organization for quote creation');
        }

        return {
            deal: dealData.deal,
            organization: dealData.organization,
            person: dealData.person,
            products: dealData.products,
            contactName: dealData.organization.name,
            contactEmail: dealData.person?.email?.[0]?.value || null
        };
    }
}

// Export singleton instance and RequestCache class
export const batchOperations = new BatchOperationsService();
export { RequestCache };

// Middleware to attach request cache
export function attachRequestCache(req, res, next) {
    req.cache = new RequestCache();
    
    // Clean up cache after request
    res.on('finish', () => {
        if (req.cache) {
            req.cache.clear();
        }
    });

    next();
}

export default batchOperations; 