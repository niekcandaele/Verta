import { Kysely } from 'kysely';
import { Database } from '../database/types.js';
import { MlClientService } from './MlClientService.js';
import { mlConfig } from '../config/ml.js';
import logger from '../utils/logger.js';

/**
 * Service for processing Discord threads
 * Handles content aggregation and question extraction
 */
export class ThreadProcessingService {
  private mlClient: MlClientService;

  constructor(private db: Kysely<Database>) {
    this.mlClient = new MlClientService({
      baseUrl: mlConfig.mlServiceUrl,
      apiKey: mlConfig.mlServiceApiKey,
      timeout: mlConfig.mlServiceTimeout,
      maxRetries: mlConfig.mlServiceMaxRetries,
      retryDelay: mlConfig.mlServiceRetryDelay,
    });
  }

  /**
   * Aggregate all messages in a thread into a single text
   * @param threadId The thread channel ID
   * @returns Concatenated thread content with message metadata
   */
  async aggregateThreadContent(threadId: string): Promise<{
    content: string;
    messageCount: number;
    participants: Set<string>;
    firstMessageAt: Date;
    lastMessageAt: Date;
  }> {
    // Fetch all messages in the thread, ordered chronologically
    const messages = await this.db
      .selectFrom('messages')
      .selectAll()
      .where('channel_id', '=', threadId)
      .orderBy('platform_created_at', 'asc')
      .execute();

    if (messages.length === 0) {
      throw new Error(`No messages found in thread ${threadId}`);
    }

    // Track unique participants
    const participants = new Set<string>();

    // Build aggregated content with author context
    const contentParts: string[] = [];

    for (const message of messages) {
      participants.add(message.anonymized_author_id);

      // Format: "Author123: message content"
      // This helps LLM understand conversation flow
      const authorLabel = `User${message.anonymized_author_id.slice(-4)}`;
      contentParts.push(`${authorLabel}: ${message.content}`);
    }

    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];

    return {
      content: contentParts.join('\n'),
      messageCount: messages.length,
      participants,
      firstMessageAt: new Date(firstMessage.platform_created_at),
      lastMessageAt: new Date(lastMessage.platform_created_at),
    };
  }

  /**
   * Extract the primary question from thread content
   * @param threadContent The aggregated thread content
   * @param threadTitle Optional thread title for context
   * @returns The primary question extracted from the thread
   */
  async extractPrimaryQuestion(
    threadContent: string,
    threadTitle?: string | null
  ): Promise<{
    question: string;
    confidence: number;
  } | null> {
    try {
      // Build context for LLM
      const context = threadTitle
        ? `Thread Title: ${threadTitle}\n\nConversation:\n${threadContent}`
        : threadContent;

      // Use ML service to extract primary question
      const prompt = `Extract the CORE question from this Discord thread. Be very concise.

Focus on the main problem only, without specific details.
Keep it under 15 words if possible.
Return "NO_QUESTION" if there's no clear question.

Examples of good extraction:
- "How do I fix permission errors?"
- "Why isn't my server connecting?"
- "How do I configure game settings?"

${context}`;

      const response = await this.mlClient.rephrase({
        messages: [
          {
            text: prompt,
            author_id: 'system',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      if (!response || response.rephrased_text === 'NO_QUESTION') {
        return null;
      }

      // Also classify to get confidence
      const classification = await this.mlClient.classify(
        response.rephrased_text
      );

      if (!classification.is_question) {
        return null;
      }

      return {
        question: response.rephrased_text,
        confidence: classification.confidence,
      };
    } catch (error) {
      logger.error('Failed to extract primary question', { error });
      return null;
    }
  }

  /**
   * Process a thread to extract and return question data
   * @param threadId The thread channel ID
   * @param threadTitle Optional thread title
   * @returns Extracted question data or null if no question found
   */
  async processThread(
    threadId: string,
    threadTitle?: string | null
  ): Promise<{
    originalContent: string;
    extractedQuestion: string;
    confidence: number;
    messageCount: number;
    participantCount: number;
    firstMessageAt: Date;
    lastMessageAt: Date;
  } | null> {
    try {
      // Step 1: Aggregate thread content
      const aggregated = await this.aggregateThreadContent(threadId);

      // Step 2: Extract primary question
      const questionData = await this.extractPrimaryQuestion(
        aggregated.content,
        threadTitle
      );

      if (!questionData) {
        return null;
      }

      return {
        originalContent: aggregated.content,
        extractedQuestion: questionData.question,
        confidence: questionData.confidence,
        messageCount: aggregated.messageCount,
        participantCount: aggregated.participants.size,
        firstMessageAt: aggregated.firstMessageAt,
        lastMessageAt: aggregated.lastMessageAt,
      };
    } catch (error) {
      logger.error(`Failed to process thread ${threadId}`, { error });
      throw error;
    }
  }
}
