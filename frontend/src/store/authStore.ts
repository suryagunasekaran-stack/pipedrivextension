/**
 * Authentication Store
 * Manages authentication state for Pipedrive and Xero integrations
 * Uses Zustand for state management with persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiService } from '@/services/api';
import Cookies from 'js-cookie';

interface AuthStore {
  // State
  companyId: string | null;
  isAuthenticated: {
    pipedrive: boolean;
    xero: boolean;
  };
  isLoading: boolean;
  error: string | null;
  lastChecked: number | null;

  // Actions
  setCompanyId: (id: string | null) => void;
  setAuthStatus: (service: 'pipedrive' | 'xero', status: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  checkAuthStatus: (companyId: string, force?: boolean) => Promise<void>;
  connectPipedrive: () => Promise<void>;
  connectXero: () => void;
  logout: () => Promise<void>;
  clearState: () => void;
}

// Check if we should refresh auth status (5 minutes cache)
const shouldRefreshAuth = (lastChecked: number | null): boolean => {
  if (!lastChecked) return true;
  const fiveMinutes = 5 * 60 * 1000;
  return Date.now() - lastChecked > fiveMinutes;
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      companyId: null,
      isAuthenticated: {
        pipedrive: false,
        xero: false,
      },
      isLoading: false,
      error: null,
      lastChecked: null,

      // Actions
      setCompanyId: (id) => set({ companyId: id, error: null }),

      setAuthStatus: (service, status) =>
        set((state) => ({
          isAuthenticated: {
            ...state.isAuthenticated,
            [service]: status,
          },
          error: null,
        })),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      checkAuthStatus: async (companyId, force = false) => {
        const state = get();
        
        // Skip if we recently checked and not forcing
        if (!force && !shouldRefreshAuth(state.lastChecked) && state.companyId === companyId) {
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const response = await apiService.checkAuthStatus(companyId);
          
          set({
            companyId,
            isAuthenticated: {
              pipedrive: response.services.pipedrive,
              xero: response.services.xero,
            },
            isLoading: false,
            lastChecked: Date.now(),
          });

          // Store company ID in cookie for persistence across OAuth redirects
          Cookies.set('pipedriveCompanyId', companyId, { expires: 7 });
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to check authentication status',
          });
        }
      },

      connectPipedrive: async () => {
        set({ isLoading: true, error: null });

        try {
          const authUrl = await apiService.getPipedriveAuthUrl();
          window.location.href = authUrl;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to initiate Pipedrive authentication',
          });
        }
      },

      connectXero: () => {
        const state = get();
        
        if (!state.companyId) {
          set({ error: 'Company ID is required to connect Xero' });
          return;
        }

        if (!state.isAuthenticated.pipedrive) {
          set({ error: 'Please connect Pipedrive first' });
          return;
        }

        apiService.connectXero(state.companyId);
      },

      logout: async () => {
        const state = get();
        
        if (!state.companyId) return;

        set({ isLoading: true, error: null });

        try {
          await apiService.logout(state.companyId);
          
          // Clear all state and cookies
          Cookies.remove('pipedriveCompanyId');
          
          set({
            companyId: null,
            isAuthenticated: {
              pipedrive: false,
              xero: false,
            },
            isLoading: false,
            error: null,
            lastChecked: null,
          });
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to logout',
          });
        }
      },

      clearState: () => {
        Cookies.remove('pipedriveCompanyId');
        
        set({
          companyId: null,
          isAuthenticated: {
            pipedrive: false,
            xero: false,
          },
          isLoading: false,
          error: null,
          lastChecked: null,
        });
      },
    }),
    {
      name: 'auth-storage', // unique name for localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist these fields
        companyId: state.companyId,
        isAuthenticated: state.isAuthenticated,
        lastChecked: state.lastChecked,
      }),
    }
  )
);

// Initialize from cookie if available
if (typeof window !== 'undefined') {
  const companyIdFromCookie = Cookies.get('pipedriveCompanyId');
  if (companyIdFromCookie) {
    useAuthStore.getState().setCompanyId(companyIdFromCookie);
  }
}