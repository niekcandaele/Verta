import { MlClientService } from './MlClientService.js';
import {
  SearchRequest,
  SearchApiRequest,
  SearchApiResponse,
} from 'shared-types';
import logger from '../utils/logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import { db } from '../database/index.js';

export class SearchService {
  constructor(private mlClient: MlClientService) {}

  async search(
    tenantSlug: string,
    apiRequest: SearchApiRequest
  ): Promise<SearchApiResponse> {
    try {
      // Look up tenant ID from slug
      const tenant = await db
        .selectFrom('tenants')
        .select(['id'])
        .where('slug', '=', tenantSlug)
        .executeTakeFirst();

      if (!tenant) {
        throw new ApiError(404, 'Not Found', 'Tenant not found');
      }

      // Generate embedding for the query
      const embedResult = await this.mlClient.embed(apiRequest.query);

      // Build search configs for golden answers, knowledge base chunks, and optionally messages
      const searchConfigs = [
        {
          table: 'golden_answers',
          text_field: 'content',
          vector_field: 'embedding',
          filters: {
            tenant_id: tenant.id,
          },
        },
        {
          table: 'knowledge_base_chunks',
          text_field: 'content',
          vector_field: 'embedding',
          filters: {
            'knowledge_bases.tenant_id': tenant.id,
          },
          joins: [
            {
              table: 'knowledge_bases',
              on: 'knowledge_base_chunks.knowledge_base_id = knowledge_bases.id',
            },
          ],
        },
      ];

      // Only include messages if not explicitly excluded
      if (!apiRequest.excludeMessages) {
        searchConfigs.push({
          table: 'messages',
          text_field: 'content',
          vector_field: 'embedding',
          filters: {
            tenant_id: tenant.id,
          },
        });
      }

      // Build the search request for ML service
      const searchRequest: SearchRequest = {
        query: apiRequest.query,
        embedding: embedResult.embedding,
        search_configs: searchConfigs,
        limit: apiRequest.limit || 10,
        rerank: false, // Disabled for performance
      };

      // Execute search via ML service
      const searchResponse = await this.mlClient.search(searchRequest);

      // Transform response for API consumers
      const apiResponse: SearchApiResponse = {
        results: searchResponse.results,
        query: searchResponse.query,
        total_results: searchResponse.total_results,
      };

      logger.info('Search completed', {
        tenant: tenantSlug,
        query: apiRequest.query,
        resultsCount: searchResponse.results.length,
        processingTime: searchResponse.processing_time_ms,
      });

      return apiResponse;
    } catch (error) {
      logger.error('Search failed', {
        tenant: tenantSlug,
        query: apiRequest.query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (
        error instanceof Error &&
        error.message.includes('Circuit breaker is OPEN')
      ) {
        throw new ApiError(
          503,
          'Service Unavailable',
          'Search service is temporarily unavailable'
        );
      }

      throw new ApiError(
        500,
        'Internal Server Error',
        'Search operation failed'
      );
    }
  }
}
