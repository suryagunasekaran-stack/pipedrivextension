/**
 * Custom hooks for API queries using React Query
 * Provides a clean interface for data fetching with built-in caching and error handling
 */

import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { apiService, ApiServiceError } from '@/services/api';
import {
  AuthStatusResponse,
  PipedriveDataResponse,
  XeroStatusResponse,
  CreateQuoteRequest,
  CreateQuoteResponse,
  CreateProjectRequest,
  CreateProjectResponse,
} from '@/types/api';
import { showError } from '@/utils/errorHandler';

// Query Keys
export const queryKeys = {
  authStatus: (companyId: string) => ['auth', 'status', companyId] as const,
  pipedriveData: (companyId: string, dealId: string) => ['pipedrive', 'deal', companyId, dealId] as const,
  xeroStatus: (companyId: string) => ['xero', 'status', companyId] as const,
};

/**
 * Hook to check authentication status
 */
export function useAuthStatus(
  companyId: string | null,
  options?: Omit<UseQueryOptions<AuthStatusResponse, ApiServiceError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.authStatus(companyId || ''),
    queryFn: () => apiService.checkAuthStatus(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Hook to fetch Pipedrive deal data
 */
export function usePipedriveData(
  companyId: string | null,
  dealId: string | null,
  options?: Omit<UseQueryOptions<PipedriveDataResponse, ApiServiceError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.pipedriveData(companyId || '', dealId || ''),
    queryFn: () => apiService.getPipedriveData(companyId!, dealId!),
    enabled: !!companyId && !!dealId,
    ...options,
  });
}

/**
 * Hook to check Xero connection status
 */
export function useXeroStatus(
  companyId: string | null,
  options?: Omit<UseQueryOptions<XeroStatusResponse, ApiServiceError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.xeroStatus(companyId || ''),
    queryFn: () => apiService.checkXeroStatus(companyId!),
    enabled: !!companyId,
    ...options,
  });
}

/**
 * Hook to create a Xero quote
 */
export function useCreateQuote(
  options?: UseMutationOptions<CreateQuoteResponse, ApiServiceError, CreateQuoteRequest>
) {
  return useMutation({
    mutationFn: (request: CreateQuoteRequest) => apiService.createXeroQuote(request),
    onError: (error) => {
      showError(error, 'Failed to create quote');
    },
    ...options,
  });
}

/**
 * Hook to create a project
 */
export function useCreateProject(
  options?: UseMutationOptions<CreateProjectResponse, ApiServiceError, CreateProjectRequest>
) {
  return useMutation({
    mutationFn: (request: CreateProjectRequest) => apiService.createProject(request),
    onError: (error) => {
      showError(error, 'Failed to create project');
    },
    ...options,
  });
}

/**
 * Hook to logout
 */
export function useLogout(
  options?: UseMutationOptions<void, ApiServiceError, string>
) {
  return useMutation({
    mutationFn: (companyId: string) => apiService.logout(companyId),
    onError: (error) => {
      showError(error, 'Failed to logout');
    },
    ...options,
  });
}