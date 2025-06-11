/**
 * Token Refresh Manager
 * 
 * Handles token refresh operations with race condition prevention.
 * Uses in-memory locks to ensure only one refresh operation happens
 * per company/service combination at a time.
 * 
 * @module services/tokenRefreshManager
 */

import logger from '../lib/logger.js';

class TokenRefreshManager {
    constructor() {
        // Map to store refresh promises by key (companyId:service)
        this.refreshPromises = new Map();
        // Map to store refresh timestamps for rate limiting
        this.lastRefreshTime = new Map();
        // Minimum time between refresh attempts (5 seconds)
        this.minRefreshInterval = 5000;
    }

    /**
     * Get or create a refresh promise for a specific company and service
     * This ensures only one refresh happens at a time for each token
     * 
     * @param {string} companyId - Company identifier
     * @param {string} service - Service name (pipedrive or xero)
     * @param {Function} refreshFunction - The actual refresh function to call
     * @returns {Promise} The refresh promise
     */
    async refreshToken(companyId, service, refreshFunction) {
        const key = `${companyId}:${service}`;
        
        // Check if a refresh is already in progress
        if (this.refreshPromises.has(key)) {
            logger.info('Token refresh already in progress, waiting for completion', {
                companyId,
                service,
                key
            });
            return this.refreshPromises.get(key);
        }

        // Check rate limiting
        const lastRefresh = this.lastRefreshTime.get(key);
        if (lastRefresh) {
            const timeSinceLastRefresh = Date.now() - lastRefresh;
            if (timeSinceLastRefresh < this.minRefreshInterval) {
                logger.warn('Token refresh attempted too soon, rejecting', {
                    companyId,
                    service,
                    timeSinceLastRefresh,
                    minInterval: this.minRefreshInterval
                });
                throw new Error(`Token refresh rate limit exceeded. Please wait ${Math.ceil((this.minRefreshInterval - timeSinceLastRefresh) / 1000)} seconds.`);
            }
        }

        // Create new refresh promise
        logger.info('Starting new token refresh', {
            companyId,
            service,
            key
        });

        const refreshPromise = this.executeRefresh(key, refreshFunction);
        this.refreshPromises.set(key, refreshPromise);

        // Clean up after completion (success or failure)
        refreshPromise.finally(() => {
            logger.info('Token refresh completed, cleaning up', {
                companyId,
                service,
                key
            });
            this.refreshPromises.delete(key);
            this.lastRefreshTime.set(key, Date.now());
        });

        return refreshPromise;
    }

    /**
     * Execute the refresh function with error handling
     * 
     * @param {string} key - The refresh key
     * @param {Function} refreshFunction - The refresh function to execute
     * @returns {Promise} The result of the refresh
     */
    async executeRefresh(key, refreshFunction) {
        try {
            const result = await refreshFunction();
            logger.info('Token refresh successful', { key });
            return result;
        } catch (error) {
            logger.error('Token refresh failed', {
                key,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Clear all refresh promises (useful for testing)
     */
    clear() {
        this.refreshPromises.clear();
        this.lastRefreshTime.clear();
    }

    /**
     * Get current refresh status
     * 
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            activeRefreshes: Array.from(this.refreshPromises.keys()),
            refreshCount: this.refreshPromises.size,
            rateLimitedTokens: Array.from(this.lastRefreshTime.entries()).map(([key, time]) => ({
                key,
                lastRefresh: new Date(time).toISOString(),
                canRefreshIn: Math.max(0, this.minRefreshInterval - (Date.now() - time))
            }))
        };
    }
}

// Export singleton instance
export default new TokenRefreshManager(); 