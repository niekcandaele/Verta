import { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import type { Database, Message, QuestionCluster } from '../database/types.js';
import { MlClientService } from './MlClientService.js';
import { QuestionClusterRepository } from '../repositories/QuestionClusterRepository.js';
import { QuestionInstanceRepository } from '../repositories/QuestionInstanceRepository.js';

export interface ProcessingOptions {
  batchSize?: number;
  similarityThreshold?: number;
  contextWindowSize?: number;
  includeRephrasing?: boolean;
}

export interface ProcessingResult {
  messagesProcessed: number;
  questionsIdentified: number;
  questionsFromOcr: number;
  clustersCreated: number;
  clustersUpdated: number;
  errors: Array<{ messageId: string; error: string }>;
}

export interface MessageContext {
  message: Message;
  contextMessages: Message[];
}

export class QuestionProcessingService {
  private mlClient: MlClientService;
  private clusterRepo: QuestionClusterRepository;
  private instanceRepo: QuestionInstanceRepository;

  constructor(
    private db: Kysely<Database>,
    mlServiceConfig: {
      baseUrl: string;
      apiKey: string;
    }
  ) {
    this.mlClient = new MlClientService(mlServiceConfig);
    this.clusterRepo = new QuestionClusterRepository(db);
    this.instanceRepo = new QuestionInstanceRepository(db);
  }

  /**
   * Process a batch of messages to identify and cluster questions
   */
  async processBatch(
    messages: Message[],
    tenantId: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const {
      batchSize = 100,
      similarityThreshold = 0.85,
      contextWindowSize = 5,
      includeRephrasing = true,
    } = options;

    const result: ProcessingResult = {
      messagesProcessed: 0,
      questionsIdentified: 0,
      questionsFromOcr: 0,
      clustersCreated: 0,
      clustersUpdated: 0,
      errors: [],
    };

    logger.info(
      `Processing batch of ${messages.length} messages for tenant ${tenantId}`
    );

    // Process messages in smaller chunks for efficiency
    for (let i = 0; i < messages.length; i += batchSize) {
      const chunk = messages.slice(i, Math.min(i + batchSize, messages.length));

      try {
        await this.processChunk(
          chunk,
          tenantId,
          {
            similarityThreshold,
            contextWindowSize,
            includeRephrasing,
          },
          result
        );
      } catch (error) {
        logger.error(`Failed to process chunk ${i / batchSize + 1}`, error);
        // Continue with next chunk even if one fails
      }
    }

    logger.info('Batch processing completed', result);
    return result;
  }

  /**
   * Fetch OCR results for messages with attachments
   */
  private async fetchOcrResultsForMessages(
    messages: Message[]
  ): Promise<Map<string, string>> {
    const ocrTextMap = new Map<string, string>();
    
    try {
      // Get all message IDs
      const messageIds = messages.map(m => m.id);
      
      // Fetch OCR results for these messages
      const ocrResults = await this.db
        .selectFrom('ocr_results')
        .innerJoin('message_attachments', 'message_attachments.id', 'ocr_results.attachment_id')
        .select([
          'message_attachments.message_id',
          'ocr_results.extracted_text',
          'ocr_results.status'
        ])
        .where('message_attachments.message_id', 'in', messageIds)
        .where('ocr_results.status', '=', 'completed')
        .execute();
      
      // Aggregate OCR text by message ID
      for (const result of ocrResults) {
        if (result.extracted_text) {
          const existing = ocrTextMap.get(result.message_id) || '';
          // Append OCR text with a separator if there are multiple attachments
          ocrTextMap.set(
            result.message_id,
            existing ? `${existing}\n\n[Image Description]:\n${result.extracted_text}` : result.extracted_text
          );
        }
      }
      
      logger.debug(`Fetched OCR results for ${ocrTextMap.size} messages`);
    } catch (error) {
      logger.error('Failed to fetch OCR results', error);
    }
    
    return ocrTextMap;
  }

  /**
   * Combine message content with OCR text
   */
  private combineMessageWithOcr(
    message: Message,
    ocrText: string | undefined
  ): string {
    if (!ocrText) {
      return message.content;
    }
    
    // Combine message text with OCR text
    // If message has no text content (just an image), use only OCR text
    if (!message.content || message.content.trim() === '') {
      return ocrText;
    }
    
    // Otherwise combine both
    return `${message.content}\n\n[Image Content]:\n${ocrText}`;
  }

  /**
   * Process a single chunk of messages
   */
  private async processChunk(
    messages: Message[],
    tenantId: string,
    options: {
      similarityThreshold: number;
      contextWindowSize: number;
      includeRephrasing: boolean;
    },
    result: ProcessingResult
  ): Promise<void> {
    // Step 1: Fetch OCR results for messages with attachments
    const ocrTextMap = await this.fetchOcrResultsForMessages(messages);
    
    // Step 2: Combine message content with OCR text
    const texts = messages.map((m) => {
      const ocrText = ocrTextMap.get(m.id);
      return this.combineMessageWithOcr(m, ocrText);
    });
    
    // Step 3: Classify messages in batch
    const classifications = await this.mlClient.classifyBatch(texts);

    // Step 4: Filter questions and track OCR contributions
    const questions: Message[] = [];
    const questionIndices: number[] = [];
    const questionTexts: string[] = [];
    let ocrQuestionCount = 0;

    classifications.forEach((classification, index) => {
      if (classification.is_question && classification.confidence >= 0.6) {
        const message = messages[index];
        questions.push(message);
        questionIndices.push(index);
        questionTexts.push(texts[index]); // Use combined text
        
        // Track if this question was identified with OCR help
        const hasOcrText = ocrTextMap.has(message.id);
        if (hasOcrText) {
          // Check if the message wouldn't be a question without OCR
          if (!message.content || message.content.trim() === '') {
            // Message only has image content
            ocrQuestionCount++;
            logger.debug(`Question identified from OCR only: ${message.id}`);
          } else {
            // Check if original text alone would be classified as question
            this.mlClient.classify(message.content).then((originalClassification) => {
              if (!originalClassification.is_question || originalClassification.confidence < 0.6) {
                ocrQuestionCount++;
                logger.debug(`Question identified with OCR help: ${message.id}`);
              }
            }).catch(() => {}); // Non-blocking check
          }
        }
      }
    });

    if (questions.length === 0) {
      result.messagesProcessed += messages.length;
      return;
    }

    logger.debug(`Identified ${questions.length} questions in chunk (${ocrQuestionCount} with OCR help)`);
    result.questionsIdentified += questions.length;
    result.questionsFromOcr += ocrQuestionCount;

    // Step 5: Generate embeddings for questions (using combined text)
    const embeddings = await this.mlClient.embedBatch(questionTexts);

    // Step 6: Process each question
    for (let i = 0; i < questions.length; i++) {
      const message = questions[i];
      const embedding = embeddings[i].embedding;
      const combinedText = questionTexts[i]; // Use combined text with OCR

      try {
        // Check if already processed
        const existingInstance = await this.instanceRepo.findByThreadId(
          message.id
        );
        if (existingInstance) {
          logger.debug(`Message ${message.id} already processed`);
          continue;
        }

        // Find similar cluster
        const similarCluster = await this.clusterRepo.findMostSimilarCluster(
          embedding,
          tenantId,
          options.similarityThreshold
        );

        let clusterId: string;
        let rephrased: string | null = null;

        if (similarCluster) {
          // Add to existing cluster
          clusterId = similarCluster.id;
          await this.clusterRepo.incrementInstanceCount(
            clusterId,
            new Date(message.platform_created_at)
          );
          result.clustersUpdated++;
          logger.debug(`Added message to existing cluster ${clusterId}`);
        } else {
          // Create new cluster
          clusterId = uuidv4();

          // Get context for rephrasing if enabled
          if (options.includeRephrasing) {
            const context = await this.getMessageContext(
              message,
              options.contextWindowSize
            );

            if (context.contextMessages.length > 0) {
              try {
                // Include OCR text in rephrasing context
                const rephraseResult = await this.mlClient.rephrase({
                  messages: [
                    ...context.contextMessages.map((m) => ({
                      text: m.content,
                      author_id: m.anonymized_author_id,
                      timestamp: m.platform_created_at.toISOString(),
                    })),
                    {
                      text: combinedText, // Use combined text for rephrasing
                      author_id: message.anonymized_author_id,
                      timestamp: message.platform_created_at.toISOString(),
                    },
                  ],
                });

                if (rephraseResult.confidence >= 0.7) {
                  rephrased = rephraseResult.rephrased_text;
                }
              } catch (error) {
                logger.warn(`Failed to rephrase message ${message.id}`, error);
              }
            }
          }

          // Create new cluster using combined text as representative
          await this.clusterRepo.create({
            id: clusterId,
            tenant_id: tenantId,
            representative_text: rephrased || combinedText, // Use combined text
            embedding,
            instance_count: 1,
            first_seen_at: message.platform_created_at,
            last_seen_at: message.platform_created_at,
            metadata: {
              original_message_id: message.id,
              channel_id: message.channel_id,
              has_ocr_content: ocrTextMap.has(message.id),
            },
          });
          result.clustersCreated++;
          logger.debug(`Created new cluster ${clusterId}`);
        }

        // Create question instance with combined text
        await this.instanceRepo.create({
          cluster_id: clusterId,
          thread_id: message.id,
          original_text: combinedText, // Store combined text
          rephrased_text: rephrased,
          confidence_score: classifications[questionIndices.indexOf(i)].confidence,
        });
      } catch (error) {
        logger.error(`Failed to process message ${message.id}`, error);
        result.errors.push({
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    result.messagesProcessed += messages.length;
  }

  /**
   * Get context messages for a given message
   */
  private async getMessageContext(
    message: Message,
    windowSize: number
  ): Promise<MessageContext> {
    try {
      // Get messages from the same author in the same channel
      // within a time window (e.g., 5 minutes before)
      const timeWindowStart = new Date(message.platform_created_at);
      timeWindowStart.setMinutes(timeWindowStart.getMinutes() - 5);

      const contextMessages = await this.db
        .selectFrom('messages')
        .selectAll()
        .where('channel_id', '=', message.channel_id)
        .where('anonymized_author_id', '=', message.anonymized_author_id)
        .where('platform_created_at', '>=', timeWindowStart)
        .where('platform_created_at', '<', message.platform_created_at)
        .orderBy('platform_created_at', 'desc')
        .limit(windowSize)
        .execute();

      return {
        message,
        contextMessages: contextMessages.reverse(), // Chronological order
      };
    } catch (error) {
      logger.error(`Failed to get context for message ${message.id}`, error);
      return {
        message,
        contextMessages: [],
      };
    }
  }

  /**
   * Process a single message (for real-time processing)
   */
  async processSingleMessage(
    message: Message,
    tenantId: string,
    options: ProcessingOptions = {}
  ): Promise<{
    isQuestion: boolean;
    clusterId?: string;
    confidence: number;
    hasOcrContent?: boolean;
  }> {
    try {
      // Fetch OCR results for this message
      const ocrTextMap = await this.fetchOcrResultsForMessages([message]);
      const ocrText = ocrTextMap.get(message.id);
      const combinedText = this.combineMessageWithOcr(message, ocrText);
      const hasOcrContent = !!ocrText;
      
      // Classify the combined text
      const classification = await this.mlClient.classify(combinedText);

      if (!classification.is_question || classification.confidence < 0.6) {
        return {
          isQuestion: false,
          confidence: classification.confidence,
          hasOcrContent,
        };
      }

      // Generate embedding for combined text
      const embeddingResult = await this.mlClient.embed(combinedText);

      // Find or create cluster
      const similarCluster = await this.clusterRepo.findMostSimilarCluster(
        embeddingResult.embedding,
        tenantId,
        options.similarityThreshold || 0.85
      );

      let clusterId: string;

      if (similarCluster) {
        clusterId = similarCluster.id;
        await this.clusterRepo.incrementInstanceCount(
          clusterId,
          new Date(message.platform_created_at)
        );
      } else {
        // Create new cluster
        clusterId = uuidv4();
        await this.clusterRepo.create({
          id: clusterId,
          tenant_id: tenantId,
          representative_text: combinedText,
          embedding: embeddingResult.embedding,
          instance_count: 1,
          first_seen_at: message.platform_created_at,
          last_seen_at: message.platform_created_at,
          metadata: {
            original_message_id: message.id,
            channel_id: message.channel_id,
            has_ocr_content: hasOcrContent,
          },
        });
      }

      // Create question instance
      await this.instanceRepo.create({
        cluster_id: clusterId,
        thread_id: message.id,
        original_text: combinedText,
        confidence_score: classification.confidence,
      });
      
      // Log if OCR helped identify this question
      if (hasOcrContent && (!message.content || message.content.trim() === '')) {
        logger.info(`Question identified from OCR only: ${message.id}`);
      }

      return {
        isQuestion: true,
        clusterId,
        confidence: classification.confidence,
        hasOcrContent,
      };
    } catch (error) {
      logger.error(`Failed to process single message ${message.id}`, error);
      throw error;
    }
  }

  /**
   * Get processing statistics for a tenant
   */
  async getStatistics(tenantId: string): Promise<{
    totalClusters: number;
    totalInstances: number;
    avgInstancesPerCluster: number;
    recentClusters: QuestionCluster[];
  }> {
    const stats = await this.clusterRepo.getStatsByTenant(tenantId);
    const recentClusters = await this.clusterRepo.findByTenant(tenantId, {
      limit: 10,
      sortBy: 'last_seen_at',
      sortOrder: 'desc',
    });

    return {
      totalClusters: stats.total_clusters,
      totalInstances: stats.total_instances,
      avgInstancesPerCluster: stats.avg_instances_per_cluster,
      recentClusters,
    };
  }
}
