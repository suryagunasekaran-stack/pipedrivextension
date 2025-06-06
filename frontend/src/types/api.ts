/**
 * API Types and Interfaces
 * Based on the backend API endpoints and frontend integration guide
 */

// Authentication Types
export interface AuthStatusRequest {
  companyId: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  services: {
    pipedrive: boolean;
    xero: boolean;
  };
  companyId: string;
  requiresXeroConnection?: boolean;
}

export interface AuthUrlResponse {
  authUrl: string;
}

export interface LogoutRequest {
  companyId: string;
}

// Pipedrive Types
export interface PipedriveDataRequest {
  companyId: string;
  dealId: string;
}

export interface PipedriveDataResponse {
  success: boolean;
  deal: {
    id: number;
    title: string;
    value: number;
    currency: string;
    status: string;
    org_id: {
      name: string;
      value: number;
    };
    person_id?: {
      name: string;
      email: Array<{ value: string; primary: boolean }>;
    };
    // Custom fields based on environment config
    [key: string]: any;
  };
  person?: {
    id: number;
    name: string;
    email: Array<{ value: string; primary: boolean }>;
    phone: Array<{ value: string; primary: boolean }>;
  };
  organization?: {
    id: number;
    name: string;
    address: string;
  };
  products?: Array<{
    id: number;
    name: string;
    quantity: number;
    item_price: number;
    sum: number;
  }>;
}

// Xero Types
export interface XeroStatusResponse {
  connected: boolean;
  tenantId?: string;
  tenantName?: string;
  tokenExpiresAt?: string;
}

export interface CreateQuoteRequest {
  pipedriveCompanyId: string;
  pipedriveDealId: string;
}

export interface CreateQuoteResponse {
  success: boolean;
  quoteNumber: string;
  quoteId: string;
  contactName: string;
  totalAmount: number;
  lineItemsCount: number;
  pipedriveDealUpdated: boolean;
}

// Project Types
export interface CreateProjectRequest {
  pipedriveDealId: string;
  pipedriveCompanyId: string;
  existingProjectNumberToLink?: string; // Optional: link to existing project
}

export interface CreateProjectResponse {
  success: boolean;
  projectNumber: string; // e.g., "NY25001"
  deal: any; // Full deal object
  person?: any; // Contact details
  organization?: any; // Company details
  products?: any[]; // Deal products
  xero?: {
    projectCreated: boolean;
    projectId?: string;
    projectName?: string;
    contactId?: string;
    tasksCreated?: string[];
    quoteAccepted?: boolean;
    error?: string;
  };
  metadata: {
    dealId: string;
    companyId: string;
    isNewProject: boolean;
  };
}

// Error Types
export interface ApiError {
  error: string;
  requestId?: string;
  statusCode?: number;
  missingField?: string;
  details?: any;
}

// General Response Type
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}