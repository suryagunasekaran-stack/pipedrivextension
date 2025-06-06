/**
 * Error Handling Utilities
 * Provides consistent error handling across the application
 */

import { ApiServiceError } from '@/services/api';
import { toast } from 'sonner';

/**
 * Get user-friendly error message based on error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiServiceError) {
    // Handle specific API error cases
    switch (error.statusCode) {
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 422:
        return error.message || 'Invalid data provided.';
      case 429:
        return 'Too many requests. Please try again later.';
      case 500:
        return 'A server error occurred. Please try again later.';
      case 503:
        return 'Service is temporarily unavailable. Please try again later.';
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Show error notification to user
 */
export function showError(error: unknown, title?: string): void {
  const message = getErrorMessage(error);
  
  toast.error(title || 'Error', {
    description: message,
    duration: 5000,
  });

  // Log error for debugging
  console.error('[Error]', error);
}

/**
 * Show success notification to user
 */
export function showSuccess(message: string, title?: string): void {
  toast.success(title || 'Success', {
    description: message,
    duration: 4000,
  });
}

/**
 * Show info notification to user
 */
export function showInfo(message: string, title?: string): void {
  toast.info(title || 'Information', {
    description: message,
    duration: 4000,
  });
}

/**
 * Show warning notification to user
 */
export function showWarning(message: string, title?: string): void {
  toast.warning(title || 'Warning', {
    description: message,
    duration: 4000,
  });
}

/**
 * Show loading notification with promise
 */
export function showLoading<T>(
  promise: Promise<T>,
  options: {
    loading: string;
    success: string | ((data: T) => string);
    error?: string | ((error: unknown) => string);
  }
): Promise<T> {
  return toast.promise(promise, {
    loading: options.loading,
    success: options.success,
    error: options.error || ((error) => getErrorMessage(error)),
  });
}

/**
 * Format error for display with details
 */
export function formatErrorDetails(error: unknown): {
  message: string;
  details?: string;
  requestId?: string;
} {
  if (error instanceof ApiServiceError) {
    return {
      message: getErrorMessage(error),
      details: error.details ? JSON.stringify(error.details, null, 2) : undefined,
      requestId: error.requestId,
    };
  }

  return {
    message: getErrorMessage(error),
  };
}

/**
 * Check if error is network related
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiServiceError) {
    return error.statusCode === 0;
  }
  
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('network') ||
           error.message.toLowerCase().includes('connection');
  }
  
  return false;
}

/**
 * Check if error is authentication related
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof ApiServiceError) {
    return error.statusCode === 401 || error.statusCode === 403;
  }
  
  return false;
}

/**
 * Error logging for production
 */
export function logError(error: unknown, context?: Record<string, any>): void {
  // In production, send to error tracking service
  if (process.env.NODE_ENV === 'production') {
    // Example: Send to Sentry, LogRocket, etc.
    console.error('[Production Error]', {
      error: formatErrorDetails(error),
      context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
  } else {
    // In development, just log to console
    console.error('[Development Error]', error, context);
  }
}