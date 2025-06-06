'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>;
}

/**
 * ErrorBoundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * Logs errors and displays a fallback UI
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    console.error('Error caught by boundary:', error, errorInfo);

    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
      // Example: Send to Google Analytics
      if (window.gtag) {
        window.gtag('event', 'exception', {
          description: error.toString(),
          fatal: true,
          error_name: error.name,
          error_message: error.message,
          error_stack: error.stack,
        });
      }

      // Example: Send to Sentry or other error tracking service
      // if (window.Sentry) {
      //   window.Sentry.captureException(error, {
      //     contexts: { react: errorInfo }
      //   });
      // }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback component if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error} reset={this.handleReset} />;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Something went wrong
            </h1>
            <p className="text-gray-600 mb-6">
              {this.state.error.message || 'An unexpected error occurred'}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="btn-primary w-full"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="btn-outline w-full"
              >
                Try Again
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Error Details (Development Only)
                </summary>
                <pre className="mt-2 text-xs bg-gray-100 p-4 rounded overflow-auto max-h-60">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for using error boundary in functional components
export function useErrorHandler(): (error: Error) => void {
  return (error: Error) => {
    throw error; // This will be caught by the nearest error boundary
  };
}

// Default error fallback component that can be reused
export function ErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Oops! Something went wrong
        </h1>
        <p className="text-gray-600 mb-6">
          {error.message || 'An unexpected error occurred while processing your request'}
        </p>
        <div className="space-y-3">
          <button
            onClick={reset}
            className="btn-primary w-full"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="btn-outline w-full"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}