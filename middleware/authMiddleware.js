/**
 * @fileoverview Authentication middleware for automatic token validation and refresh.
 * Provides middleware functions to check and refresh authentication tokens,
 * and automatically redirect to auth flows when tokens are missing or expired.
 */

import * as tokenService from '../services/secureTokenService.js';
import tokenRefreshManager from '../services/tokenRefreshManager.js';
import logger from '../lib/logger.js';

/**
 * Middleware to check and refresh Pipedrive authentication for a company.
 * If tokens are missing or refresh fails, it returns an auth required response.
 * 
 * @param {Object} req - Express request object (expects companyId in body or query)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>} Calls next() if authenticated, or returns auth required response
 */
export const requirePipedriveAuth = async (req, res, next) => {
    // Check for companyId in multiple possible fields for compatibility
    const companyId = req.body?.companyId || req.query?.companyId || 
                     req.body?.pipedriveCompanyId || req.query?.pipedriveCompanyId;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            error: 'Company ID is required',
            authRequired: true
        });
    }

    try {
        const tokenData = await tokenService.getAuthToken(companyId, 'pipedrive');
        
        if (!tokenData || !tokenData.accessToken) {
            logger.warn('Pipedrive not authenticated for company', {
                companyId,
                hasTokens: !!tokenData
            });
            
            return res.status(401).json({
                success: false,
                error: `Pipedrive not authenticated for company ${companyId}`,
                authRequired: true,
                authType: 'pipedrive',
                companyId: companyId,
                authUrl: `${process.env.API_BASE_URL || 'http://localhost:3000'}/auth/auth-url?companyId=${companyId}`
            });
        }

        // Check if token needs refresh
        if (Date.now() >= tokenData.tokenExpiresAt) {
            logger.info('Pipedrive token expired, initiating refresh', { companyId });
            
            try {
                // Use token refresh manager to prevent race conditions
                const refreshedToken = await tokenRefreshManager.refreshToken(
                    companyId,
                    'pipedrive',
                    () => tokenService.refreshPipedriveToken(companyId)
                );
                
                logger.info('Successfully refreshed Pipedrive token', { companyId });
                
                // Attach refreshed tokens to request
                req.pipedriveAuth = {
                    accessToken: refreshedToken.accessToken,
                    apiDomain: refreshedToken.apiDomain,
                    companyId: companyId
                };
            } catch (refreshError) {
                logger.error('Failed to refresh Pipedrive token', {
                    companyId,
                    error: refreshError.message
                });
                
                return res.status(401).json({
                    success: false,
                    error: refreshError.message.includes('rate limit') 
                        ? refreshError.message 
                        : 'Pipedrive token expired and refresh failed. Please re-authenticate.',
                    authRequired: true,
                    authType: 'pipedrive',
                    companyId: companyId,
                    authUrl: `${process.env.API_BASE_URL || 'http://localhost:3000'}/auth?companyId=${companyId}`
                });
            }
        } else {
            // Attach tokens to request for use in controllers
            req.pipedriveAuth = {
                accessToken: tokenData.accessToken,
                apiDomain: tokenData.apiDomain,
                companyId: companyId
            };
        }

        next();

    } catch (error) {
        logger.error('Error in Pipedrive auth middleware', {
            companyId,
            error: error.message
        });
        
        res.status(500).json({
            success: false,
            error: 'Authentication check failed',
            authRequired: true
        });
    }
};

/**
 * Middleware to check and refresh Xero authentication for a company.
 * Unlike Pipedrive auth, this is optional - if Xero isn't connected, it just continues.
 * 
 * @param {Object} req - Express request object (expects companyId in body or query)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>} Always calls next(), but may attach Xero auth info
 */
export const optionalXeroAuth = async (req, res, next) => {
    // Check for companyId in multiple possible fields for compatibility
    const companyId = req.body?.companyId || req.query?.companyId || 
                     req.body?.pipedriveCompanyId || req.query?.pipedriveCompanyId ||
                     req.pipedriveAuth?.companyId;

    if (!companyId) {
        return next(); // Continue without Xero auth if no company ID
    }

    try {
        const tokenData = await tokenService.getAuthToken(companyId, 'xero');
        
        if (!tokenData || !tokenData.accessToken) {
            logger.info('Xero not connected for company', { companyId });
            req.xeroAuth = null;
            return next();
        }

        // Check if token needs refresh
        if (Date.now() >= tokenData.tokenExpiresAt) {
            logger.info('Xero token expired, initiating refresh', { companyId });
            
            try {
                // Use token refresh manager to prevent race conditions
                const refreshedToken = await tokenRefreshManager.refreshToken(
                    companyId,
                    'xero',
                    () => tokenService.refreshXeroToken(companyId)
                );
                
                logger.info('Successfully refreshed Xero token', { companyId });
                
                // Attach refreshed tokens to request
                req.xeroAuth = {
                    accessToken: refreshedToken.accessToken,
                    tenantId: refreshedToken.tenantId,
                    companyId: companyId
                };
            } catch (refreshError) {
                logger.warn('Failed to refresh Xero token', {
                    companyId,
                    error: refreshError.message
                });
                req.xeroAuth = null;
                return next();
            }
        } else {
            // Attach Xero tokens to request for use in controllers
            req.xeroAuth = {
                accessToken: tokenData.accessToken,
                tenantId: tokenData.tenantId,
                companyId: companyId
            };
        }

        next();

    } catch (error) {
        logger.error('Error in Xero auth middleware', {
            companyId,
            error: error.message
        });
        
        // Don't fail the request for Xero issues, just continue without Xero
        req.xeroAuth = null;
        next();
    }
};

