import { z } from 'zod';

const mlConfigSchema = z.object({
  // ML Service Configuration
  mlServiceUrl: z.string().url().default('http://ml-service:8000'),
  mlServiceApiKey: z.string().min(1),
  mlServiceTimeout: z.number().positive().default(30000),
  mlServiceMaxRetries: z.number().positive().default(3),
  mlServiceRetryDelay: z.number().positive().default(1000),

  // Gemini API Configuration
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().default('gemini-1.5-flash-latest'),
  geminiTemperature: z.number().min(0).max(2).default(0.3),
  geminiMaxTokens: z.number().positive().default(512),

  // Processing Configuration
  questionConfidenceThreshold: z.number().min(0).max(1).default(0.6),
  clusterSimilarityThreshold: z.number().min(0).max(1).default(0.7), // Lowered from 0.85 for better clustering
  threadMinAgeDays: z.number().positive().default(5),
  processOnlyThreads: z.boolean().default(true),
  extractPrimaryQuestion: z.boolean().default(true),
  enableRephrasing: z.boolean().default(true),

  // Feature Flags
  enableQuestionClustering: z.boolean().default(true),
  enableLLMRephrasing: z.boolean().default(true),
  enableThreadProcessing: z.boolean().default(true),

  // Vector Search Configuration
  vectorDimension: z.number().positive().default(1024), // BGE-M3 dimension
  maxSimilarResults: z.number().positive().default(10),
});

export type MlConfig = z.infer<typeof mlConfigSchema>;

export function loadMlConfig(): MlConfig {
  if (!process.env.ADMIN_API_KEY) {
    throw new Error('ADMIN_API_KEY environment variable is required');
  }

  const config = {
    // ML Service
    mlServiceUrl: process.env.ML_SERVICE_URL || 'http://ml-service:8000',
    mlServiceApiKey: process.env.ADMIN_API_KEY,
    mlServiceTimeout: parseInt(process.env.ML_SERVICE_TIMEOUT || '30000', 10),
    mlServiceMaxRetries: parseInt(
      process.env.ML_SERVICE_MAX_RETRIES || '3',
      10
    ),
    mlServiceRetryDelay: parseInt(
      process.env.ML_SERVICE_RETRY_DELAY || '1000',
      10
    ),

    // Gemini API
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest',
    geminiTemperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.3'),
    geminiMaxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '512', 10),

    // Processing
    questionConfidenceThreshold: parseFloat(
      process.env.QUESTION_CONFIDENCE_THRESHOLD || '0.6'
    ),
    clusterSimilarityThreshold: parseFloat(
      process.env.CLUSTER_SIMILARITY_THRESHOLD || '0.70' // Lowered from 0.85 for better clustering
    ),
    threadMinAgeDays: parseInt(process.env.THREAD_MIN_AGE_DAYS || '5', 10),
    processOnlyThreads: process.env.PROCESS_ONLY_THREADS !== 'false',
    extractPrimaryQuestion: process.env.EXTRACT_PRIMARY_QUESTION !== 'false',
    enableRephrasing: process.env.ENABLE_REPHRASING !== 'false',

    // Feature Flags
    enableQuestionClustering:
      process.env.ENABLE_QUESTION_CLUSTERING !== 'false',
    enableLLMRephrasing: process.env.ENABLE_LLM_REPHRASING !== 'false',
    enableThreadProcessing: process.env.ENABLE_THREAD_PROCESSING !== 'false',

    // Vector Search
    vectorDimension: parseInt(process.env.VECTOR_DIMENSION || '1024', 10),
    maxSimilarResults: parseInt(process.env.MAX_SIMILAR_RESULTS || '10', 10),
  };

  return mlConfigSchema.parse(config);
}

// Export singleton instance
export const mlConfig = loadMlConfig();
