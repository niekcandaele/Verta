/**
 * API client for frontend to backend communication
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// API response types
export interface ApiResponse<T> {
  data: T;
  meta: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface ApiError {
  title: string;
  status: number;
  type?: string;
  detail?: string;
  instance?: string;
}

// Create axios instance with default configuration
const createApiClient = (): AxiosInstance => {
  // Get environment variables
  // Use app:25000 when running server-side in container, localhost:25000 for client-side
  const isServer = typeof window === 'undefined';
  const defaultUrl = isServer ? 'http://app:25000' : 'http://localhost:25000';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || defaultUrl;
  const tenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG;

  if (!tenantSlug) {
    throw new Error('NEXT_PUBLIC_TENANT_SLUG environment variable is required');
  }

  const baseURL = `${apiUrl}/api/v1`;
  console.log('API Client Config:', { baseURL, tenantSlug, isServer });
  
  const instance = axios.create({
    baseURL,
    headers: {
      'X-Tenant-Slug': tenantSlug,
      'Content-Type': 'application/json',
    },
    timeout: 30000, // 30 seconds
  });

  // Response interceptor for error handling
  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiError>) => {
      // Handle API errors
      if (error.response) {
        // Server responded with error status
        const apiError = error.response.data;
        console.error('API Error:', apiError);
        
        // Throw a more user-friendly error
        const errorMessage = apiError.detail || apiError.title || 'An error occurred';
        throw new Error(errorMessage);
      } else if (error.request) {
        // Request was made but no response received
        console.error('Network Error:', error.message, 'URL:', error.config?.url);
        throw new Error('Unable to connect to the server. Please check your connection.');
      } else {
        // Something else happened
        console.error('Request Error:', error.message);
        throw error;
      }
    }
  );

  return instance;
};

// Create singleton instance with lazy initialization
let apiClientInstance: AxiosInstance | null = null;

export const getApiClient = (): AxiosInstance => {
  if (!apiClientInstance) {
    apiClientInstance = createApiClient();
  }
  return apiClientInstance;
};

// Export singleton instance
export const apiClient = getApiClient();

// Convenience methods for common API calls
export const api = {
  // Get tenant information
  getTenant: () => apiClient.get<ApiResponse<any>>('/tenant'),

  // Get tenant branding
  getBranding: () => apiClient.get<ApiResponse<any>>('/branding'),

  // Get all channels
  getChannels: () => apiClient.get<ApiResponse<any>>('/channels'),

  // Get specific channel
  getChannel: (channelId: string) => 
    apiClient.get<ApiResponse<any>>(`/channels/${channelId}`),

  // Get channel messages with pagination
  getChannelMessages: (channelId: string, page: number = 1, limit: number = 50) =>
    apiClient.get<ApiResponse<any>>(`/channels/${channelId}/messages`, {
      params: { page, limit }
    }),

  // Get forum threads
  getChannelThreads: (channelId: string, page: number = 1, limit: number = 20) =>
    apiClient.get<ApiResponse<any>>(`/channels/${channelId}/threads`, {
      params: { page, limit }
    }),

  // Get thread messages
  getThreadMessages: (channelId: string, threadId: string, page: number = 1, limit: number = 50) =>
    apiClient.get<ApiResponse<any>>(`/channels/${channelId}/threads/${threadId}/messages`, {
      params: { page, limit }
    }),
};

export default api;