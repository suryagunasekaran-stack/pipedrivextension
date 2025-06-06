'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Loader2, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { 
    companyId, 
    isAuthenticated, 
    isLoading, 
    error,
    checkAuthStatus,
    connectPipedrive,
    connectXero,
    setCompanyId
  } = useAuthStore();

  // Check for company ID in URL params
  useEffect(() => {
    const urlCompanyId = searchParams.get('companyId');
    if (urlCompanyId && urlCompanyId !== companyId) {
      setCompanyId(urlCompanyId);
      checkAuthStatus(urlCompanyId);
    } else if (companyId) {
      checkAuthStatus(companyId);
    }
  }, [searchParams, companyId]);

  const handleConnectPipedrive = () => {
    connectPipedrive();
  };

  const handleConnectXero = () => {
    connectXero();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gradient mb-4">
              Pipedrive-Xero Integration
            </h1>
            <p className="text-xl text-gray-600">
              Seamlessly connect your CRM with your accounting software
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Authentication Status Cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* Pipedrive Card */}
            <div className="bg-white rounded-xl shadow-lg p-8 card-hover">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold">Pipedrive</h2>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : isAuthenticated.pipedrive ? (
                  <CheckCircle className="h-6 w-6 text-green-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-gray-400" />
                )}
              </div>
              
              <p className="text-gray-600 mb-6">
                Connect your Pipedrive account to sync deals and contacts.
              </p>

              {isAuthenticated.pipedrive ? (
                <div className="space-y-3">
                  <div className="text-sm text-gray-500">
                    Company ID: <span className="font-mono">{companyId}</span>
                  </div>
                  <div className="badge badge-success">Connected</div>
                </div>
              ) : (
                <button
                  onClick={handleConnectPipedrive}
                  disabled={isLoading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  Connect Pipedrive
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Xero Card */}
            <div className="bg-white rounded-xl shadow-lg p-8 card-hover">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold">Xero</h2>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : isAuthenticated.xero ? (
                  <CheckCircle className="h-6 w-6 text-green-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-gray-400" />
                )}
              </div>
              
              <p className="text-gray-600 mb-6">
                Connect your Xero account to create quotes and sync financial data.
              </p>

              {isAuthenticated.xero ? (
                <div className="badge badge-success">Connected</div>
              ) : (
                <button
                  onClick={handleConnectXero}
                  disabled={isLoading || !isAuthenticated.pipedrive}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Connect Xero
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
              
              {!isAuthenticated.pipedrive && (
                <p className="text-sm text-gray-500 mt-3">
                  Connect Pipedrive first to enable Xero integration
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {isAuthenticated.pipedrive && isAuthenticated.xero && (
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h3 className="text-xl font-semibold mb-6">Available Actions</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <Link 
                  href={`/pipedrive-data-view?companyId=${companyId}`}
                  className="btn-outline flex items-center justify-center gap-2"
                >
                  View Pipedrive Data
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link 
                  href={`/create-project?companyId=${companyId}`}
                  className="btn-outline flex items-center justify-center gap-2"
                >
                  Create Project
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )}

          {/* Info Section */}
          <div className="mt-12 text-center text-gray-600">
            <p className="mb-2">
              This integration allows you to:
            </p>
            <ul className="space-y-1 text-sm max-w-md mx-auto">
              <li>• Create Xero quotes from Pipedrive deals</li>
              <li>• Sync contacts between both platforms</li>
              <li>• Generate projects with automated workflows</li>
              <li>• Track financial data across your sales pipeline</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}