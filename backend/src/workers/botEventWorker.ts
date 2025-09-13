/**
 * BullMQ worker for processing Discord bot events
 */

import { Worker, type Job } from 'bullmq';
import { REST, Routes, Client } from 'discord.js';
import logger from '../utils/logger.js';
import { redisConfig } from '../config/redis.js';
import { config } from '../config/env.js';
import type { BotEventJobData, BotEventJobResult } from '../queues/botEventQueue.js';
import { discordClientManager } from '../adapters/discord/DiscordClientManager.js';
import { ResponseGeneratorService } from '../services/ResponseGeneratorService.js';
import { SearchService } from '../services/SearchService.js';
import { MlClientService } from '../services/MlClientService.js';
import { db } from '../database/index.js';
import { KnowledgeBaseChunkRepositoryImpl } from '../repositories/knowledgeBase/KnowledgeBaseChunkRepository.js';

/**
 * Bot event worker implementation
 */
export class BotEventWorker {
  private worker: Worker<BotEventJobData, BotEventJobResult>;
  private responseGenerator: ResponseGeneratorService;

  constructor() {
    // Initialize ML client
    const mlClient = new MlClientService({
      baseUrl: config.ML_SERVICE_URL,
      apiKey: config.ML_SERVICE_API_KEY,
    });

    // Initialize search service
    const searchService = new SearchService(mlClient);

    // Initialize knowledge base chunk repository
    const knowledgeBaseChunkRepo = new KnowledgeBaseChunkRepositoryImpl(db);

    // Initialize response generator with all dependencies
    this.responseGenerator = new ResponseGeneratorService(searchService, mlClient, knowledgeBaseChunkRepo);
    // Create the worker
    this.worker = new Worker<BotEventJobData, BotEventJobResult>(
      'bot-events',
      async (job: Job<BotEventJobData>) => {
        try {
          logger.info('BotEventWorker processing job', {
            jobId: job.id,
            jobName: job.name,
            data: job.data,
          });

          return await this.processBotEvent(job);
        } catch (error) {
          logger.error('Fatal error in bot event worker job processing', {
            jobId: job.id,
            jobName: job.name,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          throw error; // Re-throw to mark job as failed
        }
      },
      {
        connection: redisConfig,
        concurrency: 5, // Process multiple bot events concurrently
      }
    );

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    logger.info('Starting bot event worker');
    // Worker starts automatically when instantiated
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    logger.info('Stopping bot event worker');
    await this.worker.close();
  }

  /**
   * Process a bot event job
   */
  private async processBotEvent(job: Job<BotEventJobData>): Promise<BotEventJobResult> {
    const startTime = Date.now();
    const { type, tenantId, channelId, userId } = job.data;

    logger.info('Processing bot event', {
      jobId: job.id,
      type,
      tenantId,
      channelId,
      userId,
    });

    try {
      // Check if Discord client is ready
      if (!discordClientManager.isReady()) {
        throw new Error('Discord client not ready');
      }

      const client = discordClientManager.getClient();

      // Handle different event types
      let botResponse: import('../services/ResponseGeneratorService.js').BotResponse;
      switch (type) {
        case 'slash_command':
          botResponse = await this.handleSlashCommand(job.data, client);
          break;
        case 'thread_create':
          botResponse = await this.handleThreadCreate(job.data, client);
          break;
        default:
          throw new Error(`Unknown bot event type: ${type}`);
      }

      const result: BotEventJobResult = {
        success: true,
        response: botResponse,
        processingTimeMs: Date.now() - startTime,
      };

      logger.info('Bot event processed successfully', {
        jobId: job.id,
        processingTimeMs: result.processingTimeMs,
        responseLength: botResponse.content.length,
      });

      return result;
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      logger.error('Failed to process bot event', {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs,
      };
    }
  }

  /**
   * Handle slash command events
   */
  private async handleSlashCommand(data: BotEventJobData, client: Client): Promise<import('../services/ResponseGeneratorService.js').BotResponse> {
    try {
      // Get tenant slug from tenant ID
      const tenantSlug = await this.getTenantSlug(data.tenantId);
      if (!tenantSlug) {
        throw new Error(`Tenant not found for ID: ${data.tenantId}`);
      }

      // Build context from thread if in thread
      let context: string | undefined;
      if (data.threadId) {
        context = await this.getThreadContext(data.threadId, client);
      }

      // Generate response using the response generator
      const botResponse = await this.responseGenerator.generateResponse(tenantSlug, {
        originalQuery: data.content,
        context,
        maxResultsPerQuery: 5,
        maxTotalResults: 10,
      });

      logger.info('Generated real slash command response', {
        question: data.content,
        confidence: botResponse.confidence,
        sourcesCount: botResponse.sources.length,
        responseLength: botResponse.content.length,
      });

      // Update the original interaction reply if interaction details are available
      if (data.interaction) {
        try {
          const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);
          
          await rest.patch(
            Routes.webhookMessage(data.interaction.applicationId, data.interaction.token, '@original'),
            {
              body: {
                content: botResponse.content
              }
            }
          );
          
          logger.info('Updated interaction reply with bot response', {
            interactionId: data.interaction.id,
            responseLength: botResponse.content.length,
          });
        } catch (error) {
          logger.error('Failed to update interaction reply', {
            interactionId: data.interaction?.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        // Fallback: send new message to channel (for thread events or if interaction data is missing)
        try {
          const channel = await client.channels.fetch(data.channelId);
          if (channel && channel.isTextBased() && 'send' in channel) {
            await channel.send(botResponse.content);
            logger.info('Sent bot response to Discord channel', {
              channelId: data.channelId,
              responseLength: botResponse.content.length,
            });
          }
        } catch (error) {
          logger.error('Failed to send response to Discord', {
            channelId: data.channelId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return botResponse;

    } catch (error) {
      logger.error('Failed to generate response for slash command', {
        question: data.content,
        tenantId: data.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to error response
      const errorResponse = "I encountered an error generating a response. Please try again or rephrase your question.";
      
      // Try to send error response
      if (data.interaction) {
        try {
          const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);
          await rest.patch(
            Routes.webhookMessage(data.interaction.applicationId, data.interaction.token, '@original'),
            {
              body: {
                content: errorResponse
              }
            }
          );
        } catch (updateError) {
          logger.error('Failed to send error response via interaction', { 
            updateError: updateError instanceof Error ? updateError.message : String(updateError) 
          });
        }
      }

      return {
        content: errorResponse,
        confidence: 'low' as const,
        sources: [],
        searchResultCount: 0,
      };
    }
  }

  /**
   * Handle thread creation events
   */
  private async handleThreadCreate(data: BotEventJobData, client: Client): Promise<import('../services/ResponseGeneratorService.js').BotResponse> {
    try {
      // Get tenant slug from tenant ID
      const tenantSlug = await this.getTenantSlug(data.tenantId);
      if (!tenantSlug) {
        throw new Error(`Tenant not found for ID: ${data.tenantId}`);
      }

      // Build context from thread messages
      let context: string | undefined;
      if (data.context && data.context.length > 0) {
        // Use the context provided by the DiscordBotService
        context = data.context
          .map(msg => `${msg.authorUsername}: ${msg.content}`)
          .filter(msg => msg.trim().length > 0)
          .join('\n');
      }

      // Prepare the query - use thread name and initial messages
      const threadName = data.content.replace('Thread: ', '');
      const query = context
        ? `New thread "${threadName}" was created with the following conversation:\n\n${context}\n\nPlease provide helpful information based on this discussion.`
        : `New thread "${threadName}" was created. Please provide helpful information about this topic.`;

      // Generate response using the response generator
      const botResponse = await this.responseGenerator.generateResponse(tenantSlug, {
        originalQuery: query,
        context: context,
        maxResultsPerQuery: 5,
        maxTotalResults: 10,
      });

      logger.info('Generated thread auto-response', {
        threadId: data.threadId,
        confidence: botResponse.confidence,
        sourcesCount: botResponse.sources.length,
        responseLength: botResponse.content.length,
        contextMessages: data.context?.length || 0,
      });

      // Send response to the thread
      try {
        const thread = await client.channels.fetch(data.threadId || data.channelId);
        if (thread && thread.isTextBased() && 'send' in thread) {
          await thread.send(botResponse.content);
          logger.info('Sent bot response to Discord thread', {
            threadId: data.threadId || data.channelId,
            responseLength: botResponse.content.length,
          });
        }
      } catch (error) {
        logger.error('Failed to send response to Discord thread', {
          threadId: data.threadId || data.channelId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      return botResponse;
    } catch (error) {
      logger.error('Failed to handle thread creation', {
        threadId: data.threadId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return a fallback response
      const fallbackResponse = 'Welcome to this thread! I encountered an error while trying to provide relevant information. Please feel free to ask questions and I\'ll do my best to help.';

      // Try to send fallback response
      try {
        const thread = await client.channels.fetch(data.threadId || data.channelId);
        if (thread && thread.isTextBased() && 'send' in thread) {
          await thread.send(fallbackResponse);
        }
      } catch (sendError) {
        logger.error('Failed to send fallback response', {
          threadId: data.threadId,
          error: sendError instanceof Error ? sendError.message : String(sendError),
        });
      }

      return {
        content: fallbackResponse,
        confidence: 'low' as const,
        sources: [],
        searchResultCount: 0,
      };
    }
  }

  /**
   * Setup event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      logger.info('Bot event job completed', {
        jobId: job.id,
        eventType: job.data.type,
        tenantId: job.data.tenantId,
      });
    });

    this.worker.on('failed', (job, error) => {
      logger.error('Bot event job failed', {
        jobId: job?.id,
        eventType: job?.data.type,
        tenantId: job?.data.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
        attemptsMade: job?.attemptsMade,
        willRetry: job?.attemptsMade && job.attemptsMade < 3,
      });
    });

    this.worker.on('progress', (job, progress) => {
      logger.debug('Bot event job progress', {
        jobId: job.id,
        eventType: job.data.type,
        tenantId: job.data.tenantId,
        progress,
      });
    });

    this.worker.on('error', (error) => {
      logger.error('Bot event worker error', { error });
    });
  }

  /**
   * Get tenant slug from tenant ID
   */
  private async getTenantSlug(tenantId: string): Promise<string | null> {
    try {
      const result = await db
        .selectFrom('tenants')
        .select('slug')
        .where('id', '=', tenantId)
        .executeTakeFirst();
      
      return result?.slug || null;
    } catch (error) {
      logger.error('Failed to get tenant slug', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get thread context by fetching recent messages
   */
  private async getThreadContext(threadId: string, client: Client): Promise<string | undefined> {
    try {
      const thread = await client.channels.fetch(threadId);
      if (!thread || !thread.isThread()) {
        return undefined;
      }

      // Fetch last 20 messages from thread
      const messages = await thread.messages.fetch({ limit: 20 });
      if (messages.size === 0) {
        return undefined;
      }

      // Build context from messages (reverse chronological order)
      const contextMessages = Array.from(messages.values())
        .reverse() // Oldest first
        .map((msg) => `${msg.author.username}: ${msg.content}`)
        .filter((msg: string) => msg.trim().length > 0)
        .slice(0, 10) // Limit to 10 messages to avoid overly long context
        .join('\n');

      return contextMessages.length > 0 ? contextMessages : undefined;
    } catch (error) {
      logger.warn('Failed to get thread context', {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}