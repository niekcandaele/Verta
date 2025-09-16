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
  const isServer = typeof window === 'undefined';
  const tenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG;
  
  // Determine API URL based on environment
  let apiUrl: string;
  if (isServer) {
    // Server-side: use BACKEND_URL env var or fall back to internal Docker network hostname
    apiUrl = process.env.BACKEND_URL || 'http://app:25000';
  } else {
    // Client-side: use environment variable or dynamically determine from window.location
    apiUrl = process.env.NEXT_PUBLIC_API_URL ||
             `${window.location.protocol}//${window.location.hostname}`;
  }

  // During build time, we might not have the tenant slug yet
  // Use a placeholder that will be replaced at runtime
  const effectiveTenantSlug = tenantSlug || 'takaro';

  const baseURL = `${apiUrl}/api/v1`;
  console.log('API Client Config:', { baseURL, tenantSlug: effectiveTenantSlug, isServer });
  
  const instance = axios.create({
    baseURL,
    headers: {
      'X-Tenant-Slug': effectiveTenantSlug,
      'Content-Type': 'application/json',
    },
    timeout: 120000, // 2 minutes
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

// Export lazy getter instead of immediate instance
// This prevents initialization during module import
export const apiClient = new Proxy({} as AxiosInstance, {
  get(target, prop, receiver) {
    const client = getApiClient();
    return Reflect.get(client, prop, receiver);
  }
});

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

  // Get channel by slug
  getChannelBySlug: (slug: string) =>
    apiClient.get<ApiResponse<any>>(`/channels/by-slug/${slug}`),

  // Get channel messages with pagination
  getChannelMessages: (channelId: string, page: number = 1, limit: number = 50) =>
    apiClient.get<ApiResponse<any>>(`/channels/${channelId}/messages`, {
      params: { page, limit }
    }),

  // Get channel messages by slug with pagination
  getChannelMessagesBySlug: (slug: string, page: number = 1, limit: number = 50) =>
    apiClient.get<ApiResponse<any>>(`/channels/by-slug/${slug}/messages`, {
      params: { page, limit }
    }),

  // Get message with context
  getMessageContext: (messageId: string, before: number = 50, after: number = 50) =>
    apiClient.get<ApiResponse<any>>(`/messages/${messageId}`, {
      params: { before, after }
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

  // Search messages and golden answers
  search: (query: string, limit: number = 10) =>
    apiClient.post<ApiResponse<any>>('/search', { query, limit }),
};

export default api;