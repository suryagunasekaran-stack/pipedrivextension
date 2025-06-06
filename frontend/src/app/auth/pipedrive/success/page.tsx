'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function PipedriveAuthSuccess() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const { setCompanyId, checkAuthStatus } = useAuthStore();

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const companyId = searchParams.get('companyId');

      if (error) {
        setStatus('error');
        return;
      }

      if (code && state) {
        // Backend handles the token exchange
        // Extract company ID from state or wait for it from backend
        if (companyId) {
          setCompanyId(companyId);
          await checkAuthStatus(companyId);
        }
        
        setStatus('success');
        
        // Redirect to main app after a short delay
        setTimeout(() => {
          router.push(companyId ? `/?companyId=${companyId}` : '/');
        }, 2000);
      } else {
        setStatus('error');
      }
    };

    processCallback();
  }, [searchParams, router, setCompanyId, checkAuthStatus]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Processing Authentication</h2>
            <p className="text-gray-600">
              Please wait while we complete your Pipedrive connection...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Successfully Connected!</h2>
            <p className="text-gray-600 mb-6">
              Your Pipedrive account has been connected successfully.
            </p>
            <p className="text-sm text-gray-500">
              Redirecting you to the dashboard...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-red-500 mb-4">
              <svg
                className="h-12 w-12 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2">Authentication Failed</h2>
            <p className="text-gray-600 mb-6">
              We couldn't complete the connection to Pipedrive.
            </p>
            <Link href="/" className="btn-primary">
              Try Again
            </Link>
          </>
        )}
      </div>
    </div>
  );
}