/**
 * Middleware to check and refresh Xero authentication for a company.
 * This is REQUIRED - if Xero isn't connected, it returns 401 auth required response.
 * 
 * @param {Object} req - Express request object (expects companyId in body or query)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>} Calls next() if authenticated, or returns auth required response
 */
export const requireXeroAuth = async (req, res, next) => {
    // Check for companyId in multiple possible fields for compatibility
    const companyId = req.body?.companyId || req.query?.companyId || 
                     req.body?.pipedriveCompanyId || req.query?.pipedriveCompanyId ||
                     req.pipedriveAuth?.companyId;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            error: 'Company ID is required',
            authRequired: true
        });
    }

    try {
        const tokenData = await tokenService.getAuthToken(companyId, 'xero');
        
        if (!tokenData || !tokenData.accessToken) {
            logger.warn('Xero authentication required but not found', { companyId });
            
            return res.status(401).json({
                success: false,
                error: `Xero not authenticated for company ${companyId}. Please connect to Xero first.`,
                authRequired: true,
                authType: 'xero',
                companyId: companyId,
                authUrl: `${process.env.API_BASE_URL || 'http://localhost:3000'}/auth/connect-xero?pipedriveCompanyId=${companyId}`
            });
        }

        // Check if token needs refresh
        if (Date.now() >= tokenData.tokenExpiresAt) {
            logger.info('Xero token expired, initiating refresh', { companyId });
            
            try {
                // Use token refresh manager to prevent race conditions
                const refreshedToken = await tokenRefreshManager.refreshToken(
                    companyId,
                    'xero',
                    () => tokenService.refreshXeroToken(companyId)
                );
                
                logger.info('Successfully refreshed Xero token', { companyId });
                
                // Attach refreshed tokens to request
                req.xeroAuth = {
                    accessToken: refreshedToken.accessToken,
                    tenantId: refreshedToken.tenantId,
                    companyId: companyId
                };
            } catch (refreshError) {
                logger.error('Failed to refresh Xero token', {
                    companyId,
                    error: refreshError.message
                });
                
                return res.status(401).json({
                    success: false,
                    error: refreshError.message.includes('rate limit') 
                        ? refreshError.message 
                        : 'Xero token expired and refresh failed. Please re-authenticate.',
                    authRequired: true,
                    authType: 'xero',
                    companyId: companyId,
                    authUrl: `${process.env.API_BASE_URL || 'http://localhost:3000'}/auth/connect-xero?pipedriveCompanyId=${companyId}`
                });
            }
        } else {
            // Attach Xero tokens to request for use in controllers
            req.xeroAuth = {
                accessToken: tokenData.accessToken,
                tenantId: tokenData.tenantId,
                companyId: companyId
            };
        }

        next();

    } catch (error) {
        logger.error('Error in required Xero auth middleware', {
            companyId,
            error: error.message
        });
        
        res.status(500).json({
            success: false,
            error: 'Xero authentication check failed',
            authRequired: true
        });
    }
};

/**
 * Combined middleware that requires both Pipedrive and Xero authentication.
 * This should be used for endpoints that absolutely need both integrations.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>} Calls next() if both are authenticated
 */
export const requireBothPipedriveAndXero = async (req, res, next) => {
    return requirePipedriveAuth(req, res, async () => {
        return requireXeroAuth(req, res, next);
    });
};

/**
 * Combined middleware that requires Pipedrive auth and optionally includes Xero auth.
 * This is the most commonly used middleware for routes that need Pipedrive access.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>} Calls next() if Pipedrive is authenticated
 */
export const requirePipedriveWithOptionalXero = async (req, res, next) => {
    return requirePipedriveAuth(req, res, async () => {
        return optionalXeroAuth(req, res, next);
    });
};

/**
 * Middleware that checks if any authentication is required and provides
 * helpful information about what auth is needed.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>} Returns auth status information
 */
export const checkAuthRequirements = async (req, res, next) => {
    // Check for companyId in multiple possible fields for compatibility
    const companyId = req.body?.companyId || req.query?.companyId || 
                     req.body?.pipedriveCompanyId || req.query?.pipedriveCompanyId;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            error: 'Company ID is required to check authentication requirements'
        });
    }

    try {
        const pipedriveToken = await tokenService.getAuthToken(companyId, 'pipedrive');
        const xeroToken = await tokenService.getAuthToken(companyId, 'xero');
        const currentTime = Date.now();

        const authStatus = {
            companyId,
            pipedrive: {
                required: true,
                authenticated: !!(pipedriveToken && pipedriveToken.accessToken),
                expired: pipedriveToken ? currentTime >= pipedriveToken.tokenExpiresAt : true,
                authUrl: `/auth?companyId=${companyId}`
            },
            xero: {
                required: false,
                authenticated: !!(xeroToken && xeroToken.accessToken),
                expired: xeroToken ? currentTime >= xeroToken.tokenExpiresAt : true,
                authUrl: `/auth/connect-xero?pipedriveCompanyId=${companyId}`
            }
        };

        // Determine if any auth is required
        const authRequired = !authStatus.pipedrive.authenticated || authStatus.pipedrive.expired;

        res.json({
            success: true,
            authRequired,
            authStatus,
            message: authRequired 
                ? 'Authentication required to proceed'
                : 'All required authentication is available'
        });
    } catch (error) {
        logger.error('Error checking auth requirements', {
            companyId,
            error: error.message
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to check authentication requirements'
        });
    }
};
