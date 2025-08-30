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

export interface MlServiceConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export class MlClientService {
  private client: AxiosInstance;
  private config: Required<MlServiceConfig>;
  private circuitBreaker: {
    state: CircuitState;
    failureCount: number;
    lastFailureTime: number;
    halfOpenAttempts: number;
    config: CircuitBreakerConfig;
  };

  constructor(config: MlServiceConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
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

    this.circuitBreaker = {
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastFailureTime: 0,
      halfOpenAttempts: 0,
      config: {
        failureThreshold: 5,
        resetTimeout: 60000, // 1 minute
        halfOpenMaxAttempts: 3,
      },
    };

    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for logging and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('ML Service Request', {
          method: config.method,
          url: config.url,
          data: config.data,
        });
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
        logger.debug('ML Service Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error('ML Service Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check circuit breaker state
   */
  private checkCircuitBreaker(): void {
    const cb = this.circuitBreaker;
    const now = Date.now();

    switch (cb.state) {
      case CircuitState.OPEN:
        if (now - cb.lastFailureTime > cb.config.resetTimeout) {
          cb.state = CircuitState.HALF_OPEN;
          cb.halfOpenAttempts = 0;
          logger.info('Circuit breaker transitioned to HALF_OPEN');
        } else {
          throw new Error('Circuit breaker is OPEN - ML service is unavailable');
        }
        break;
      case CircuitState.HALF_OPEN:
        if (cb.halfOpenAttempts >= cb.config.halfOpenMaxAttempts) {
          cb.state = CircuitState.OPEN;
          cb.lastFailureTime = now;
          logger.warn('Circuit breaker returned to OPEN after max half-open attempts');
          throw new Error('Circuit breaker is OPEN - ML service is unavailable');
        }
        cb.halfOpenAttempts++;
        break;
    }
  }

  /**
   * Record circuit breaker success
   */
  private recordSuccess(): void {
    const cb = this.circuitBreaker;
    if (cb.state === CircuitState.HALF_OPEN) {
      cb.state = CircuitState.CLOSED;
      cb.failureCount = 0;
      logger.info('Circuit breaker transitioned to CLOSED');
    }
    cb.failureCount = 0;
  }

  /**
   * Record circuit breaker failure
   */
  private recordFailure(): void {
    const cb = this.circuitBreaker;
    cb.failureCount++;
    cb.lastFailureTime = Date.now();

    if (cb.state === CircuitState.HALF_OPEN) {
      cb.state = CircuitState.OPEN;
      logger.warn('Circuit breaker transitioned to OPEN from HALF_OPEN');
    } else if (cb.failureCount >= cb.config.failureThreshold) {
      cb.state = CircuitState.OPEN;
      logger.warn('Circuit breaker transitioned to OPEN after reaching failure threshold');
    }
  }

  /**
   * Execute request with retry logic and circuit breaker
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    this.checkCircuitBreaker();

    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await operation();
        this.recordSuccess();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on client errors (4xx)
        if (axios.isAxiosError(error) && error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          logger.warn(`${operationName} failed with client error, not retrying`, {
            status: error.response.status,
            attempt,
          });
          this.recordFailure();
          throw error;
        }

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn(`${operationName} failed, retrying in ${delay}ms`, {
            attempt,
            maxRetries: this.config.maxRetries,
            error: this.getErrorMessage(error),
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          logger.error(`${operationName} failed after all retries`, {
            attempts: this.config.maxRetries,
            error: this.getErrorMessage(error),
          });
          this.recordFailure();
        }
      }
    }

    throw lastError || new Error(`${operationName} failed after ${this.config.maxRetries} attempts`);
  }

  /**
   * Classify text as question or statement
   */
  async classify(text: string): Promise<ClassificationResult> {
    return this.executeWithRetry(
      async () => {
        const response = await this.client.post<ClassificationResult>(
          '/api/ml/classify',
          { text }
        );
        return response.data;
      },
      'Classification'
    );
  }

  /**
   * Classify multiple texts in batch
   */
  async classifyBatch(texts: string[]): Promise<ClassificationResult[]> {
    return this.executeWithRetry(
      async () => {
        const response = await this.client.post<{ results: ClassificationResult[] }>(
          '/api/ml/classify/batch',
          { texts }
        );
        return response.data.results;
      },
      'Batch classification'
    );
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    return this.executeWithRetry(
      async () => {
        const response = await this.client.post<EmbeddingResult>(
          '/api/ml/embed',
          { text }
        );
        return response.data;
      },
      'Embedding generation'
    );
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return this.executeWithRetry(
      async () => {
        const response = await this.client.post<{ results: EmbeddingResult[] }>(
          '/api/ml/embed/batch',
          { texts }
        );
        return response.data.results;
      },
      'Batch embedding'
    );
  }

  /**
   * Rephrase multi-part questions using LLM
   */
  async rephrase(request: RephraseRequest): Promise<RephraseResult> {
    return this.executeWithRetry(
      async () => {
        const response = await this.client.post<RephraseResult>(
          '/api/ml/rephrase',
          request
        );
        return response.data;
      },
      'Rephrasing'
    );
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
   * Wait for ML service to be ready
   */
  async waitForReady(maxAttempts: number = 30, delayMs: number = 2000): Promise<void> {
    logger.info('Waiting for ML service to be ready...');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const health = await this.healthCheck();
        if (health.healthy && health.models_loaded) {
          logger.info('ML service is ready', { version: health.version });
          return;
        }
        logger.debug(`ML service not ready yet (attempt ${attempt}/${maxAttempts})`);
      } catch (_error) {
        logger.debug(`ML service health check failed (attempt ${attempt}/${maxAttempts})`);
      }
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    throw new Error('ML service failed to become ready');
  }
}