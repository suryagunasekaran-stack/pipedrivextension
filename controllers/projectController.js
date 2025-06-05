/**
 * @fileoverview Project creation controller handling full project lifecycle.
 * Integrates Pipedrive deals with project numbering system and optional Xero project creation.
 * Manages token validation, project sequence generation, and comprehensive data aggregation.
 * 
 * This controller acts as an orchestrator, using helper functions from projectHelpers.js
 * to handle specific aspects of project creation in a clean, maintainable way.
 */

import 'dotenv/config';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../lib/logger.js';
import {
    validateProjectCreationRequest,
    validateAndRefreshPipedriveTokens,
    fetchAndValidateDeal,
    generateProjectNumber,
    handleXeroIntegration,
    fetchDealRelatedData,
    updateDealWithProjectNumber,
    createEnhancedDealObject
} from '../utils/projectHelpers.js';

/**
 * Creates a comprehensive project by orchestrating all project creation steps.
 * This function now uses authentication from middleware instead of handling it internally.
 * 
 * @param {Object} req - Express request object with body containing pipedriveDealId, pipedriveCompanyId, and optional existingProjectNumberToLink
 * @param {Object} res - Express response object
 * @returns {Promise<void>} Returns JSON with complete project data including Xero integration status
 * @throws {Error} Returns 400 for validation errors, 404 for missing deals, 500 for system errors
 */
export const createFullProject = asyncHandler(async (req, res) => {
    logger.info({
        operation: 'Create Full Project',
        pipedriveDealId: req.body.pipedriveDealId,
        pipedriveCompanyId: req.body.pipedriveCompanyId,
        existingProjectNumberToLink: req.body.existingProjectNumberToLink,
        userAgent: req.get('User-Agent')
    }, '🚀 Starting full project creation');

    try {
        // Step 1: Validate request parameters
        const { dealId, companyId, existingProjectNumberToLink } = validateProjectCreationRequest(req.body, req);

        // Step 2: Use authentication from middleware (req.pipedriveAuth is set by middleware)
        const { accessToken, apiDomain } = req.pipedriveAuth;

        // Step 3: Fetch and validate deal details
        const { dealDetails, departmentName } = await fetchAndValidateDeal(apiDomain, accessToken, dealId, req);

        // Step 4: Generate project number
        const projectNumber = await generateProjectNumber(dealId, departmentName, existingProjectNumberToLink, req);

        // Step 5: Handle Xero integration (if available)
        const xeroResult = await handleXeroIntegration(
            companyId, 
            dealDetails, 
            projectNumber, 
            dealId, 
            apiDomain, 
            accessToken, 
            req
        );

        // Step 6: Fetch comprehensive deal-related data
        const { personDetails, orgDetails, dealProducts } = await fetchDealRelatedData(
            apiDomain, 
            accessToken, 
            dealDetails, 
            dealId, 
            req
        );

        // Step 7: Update Pipedrive deal with project number
        await updateDealWithProjectNumber(apiDomain, accessToken, dealId, projectNumber, req);

        // Step 8: Create enhanced deal object
        const projectDealObject = createEnhancedDealObject(dealDetails, departmentName, projectNumber);

        // Step 9: Build and send response
        const responseData = {
            success: true,
            message: existingProjectNumberToLink 
                ? `Deal ${dealId} successfully linked to existing project ${projectNumber}.`
                : `New project created successfully with project number ${projectNumber}.`,
            projectNumber: projectNumber,
            deal: projectDealObject,
            person: personDetails,
            organization: orgDetails,
            products: dealProducts,
            xero: xeroResult,
            metadata: {
                dealId: dealId,
                companyId: companyId,
                isNewProject: !existingProjectNumberToLink,
                generatedAt: new Date().toISOString()
            }
        };

        logger.info({
            operation: 'Project Creation Success',
            dealId,
            companyId,
            projectNumber,
            xeroIntegrated: xeroResult.projectCreated
        }, '✅ Project creation completed successfully');

        res.status(201).json(responseData);

    } catch (error) {
        // Handle errors with appropriate status codes
        const statusCode = error.statusCode || 500;
        const errorResponse = {
            error: error.message,
            pipedriveDealId: req.body.pipedriveDealId,
            pipedriveCompanyId: req.body.pipedriveCompanyId,
            requestId: req.id
        };

        // Add additional error details for validation errors
        if (error.missingField) {
            errorResponse.missingField = error.missingField;
        }
        if (error.details) {
            errorResponse.details = error.details;
        }

        logger.error({
            operation: 'Project Creation Error',
            pipedriveDealId: req.body.pipedriveDealId,
            pipedriveCompanyId: req.body.pipedriveCompanyId,
            statusCode,
            errorName: error.name,
            errorMessage: error.message
        }, `❌ Error in createFullProject controller: ${error.message}`);
        
        res.status(statusCode).json(errorResponse);
    }
});
