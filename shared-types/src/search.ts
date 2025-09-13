export interface SearchConfig {
  table: string;
  text_field: string;
  vector_field: string;
  filters: Record<string, any>;
  joins?: Array<{
    table: string;
    on: string;
  }>;
}

export interface SearchRequest {
  query: string;
  embedding: number[];
  search_configs: SearchConfig[];
  limit?: number;
  rerank?: boolean;
}

export interface SearchResultItem {
  type: 'golden_answer' | 'message' | 'knowledge_base';
  score: number;
  content?: string;
  excerpt?: string;
  message_id?: string;
  metadata: Record<string, any>;
}

export interface SearchResponse {
  results: SearchResultItem[];
  query: string;
  total_results: number;
  processing_time_ms: number;
}

export interface SearchApiRequest {
  query: string;
  limit?: number;
  rerank?: boolean;
  excludeMessages?: boolean;
}

export interface SearchApiResponse {
  results: SearchResultItem[];
  query: string;
  total_results: number;
}