/**
 * File Upload Middleware
 * 
 * Handles file uploads using multer with appropriate validation and storage configuration.
 * Used for uploading documents to be attached to invoices in Xero.
 * 
 * @module middleware/fileUpload
 */

import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter to validate file types
const fileFilter = (req, file, cb) => {
    // Allowed file types for invoice attachments
    const allowedTypes = [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 5 // Maximum 5 files per request
    },
    fileFilter: fileFilter
});

/**
 * Middleware for single file upload
 * Field name: 'document'
 */
export const uploadSingle = upload.single('document');

/**
 * Middleware for multiple file uploads
 * Field name: 'documents'
 * Max files: 5
 */
export const uploadMultiple = upload.array('documents', 5);

/**
 * Error handling middleware for multer errors
 */
export const handleUploadError = (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large. Maximum size allowed is 10MB.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Too many files. Maximum 5 files allowed.'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                error: 'Unexpected field. Use "document" for single file or "documents" for multiple files.'
            });
        }
    }
    
    if (error.message.includes('File type')) {
        return res.status(400).json({
            error: error.message
        });
    }
    
    next(error);
};

/**
 * Cleanup uploaded files helper function
 * Use this to clean up files after processing or on error
 */
export const cleanupFiles = (files) => {
    if (!files) return;
    
    const filesToClean = Array.isArray(files) ? files : [files];
    
    filesToClean.forEach(file => {
        if (file && file.path && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
            } catch (error) {
                console.error('Error cleaning up file:', file.path, error);
            }
        }
    });
}; 