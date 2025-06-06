'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function XeroAuthSuccess() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const { companyId, checkAuthStatus } = useAuthStore();

  useEffect(() => {
    const verifyConnection = async () => {
      if (!companyId) {
        setStatus('error');
        return;
      }

      try {
        // Check if Xero is now connected
        await checkAuthStatus(companyId, true); // Force refresh
        setStatus('success');
        
        // Redirect to main app after a short delay
        setTimeout(() => {
          router.push(`/?companyId=${companyId}`);
        }, 2000);
      } catch (error) {
        setStatus('error');
      }
    };

    verifyConnection();
  }, [companyId, checkAuthStatus, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Processing Authentication</h2>
            <p className="text-gray-600">
              Please wait while we complete your Xero connection...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Xero Connected!</h2>
            <p className="text-gray-600 mb-6">
              Your Xero account has been connected successfully.
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
            <h2 className="text-2xl font-semibold mb-2">Connection Failed</h2>
            <p className="text-gray-600 mb-6">
              We couldn't complete the connection to Xero.
            </p>
            <Link href="/" className="btn-primary">
              Back to Dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
}