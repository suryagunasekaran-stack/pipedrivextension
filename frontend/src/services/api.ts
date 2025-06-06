/**
 * API Service Layer
 * Handles all communication with the backend API
 * Implements error handling, response processing, and request formatting
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import {
  AuthStatusResponse,
  AuthUrlResponse,
  PipedriveDataResponse,
  XeroStatusResponse,
  CreateQuoteRequest,
  CreateQuoteResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  ApiError,
} from '@/types/api';

// Custom error class for API errors
export class ApiServiceError extends Error {
  statusCode: number;
  requestId?: string;
  details?: any;

  constructor(message: string, statusCode: number, requestId?: string, details?: any) {
    super(message);
    this.name = 'ApiServiceError';
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.details = details;
  }
}

class ApiService {
  private axiosInstance: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    
    // Create axios instance with default config
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Important for CORS with credentials
    });

    // Add request interceptor for logging and auth
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Log request in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data);
        }
        return config;
      },
      (error) => {
        console.error('[API Request Error]', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Log response in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API Response] ${response.config.url}`, response.data);
        }
        return response;
      },
      (error) => {
        return this.handleError(error);
      }
    );
  }

  /**
   * Handle API errors consistently
   */
  private async handleError(error: AxiosError<ApiError>): Promise<never> {
    if (error.response) {
      // Server responded with error status
      const { data, status } = error.response;
      const errorMessage = data?.error || error.message || 'Unknown error occurred';
      
      throw new ApiServiceError(
        errorMessage,
        status,
        data?.requestId,
        data?.details
      );
    } else if (error.request) {
      // Request made but no response received
      throw new ApiServiceError(
        'No response from server. Please check your connection.',
        0
      );
    } else {
      // Error in request configuration
      throw new ApiServiceError(
        error.message || 'Failed to make request',
        0
      );
    }
  }

  /**
   * Authentication Methods
   */
  
  async checkAuthStatus(companyId: string): Promise<AuthStatusResponse> {
    const response = await this.axiosInstance.get<AuthStatusResponse>(
      `/auth/status`,
      { params: { companyId } }
    );
    return response.data;
  }

  async getPipedriveAuthUrl(): Promise<string> {
    const response = await this.axiosInstance.get<AuthUrlResponse>('/auth/auth-url');
    return response.data.authUrl;
  }

  connectXero(pipedriveCompanyId: string): void {
    // Direct redirect to backend OAuth endpoint
    window.location.href = `${this.baseUrl}/auth/connect-xero?pipedriveCompanyId=${pipedriveCompanyId}`;
  }

  async logout(companyId: string): Promise<void> {
    await this.axiosInstance.post('/auth/logout', { companyId });
  }

  /**
   * Pipedrive Data Methods
   */
  
  async getPipedriveData(companyId: string, dealId: string): Promise<PipedriveDataResponse> {
    const response = await this.axiosInstance.get<PipedriveDataResponse>(
      '/api/pipedrive-data',
      { 
        params: { companyId, dealId }
      }
    );
    return response.data;
  }

  /**
   * Xero Integration Methods
   */
  
  async checkXeroStatus(pipedriveCompanyId: string): Promise<XeroStatusResponse> {
    const response = await this.axiosInstance.get<XeroStatusResponse>(
      '/api/xero/status',
      { params: { pipedriveCompanyId } }
    );
    return response.data;
  }

  async createXeroQuote(request: CreateQuoteRequest): Promise<CreateQuoteResponse> {
    const response = await this.axiosInstance.post<CreateQuoteResponse>(
      '/api/xero/create-quote',
      request
    );
    return response.data;
  }

  /**
   * Project Management Methods
   */
  
  async createProject(request: CreateProjectRequest): Promise<CreateProjectResponse> {
    const response = await this.axiosInstance.post<CreateProjectResponse>(
      '/api/project/create-full',
      request
    );
    return response.data;
  }

  /**
   * Utility Methods
   */
  
  // Method to handle file downloads
  async downloadFile(url: string, filename: string): Promise<void> {
    try {
      const response = await this.axiosInstance.get(url, {
        responseType: 'blob',
      });
      
      // Create blob link to download
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      throw new ApiServiceError('Failed to download file', 500);
    }
  }

  // Method to cancel requests if needed
  createCancelToken() {
    return axios.CancelToken.source();
  }
}

// Export singleton instance
export const apiService = new ApiService();

// Export types
export type { ApiServiceError };