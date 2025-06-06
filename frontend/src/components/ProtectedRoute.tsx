'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireXero?: boolean;
}

/**
 * ProtectedRoute Component
 * Ensures user is authenticated before accessing protected pages
 * Redirects to appropriate auth flow if not authenticated
 */
export function ProtectedRoute({ children, requireXero = false }: ProtectedRouteProps) {
  const router = useRouter();
  const { companyId, isAuthenticated, isLoading, checkAuthStatus } = useAuthStore();

  useEffect(() => {
    // If we don't have a company ID, redirect to home
    if (!companyId) {
      router.push('/');
      return;
    }

    // Check authentication status
    checkAuthStatus(companyId);
  }, [companyId, checkAuthStatus]);

  useEffect(() => {
    // After auth check is complete, handle redirects
    if (!isLoading) {
      if (!isAuthenticated.pipedrive) {
        router.push('/');
        return;
      }

      if (requireXero && !isAuthenticated.xero) {
        router.push(`/?companyId=${companyId}&connectXero=true`);
        return;
      }
    }
  }, [companyId, isAuthenticated, requireXero, isLoading, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-gray-600">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, don't render children (redirect will happen)
  if (!isAuthenticated.pipedrive || (requireXero && !isAuthenticated.xero)) {
    return null;
  }

  // User is authenticated, render children
  return <>{children}</>;
}