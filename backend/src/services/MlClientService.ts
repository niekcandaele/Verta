import axios, { AxiosInstance, AxiosError } from 'axios';
import logger from '../utils/logger.js';

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxAttempts: number;
}

export interface ClassificationResult {
  is_question: boolean;
  confidence: number;
  text: string;
}

export interface EmbeddingResult {
  embedding: number[];
  dimension: number;
  text: string;
}

export interface RephraseRequest {
  messages: Array<{
    text: string;
    author_id: string;
    timestamp: string;
  }>;
  context?: string;
}

export interface RephraseResult {
  rephrased_text: string;
  original_messages: string[];
  confidence: number;
}

export interface OcrRequest {
  image_url?: string;
  image_base64?: string;
}

export interface OcrResult {
  text: string;
  full_response: string;
  visual_context: string;
  confidence: number;
  processing_time_ms: number;
  model_used: string;
  model_name: string;
  attempts: number;
}

export interface BatchOcrRequest {
  images: Array<{
    image_url?: string;
    image_base64?: string;
  }>;
}

export interface BatchOcrResult {
  results: OcrResult[];
}

export interface SearchConfig {
  table: string;
  text_field: string;
  vector_field: string;
  filters: Record<string, any>;
}

export interface SearchRequest {
  query: string;
  embedding: number[];
  search_configs: SearchConfig[];
  limit?: number;
  rerank?: boolean;
}

export interface SearchResultItem {
  type: 'golden_answer' | 'message';
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

export interface MlServiceConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  ocrTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

type OperationType = 'ocr' | 'embed' | 'classify' | 'rephrase' | 'search';

interface CircuitBreakerInstance {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  halfOpenAttempts: number;
  config: CircuitBreakerConfig;
}

export class MlClientService {
  private client: AxiosInstance;
  private config: Required<MlServiceConfig>;
  private circuitBreakers: Map<OperationType, CircuitBreakerInstance>;

  constructor(config: MlServiceConfig) {
    this.config = {
      timeout: 120000, // 2 minutes default
      ocrTimeout: 300000, // 5 minutes for OCR
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
      },
    });

    // Initialize separate circuit breakers for each operation type
    this.circuitBreakers = new Map();
    const operationTypes: OperationType[] = ['ocr', 'embed', 'classify', 'rephrase', 'search'];
    
