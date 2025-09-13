import { MlClientService, SearchResultItem, GenerateRequest, GenerateResponse } from './MlClientService.js';
import { SearchService } from './SearchService.js';
import { SearchApiRequest } from 'shared-types';
import logger from '../utils/logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import type { KnowledgeBaseChunkRepository } from '../repositories/knowledgeBase/types.js';

export interface BotResponse {
  content: string;
  confidence: 'high' | 'medium' | 'low';
  sources: Array<{
    type: 'golden_answer' | 'message' | 'knowledge_base';
    title: string;
    url?: string;
    excerpt?: string;
  }>;
  searchResultCount: number;
}

export interface MultiQuerySearchOptions {
  originalQuery: string;
  context?: string;
  maxResultsPerQuery?: number;
  maxTotalResults?: number;
}

export class ResponseGeneratorService {
  constructor(
    private searchService: SearchService,
    private mlClient: MlClientService,
    private knowledgeBaseChunkRepo: KnowledgeBaseChunkRepository
  ) {}

  /**
   * Generate a comprehensive bot response using multi-step search with LLM guidance
   */
  async generateResponse(
    tenantSlug: string,
    options: MultiQuerySearchOptions
  ): Promise<BotResponse> {
    try {
      // Step 1: Perform initial search and expand documents
      logger.info('Starting multi-step search', {
        tenant: tenantSlug,
        query: options.originalQuery,
      });
      
      const initialResults = await this.performSearch(tenantSlug, options);
      const expandedInitial = await this.fetchCompleteDocuments(initialResults);

      if (expandedInitial.length === 0) {
        return {
          content: "I couldn't find relevant information for your question. Try rephrasing or check the documentation directly.",
          confidence: 'low',
          sources: [],
          searchResultCount: 0,
        };
      }

      // Step 2: Get follow-up queries from LLM
      const suggestedQueries = await this.getFollowUpQueries(
        options.originalQuery,
        expandedInitial
      );
      
      // Step 3: Execute follow-up searches if we have suggestions
      let allResults = expandedInitial;
      if (suggestedQueries.length > 0) {
        const followUpResults = await this.performFollowUpSearches(
          tenantSlug,
          suggestedQueries
        );
        
        // Step 4: Expand follow-up results
        const expandedFollowUp = await this.fetchCompleteDocuments(followUpResults);
        
        // Step 5: Combine all results, avoiding duplicates
        const combinedResults = [...expandedInitial];
        const seenIds = new Set(expandedInitial.map(r => 
          r.type === 'golden_answer' ? `g_${r.metadata?.id}` :
          r.type === 'knowledge_base' ? `k_${r.metadata?.id}` :
          `m_${r.message_id}`
        ));
        
        for (const result of expandedFollowUp) {
          const id = result.type === 'golden_answer' ? `g_${result.metadata?.id}` :
                     result.type === 'knowledge_base' ? `k_${result.metadata?.id}` :
                     `m_${result.message_id}`;
          if (!seenIds.has(id)) {
            combinedResults.push(result);
            seenIds.add(id);
          }
        }
        
        allResults = combinedResults;
      }

      logger.info('Multi-step search completed', {
        tenant: tenantSlug,
        initialResults: expandedInitial.length,
        followUpQueries: suggestedQueries.length,
        totalResults: allResults.length,
      });

      // Step 6: Generate final response with all context
      const generateRequest: GenerateRequest = {
        question: options.originalQuery,
        search_results: allResults.slice(0, 50), // Limit to prevent context overflow
        context: options.context,
        max_response_length: 1800,
      };

      const generateResult = await this.mlClient.generate(generateRequest);

      // Format the response for Discord
      const formattedResponse = this.formatDiscordResponse(
        generateResult,
        allResults
      );

      return formattedResponse;
    } catch (error) {
      logger.error('Response generation failed', {
        tenant: tenantSlug,
        query: options.originalQuery,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      // Check for specific ML service errors
      if (
        error instanceof Error &&
        error.message.includes('Circuit breaker is OPEN')
      ) {
        throw new ApiError(
          503,
          'Service Unavailable',
          'Response generation service is temporarily unavailable'
        );
      }

      throw new ApiError(
        500,
        'Internal Server Error',
        'Failed to generate response'
      );
    }
  }

  /**
   * Perform single optimized search query
   */
  private async performSearch(
    tenantSlug: string,
    options: MultiQuerySearchOptions
  ): Promise<SearchResultItem[]> {
    const maxResults = options.maxTotalResults || 10;

    logger.info('Performing search', {
      tenant: tenantSlug,
      query: options.originalQuery,
    });

    try {
      const searchRequest: SearchApiRequest = {
        query: options.originalQuery,
        limit: maxResults,
        excludeMessages: true,
      };

      const response = await this.searchService.search(tenantSlug, searchRequest);
      
      // Sort results by priority and score
      const sortedResults = response.results
        .sort((a, b) => this.prioritizeResults(a, b))
        .slice(0, maxResults);

      logger.info('Search completed', {
        tenant: tenantSlug,
        totalResults: sortedResults.length,
        resultsByType: this.countResultsByType(sortedResults),
      });

      return sortedResults;
    } catch (error) {
      logger.error('Search failed', {
        tenant: tenantSlug,
        query: options.originalQuery,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Fetch complete documents for knowledge base search results
   */
  private async fetchCompleteDocuments(
    searchResults: SearchResultItem[]
  ): Promise<SearchResultItem[]> {
    // Extract unique source URLs from knowledge base results
    const kbResults = searchResults.filter(r => r.type === 'knowledge_base');
    const uniqueUrls = new Set<string>();
    
    kbResults.forEach(result => {
      if (result.metadata?.source_url) {
        uniqueUrls.add(result.metadata.source_url);
      }
    });

    if (uniqueUrls.size === 0) {
      // No knowledge base results, return original results
      return searchResults;
    }

    logger.info('Fetching complete documents', {
      uniqueUrls: Array.from(uniqueUrls),
      originalResultCount: searchResults.length,
    });

    // Keep all non-KB results and a map to track which KB chunks we've seen
    const enhancedResults: SearchResultItem[] = searchResults.filter(r => r.type !== 'knowledge_base');
    const seenChunkIds = new Set<string>();
    
    // Add original KB results and track their IDs
    kbResults.forEach(result => {
      enhancedResults.push(result);
      if (result.metadata?.id) {
        seenChunkIds.add(result.metadata.id);
      }
    });

    // Fetch all chunks for each unique URL
    try {
      for (const url of uniqueUrls) {
        const chunks = await this.knowledgeBaseChunkRepo.findBySourceUrl(url);
        
        // Convert chunks to SearchResultItem format and add if not already seen
        chunks.forEach(chunk => {
          if (!seenChunkIds.has(chunk.id)) {
            enhancedResults.push({
              type: 'knowledge_base',
              score: 0.5, // Give fetched chunks a moderate score
              content: chunk.content,
              excerpt: chunk.content.slice(0, 200) + '...',
              metadata: {
                id: chunk.id,
                kb_id: chunk.knowledge_base_id,
                source_url: chunk.source_url,
                title: chunk.title,
                chunk_index: chunk.chunk_index,
                total_chunks: chunk.total_chunks,
              },
            });
            seenChunkIds.add(chunk.id);
          }
        });
      }
    } catch (error) {
      logger.error('Failed to fetch complete documents', {
        error: error instanceof Error ? error.message : 'Unknown error',
        urls: Array.from(uniqueUrls),
      });
      // Continue with original results if fetch fails
    }

    // Sort by type and score, then limit to reasonable number
    const sortedResults = enhancedResults
      .sort((a, b) => this.prioritizeResults(a, b))
      .slice(0, 30); // Increased limit for enhanced context

    logger.info('Document enrichment completed', {
      originalCount: searchResults.length,
      enhancedCount: sortedResults.length,
      resultsByType: this.countResultsByType(sortedResults),
    });

    return sortedResults;
  }


  /**
   * Prioritize results: golden answers first, then by score
   */
  private prioritizeResults(a: SearchResultItem, b: SearchResultItem): number {
    // Golden answers get highest priority
    if (a.type === 'golden_answer' && b.type !== 'golden_answer') return -1;
    if (b.type === 'golden_answer' && a.type !== 'golden_answer') return 1;

    // Then sort by score
    return b.score - a.score;
  }

  /**
   * Count results by type for logging
   */
  private countResultsByType(results: SearchResultItem[]): Record<string, number> {
    return results.reduce((acc, result) => {
      acc[result.type] = (acc[result.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get follow-up queries from LLM based on initial results
   */
  private async getFollowUpQueries(
    originalQuery: string,
    searchResults: SearchResultItem[]
  ): Promise<string[]> {
    try {
      const request = {
        question: originalQuery,
        search_results: searchResults.slice(0, 10), // Send top results to LLM
        max_queries: 5,
      };

      const response = await this.mlClient.suggestQueries(request);
      
      logger.info('LLM suggested follow-up queries', {
        originalQuery,
        suggestedQueries: response.queries,
        reasoning: response.reasoning,
      });

      return response.queries;
    } catch (error) {
      logger.error('Failed to get follow-up queries', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return []; // Continue without follow-up queries on error
    }
  }

  /**
   * Perform multiple follow-up searches in parallel
   */
  private async performFollowUpSearches(
    tenantSlug: string,
    queries: string[]
  ): Promise<SearchResultItem[]> {
    const allResults: SearchResultItem[] = [];

    const searchPromises = queries.map(async (query) => {
      try {
        const searchRequest: SearchApiRequest = {
          query,
          limit: 5, // Fewer results per follow-up query
          excludeMessages: true,
        };

        const response = await this.searchService.search(tenantSlug, searchRequest);
        return response.results;
      } catch (error) {
        logger.warn('Follow-up search failed', {
          tenant: tenantSlug,
          query,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return [];
      }
    });

    const searchResults = await Promise.allSettled(searchPromises);

    searchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      } else {
        logger.warn('Follow-up search promise failed', {
          tenant: tenantSlug,
          queryIndex: index,
          error: result.reason,
        });
      }
    });

    logger.info('Follow-up searches completed', {
      tenant: tenantSlug,
      queryCount: queries.length,
      totalResults: allResults.length,
    });

    return allResults;
  }

  /**
   * Format the ML-generated response for Discord
   */
  private formatDiscordResponse(
    generateResult: GenerateResponse,
    searchResults: SearchResultItem[]
  ): BotResponse {
    const sources = this.buildSourcesList(searchResults.slice(0, 5)); // Top 5 sources

    // Build the formatted content
    const confidenceEmoji = {
      high: '🎯',
      medium: '🔍',
      low: '❓',
    }[generateResult.confidence];

    const content = `${confidenceEmoji} **Answer** (Confidence: ${generateResult.confidence.charAt(0).toUpperCase() + generateResult.confidence.slice(1)})
${generateResult.response}

**Sources:**
${sources.map(source => {
  if (source.url) {
    return `• [${source.title}](${source.url})`;
  }
  return `• ${source.title}`;
}).join('\n')}

*Response generated from ${generateResult.sources_used} search results*`;

    // Ensure we don't exceed Discord's character limit
    const truncatedContent = content.length > 2000 
      ? content.substring(0, 1950) + '...\n\n*Response truncated*'
      : content;

    return {
      content: truncatedContent,
      confidence: generateResult.confidence,
      sources: sources,
      searchResultCount: searchResults.length,
    };
  }

  /**
   * Build sources list from search results with URL deduplication
   */
  private buildSourcesList(results: SearchResultItem[]): Array<{
    type: 'golden_answer' | 'message' | 'knowledge_base';
    title: string;
    url?: string;
    excerpt?: string;
  }> {
    const sourceMap = new Map<string, {
      type: 'golden_answer' | 'message' | 'knowledge_base';
      title: string;
      url?: string;
      excerpt?: string;
      count: number;
    }>();

    results.forEach(result => {
      let source: any;
      let key: string;

      switch (result.type) {
        case 'golden_answer':
          key = result.metadata?.id ? `golden_${result.metadata.id}` : `golden_${result.content?.slice(0, 50)}`;
          source = {
            type: 'golden_answer',
            title: `Golden Answer: ${result.metadata?.question || 'FAQ'}`,
            url: result.metadata?.id ? `http://localhost:3000/faq#${result.metadata.id}` : undefined,
            excerpt: result.content?.slice(0, 100),
            count: 1,
          };
          break;

        case 'knowledge_base':
          // Use URL as key for deduplication
          key = result.metadata?.source_url || `kb_${result.metadata?.id}`;
          source = {
            type: 'knowledge_base',
            title: `${result.metadata?.kb_name || 'Documentation'}: ${result.metadata?.title || 'Article'}`,
            url: result.metadata?.source_url,
            excerpt: result.excerpt?.slice(0, 100),
            count: 1,
          };
          break;

        case 'message':
          key = `message_${result.message_id || result.content?.slice(0, 50)}`;
          source = {
            type: 'message',
            title: `Discussion: ${result.excerpt?.slice(0, 50) || 'Message'}...`,
            excerpt: result.excerpt?.slice(0, 100),
            count: 1,
          };
          break;

        default:
          key = `unknown_${result.content?.slice(0, 50)}`;
          source = {
            type: 'message',
            title: 'Search Result',
            excerpt: result.excerpt?.slice(0, 100),
            count: 1,
          };
      }

      // If we've seen this source before, update the count
      if (sourceMap.has(key)) {
        const existing = sourceMap.get(key)!;
        existing.count++;
        // Update title to indicate multiple chunks if it's from knowledge base
        if (result.type === 'knowledge_base' && existing.count > 1) {
          const baseTitle = existing.title.replace(/ \(\d+ sections\)$/, '');
          existing.title = `${baseTitle} (${existing.count} sections)`;
        }
      } else {
        sourceMap.set(key, source);
      }
    });

    // Convert map to array and remove count property
    return Array.from(sourceMap.values()).map(({ count: _count, ...source }) => source);
  }
}