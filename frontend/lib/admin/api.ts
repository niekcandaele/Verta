import axios, { AxiosInstance } from 'axios';

export interface QuestionCluster {
  id: string;
  tenant_id: string;
  representative_text: string;
  thread_title: string | null;
  instance_count: number;
  first_seen_at: string;
  last_seen_at: string;
  has_golden_answer: boolean;
  created_at: string;
  updated_at: string;
}

export interface GoldenAnswer {
  id: string;
  answer: string;
  answer_format: 'markdown' | 'plaintext';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionInstance {
  id: string;
  thread_id: string;
  thread_title: string | null;
  original_text: string;
  rephrased_text: string | null;
  confidence_score: number;
  created_at: string;
}

export interface ClusterDetails {
  cluster: QuestionCluster;
  golden_answer: GoldenAnswer | null;
  instances: QuestionInstance[];
}

export interface KnowledgeBase {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  sitemap_url: string;
  last_crawled_at: string | null;
  last_crawl_event: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseWithStats extends KnowledgeBase {
  chunk_count: number;
  last_chunk_created: string | null;
}

export interface CrawlJob {
  id: string;
  state: 'completed' | 'active' | 'waiting' | 'delayed' | 'failed';
  progress: number;
  data: {
    knowledgeBaseId: string;
    tenantId: string;
    sitemapUrl: string;
    name: string;
    isInitialCrawl: boolean;
  };
  result?: {
    success: boolean;
    knowledgeBaseId: string;
    urlsProcessed: number;
    chunksCreated: number;
    chunksUpdated: number;
    errors: string[];
    processingTimeMs: number;
    lastCrawledAt: string;
    status: 'completed' | 'failed' | 'partial';
  };
  failedReason?: string;
  attemptsMade: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateClusterRequest {
  tenant_id: string;
  representative_text: string;
  thread_title?: string;
  example_questions?: string[];
  metadata?: Record<string, any>;
}

export interface BotConfig {
  id: string;
  tenant_id: string;
  monitored_channels: string[];
  created_at: string;
  updated_at: string;
}

export interface AvailableChannel {
  id: string;
  name: string;
  type: string;
}

export interface BotConfigResponse {
  config: BotConfig | null;
  available_channels: AvailableChannel[];
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // Start with 1 second

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Create admin API client with retry logic
const createAdminApiClient = (): AxiosInstance => {
  // Use the Next.js API proxy route
  // This avoids CORS issues and keeps the API key on the server
  const instance = axios.create({
    baseURL: '/api/admin',
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  // Add response interceptor for retry logic
  instance.interceptors.response.use(
    response => response,
    async error => {
      const config = error.config;
      
      // Initialize retry count
      if (!config.retryCount) {
        config.retryCount = 0;
      }
      
      // Check if we should retry
      const shouldRetry = 
        config.retryCount < MAX_RETRIES &&
        error.code === 'ECONNABORTED' || // Timeout
        error.response?.status >= 500 || // Server errors
        error.code === 'ENETUNREACH' || // Network unreachable
        error.code === 'ECONNREFUSED'; // Connection refused
      
      if (shouldRetry) {
        config.retryCount++;
        
        // Exponential backoff
        const delayMs = RETRY_DELAY * Math.pow(2, config.retryCount - 1);
        await delay(delayMs);
        
        // Retry the request
        return instance(config);
      }
      
      // Transform error for better user messages
      if (error.response) {
        const message = error.response.data?.message || error.response.data?.error || 'An error occurred';
        error.message = `${message} (Status: ${error.response.status})`;
      } else if (error.code === 'ECONNABORTED') {
        error.message = 'Request timed out. Please try again.';
      } else if (error.code === 'ENETUNREACH' || error.code === 'ECONNREFUSED') {
        error.message = 'Unable to connect to server. Please check your connection.';
      }
      
      return Promise.reject(error);
    }
  );

  return instance;
};

let adminApiClient: AxiosInstance | null = null;

export const getAdminApiClient = (): AxiosInstance => {
  if (!adminApiClient) {
    adminApiClient = createAdminApiClient();
  }
  return adminApiClient;
};

// Admin API methods
export const adminApi = {
  // Get clusters with pagination
  getClusters: async (params?: {
    tenant_id?: string;
    page?: number;
    limit?: number;
    sort_by?: 'instance_count' | 'last_seen_at' | 'created_at';
    sort_order?: 'asc' | 'desc';
  }) => {
    const client = getAdminApiClient();
    const response = await client.get<PaginatedResponse<QuestionCluster>>('/clusters', { params });
    return response.data;
  },

  // Get cluster details
  getClusterDetails: async (id: string) => {
    const client = getAdminApiClient();
    const response = await client.get<ClusterDetails>(`/clusters/${id}`);
    return response.data;
  },

  // Create or update golden answer
  saveGoldenAnswer: async (clusterId: string, data: {
    answer: string;
    answer_format?: 'markdown' | 'plaintext';
    created_by?: string;
  }) => {
    const client = getAdminApiClient();
    const response = await client.post(`/clusters/${clusterId}/golden-answer`, data);
    return response.data;
  },

  // Delete golden answer
  deleteGoldenAnswer: async (clusterId: string) => {
    const client = getAdminApiClient();
    const response = await client.delete(`/clusters/${clusterId}/golden-answer`);
    return response.data;
  },

  // Update cluster fields
  updateCluster: async (clusterId: string, data: {
    representative_text?: string;
  }) => {
    const client = getAdminApiClient();
    const response = await client.patch(`/clusters/${clusterId}`, data);
    return response.data;
  },

  // Create cluster
  createCluster: async (data: CreateClusterRequest) => {
    const client = getAdminApiClient();
    const response = await client.post('/clusters', data);
    return response.data;
  },

  // Delete cluster
  deleteCluster: async (clusterId: string) => {
    const client = getAdminApiClient();
    await client.delete(`/clusters/${clusterId}`);
  },

  // Bulk delete clusters
  bulkDeleteClusters: async (clusterIds: string[]) => {
    const client = getAdminApiClient();
    await client.delete('/clusters/bulk', {
      data: { cluster_ids: clusterIds }
    });
  },

  // Knowledge Base Methods
  
  // Get all knowledge bases with pagination
  getKnowledgeBases: async (params?: {
    tenant_id?: string;
    page?: number;
    limit?: number;
    sort_by?: 'name' | 'created_at' | 'last_crawled_at';
    sort_order?: 'asc' | 'desc';
  }) => {
    const client = getAdminApiClient();
    const response = await client.get<PaginatedResponse<KnowledgeBaseWithStats>>('/knowledge-bases', { params });
    return response.data;
  },

  // Get knowledge base by ID
  getKnowledgeBase: async (id: string) => {
    const client = getAdminApiClient();
    const response = await client.get<KnowledgeBaseWithStats>(`/knowledge-bases/${id}`);
    return response.data;
  },

  // Create new knowledge base
  createKnowledgeBase: async (data: {
    name: string;
    description?: string | null;
    sitemap_url: string;
    tenant_id?: string;
  }) => {
    const client = getAdminApiClient();
    const response = await client.post<KnowledgeBase>('/knowledge-bases', data);
    return response.data;
  },

  // Update knowledge base
  updateKnowledgeBase: async (id: string, data: {
    name?: string;
    description?: string | null;
    sitemap_url?: string;
  }) => {
    const client = getAdminApiClient();
    const response = await client.put<KnowledgeBase>(`/knowledge-bases/${id}`, data);
    return response.data;
  },

  // Delete knowledge base
  deleteKnowledgeBase: async (id: string) => {
    const client = getAdminApiClient();
    const response = await client.delete(`/knowledge-bases/${id}`);
    return response.data;
  },

  // Trigger manual crawl
  crawlKnowledgeBase: async (id: string) => {
    const client = getAdminApiClient();
    const response = await client.post<{ jobId: string }>(`/knowledge-bases/${id}/crawl`, {});
    return response.data;
  },

  // Get crawl status/job
  getKnowledgeBaseCrawlStatus: async (id: string) => {
    const client = getAdminApiClient();
    const response = await client.get<CrawlJob>(`/knowledge-bases/${id}/status`);
    return response.data;
  },

  // Bot Config Methods

  // Get bot configuration for a tenant
  getBotConfig: async (tenantId: string) => {
    const client = getAdminApiClient();
    const response = await client.get<BotConfigResponse>('/bot-config', {
      params: { tenant_id: tenantId }
    });
    return response.data;
  },

  // Update bot configuration
  updateBotConfig: async (data: {
    tenant_id: string;
    monitored_channels: string[];
  }) => {
    const client = getAdminApiClient();
    const response = await client.put<{ message: string; config: BotConfig }>('/bot-config', data);
    return response.data;
  },
};

export default adminApi;