    operationTypes.forEach(opType => {
      this.circuitBreakers.set(opType, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        halfOpenAttempts: 0,
        config: {
          failureThreshold: opType === 'ocr' ? 5 : 10, // OCR is more lenient
          resetTimeout: 300000, // 5 minutes
          halfOpenMaxAttempts: 3,
        },
      });
    });

    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for logging and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        return config;
      },
      (error) => {
        logger.error('ML Service Request Error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      (error: AxiosError) => {
        logger.error('ML Service Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
          responseData: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check circuit breaker state
   */
  private checkCircuitBreaker(operationType: OperationType): void {
    const cb = this.circuitBreakers.get(operationType);
    if (!cb) {
      throw new Error(`Unknown operation type: ${operationType}`);
    }
    const now = Date.now();

    switch (cb.state) {
      case CircuitState.OPEN:
        if (now - cb.lastFailureTime > cb.config.resetTimeout) {
          cb.state = CircuitState.HALF_OPEN;
          cb.halfOpenAttempts = 0;
          logger.debug('Circuit breaker transitioned to HALF_OPEN');
        } else {
          throw new Error(
            `Circuit breaker is OPEN for ${operationType} - ML service is unavailable`
          );
        }
        break;
      case CircuitState.HALF_OPEN:
        if (cb.halfOpenAttempts >= cb.config.halfOpenMaxAttempts) {
          cb.state = CircuitState.OPEN;
          cb.lastFailureTime = now;
          logger.warn(
            'Circuit breaker returned to OPEN after max half-open attempts'
          );
          throw new Error(
            `Circuit breaker is OPEN for ${operationType} - ML service is unavailable`
          );
        }
        cb.halfOpenAttempts++;
        break;
    }
  }

  /**
   * Record circuit breaker success
   */
  private recordSuccess(operationType: OperationType): void {
    const cb = this.circuitBreakers.get(operationType);
    if (!cb) return;
    if (cb.state === CircuitState.HALF_OPEN) {
      cb.state = CircuitState.CLOSED;
      cb.failureCount = 0;
      logger.debug('Circuit breaker transitioned to CLOSED');
    }
    cb.failureCount = 0;
  }

  /**
   * Record circuit breaker failure
   */
  private recordFailure(operationType: OperationType): void {
    const cb = this.circuitBreakers.get(operationType);
    if (!cb) return;
    cb.failureCount++;
    cb.lastFailureTime = Date.now();

    if (cb.state === CircuitState.HALF_OPEN) {
      cb.state = CircuitState.OPEN;
      logger.warn(`Circuit breaker for ${operationType} transitioned to OPEN from HALF_OPEN`);
    } else if (cb.failureCount >= cb.config.failureThreshold) {
      cb.state = CircuitState.OPEN;
      logger.warn(
        `Circuit breaker for ${operationType} transitioned to OPEN after reaching failure threshold`
      );
    }
  }

  /**
   * Execute request with retry logic and circuit breaker
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    operationType: OperationType
  ): Promise<T> {
    this.checkCircuitBreaker(operationType);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await operation();
        this.recordSuccess(operationType);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (
          axios.isAxiosError(error) &&
          error.response?.status &&
          error.response.status >= 400 &&
          error.response.status < 500
        ) {
          logger.warn(
            `${operationName} failed with client error, not retrying`,
            {
              status: error.response.status,
              attempt,
            }
          );
          this.recordFailure(operationType);
          throw error;
        }

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn(`${operationName} failed, retrying in ${delay}ms`, {
            attempt,
            maxRetries: this.config.maxRetries,
            error: this.getErrorMessage(error),
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          logger.error(`${operationName} failed after all retries`, {
            attempts: this.config.maxRetries,
            error: this.getErrorMessage(error),
          });
          this.recordFailure(operationType);
        }
      }
    }

    throw (
      lastError ||
      new Error(
        `${operationName} failed after ${this.config.maxRetries} attempts`
      )
    );
  }

  /**
   * Classify text as question or statement
   */
  async classify(text: string): Promise<ClassificationResult> {
    return this.executeWithRetry(async () => {
      const response = await this.client.post<ClassificationResult>(
        '/api/ml/classify',
        { text }
      );
      return response.data;
    }, 'Classification', 'classify');
  }

  /**
   * Classify multiple texts in batch
   */
  async classifyBatch(texts: string[]): Promise<ClassificationResult[]> {
    return this.executeWithRetry(async () => {
      const response = await this.client.post<{
        results: ClassificationResult[];
      }>('/api/ml/classify/batch', { texts });
      return response.data.results;
    }, 'Batch classification', 'classify');
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    return this.executeWithRetry(async () => {
      const response = await this.client.post<{
        embedding: number[];
        dimensions: number;
      }>(
        '/api/ml/embed',
        { text }
      );
      
      // Transform ML service response to expected format
      return {
        embedding: response.data.embedding,
        dimension: response.data.dimensions,
        text: text
      };
    }, 'Embedding generation', 'embed');
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return this.executeWithRetry(async () => {
      const response = await this.client.post<{
        embeddings: number[][];
        dimensions: number;
        count: number;
      }>(
        '/api/ml/embed/batch',
        { texts }
      );
      
      // Transform ML service response to expected format
      return response.data.embeddings.map((embedding, index) => ({
        embedding: embedding,
        dimension: response.data.dimensions,
        text: texts[index]
      }));
    }, 'Batch embedding', 'embed');
  }

  /**
   * Rephrase multi-part questions using LLM
   */
  async rephrase(request: RephraseRequest): Promise<RephraseResult> {
    return this.executeWithRetry(async () => {
      const response = await this.client.post<RephraseResult>(
        '/api/ml/rephrase',
        request
      );

      return response.data;
    }, 'Rephrasing', 'rephrase');
  }

  /**
   * Extract text from image using OCR
   */
  async ocr(request: OcrRequest): Promise<OcrResult> {
    return this.executeWithRetry(async () => {
      // Use longer timeout for OCR operations
      const response = await this.client.post<OcrResult>(
        '/api/ml/ocr',
        request,
        { timeout: this.config.ocrTimeout }
      );
      return response.data;
    }, 'OCR extraction', 'ocr');
  }

  /**
   * Extract text from multiple images using OCR
   */
  async ocrBatch(request: BatchOcrRequest): Promise<OcrResult[]> {
    return this.executeWithRetry(async () => {
      // Use longer timeout for batch OCR operations
      const response = await this.client.post<BatchOcrResult>(
        '/api/ml/ocr/batch',
        request,
        { timeout: this.config.ocrTimeout }
      );
      return response.data.results;
    }, 'Batch OCR extraction', 'ocr');
  }

  /**
   * Check ML service health
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    models_loaded: boolean;
    version: string;
  }> {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      logger.error('Health check failed', { error });
      return {
        healthy: false,
        models_loaded: false,
        version: 'unknown',
      };
    }
  }

  /**
   * Extract error message from various error types
   */
  private getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        return `${error.response.status}: ${error.response.data?.detail || error.response.statusText}`;
      }
      if (error.request) {
        return 'No response from ML service';
      }
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }

  /**
   * Execute hybrid search
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    return this.executeWithRetry(async () => {
      const response = await this.client.post<SearchResponse>(
        '/api/ml/search',
        request
      );
      return response.data;
    }, 'Search', 'search');
  }

  /**
   * Wait for ML service to be ready
   */
  async waitForReady(
    maxAttempts: number = 30,
    delayMs: number = 2000
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const health = await this.healthCheck();
        if (health.healthy && health.models_loaded) {
          return;
        }
      } catch {
        // Health check failed, will retry
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error('ML service failed to become ready');
  }
}
