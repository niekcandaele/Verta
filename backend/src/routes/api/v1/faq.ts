import { Router, Request, Response } from 'express';
import { db } from '../../../database/index.js';
import logger from '../../../utils/logger.js';
import { Redis } from 'ioredis';
import { redisConfig } from '../../../config/redis.js';

const router = Router();

/**
 * GET /api/v1/faq
 * Public endpoint to get FAQ items (clusters with golden answers)
 * Ordered by popularity (instance_count)
 */
router.get('/', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { tenant_id, limit = '50' } = req.query;

    // Parse limit
    const limitNum = Math.min(
      100,
      Math.max(1, parseInt(limit as string, 10) || 50)
    );

    // Build query for clusters with golden answers
    let query = db
      .selectFrom('question_clusters')
      .innerJoin(
        'golden_answers',
        'question_clusters.id',
        'golden_answers.cluster_id'
      )
      .select([
        'question_clusters.id',
        'question_clusters.tenant_id',
        'question_clusters.representative_text as question',
        'question_clusters.thread_title',
        'question_clusters.instance_count',
        'question_clusters.first_seen_at',
        'question_clusters.last_seen_at',
        'golden_answers.answer',
        'golden_answers.answer_format',
        'golden_answers.created_by',
        'golden_answers.created_at as answer_created_at',
        'golden_answers.updated_at as answer_updated_at',
      ])
      .orderBy('question_clusters.instance_count', 'desc')
      .limit(limitNum);

    // Add tenant filter if provided
    if (tenant_id) {
      query = query.where(
        'question_clusters.tenant_id',
        '=',
        tenant_id as string
      );
    }

    const faqs = await query.execute();

    // Format response
    const formattedFaqs = faqs.map((faq) => ({
      id: faq.id,
      question: faq.question,
      thread_title: faq.thread_title,
      answer: faq.answer,
      answer_format: faq.answer_format,
      popularity: faq.instance_count,
      first_seen: faq.first_seen_at,
      last_seen: faq.last_seen_at,
      answered_by: faq.created_by,
      answered_at: faq.answer_created_at,
    }));

    return res.json({
      data: formattedFaqs,
      total: formattedFaqs.length,
    });
  } catch (error) {
    logger.error('Error fetching FAQ', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch FAQ',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/v1/faq/cached
 * Cached version of FAQ endpoint with Redis
 */
router.get(
  '/cached',
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { tenant_id, limit = '50' } = req.query;
      const limitNum = Math.min(
        100,
        Math.max(1, parseInt(limit as string, 10) || 50)
      );

      // Create cache key
      const cacheKey = `faq:${tenant_id || 'all'}:${limitNum}`;

      // Try to get from cache
      const redis = new Redis(redisConfig);
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.debug('FAQ cache hit', { cacheKey });
        redis.disconnect();
        return res.json(JSON.parse(cached));
      }

      logger.debug('FAQ cache miss', { cacheKey });

      // Build and execute query
      let query = db
        .selectFrom('question_clusters')
        .innerJoin(
          'golden_answers',
          'question_clusters.id',
          'golden_answers.cluster_id'
        )
        .select([
          'question_clusters.id',
          'question_clusters.tenant_id',
          'question_clusters.representative_text as question',
          'question_clusters.thread_title',
          'question_clusters.instance_count',
          'question_clusters.first_seen_at',
          'question_clusters.last_seen_at',
          'golden_answers.answer',
          'golden_answers.answer_format',
          'golden_answers.created_by',
          'golden_answers.created_at as answer_created_at',
          'golden_answers.updated_at as answer_updated_at',
        ])
        .orderBy('question_clusters.instance_count', 'desc')
        .limit(limitNum);

      if (tenant_id) {
        query = query.where(
          'question_clusters.tenant_id',
          '=',
          tenant_id as string
        );
      }

      const faqs = await query.execute();

      // Format response
      const formattedFaqs = faqs.map((faq) => ({
        id: faq.id,
        question: faq.question,
        thread_title: faq.thread_title,
        answer: faq.answer,
        answer_format: faq.answer_format,
        popularity: faq.instance_count,
        first_seen: faq.first_seen_at,
        last_seen: faq.last_seen_at,
        answered_by: faq.created_by,
        answered_at: faq.answer_created_at,
      }));

      const response = {
        data: formattedFaqs,
        total: formattedFaqs.length,
        cached_at: new Date().toISOString(),
      };

      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(response));

      // Close Redis connection
      redis.disconnect();

      return res.json(response);
    } catch (error) {
      logger.error('Error fetching cached FAQ', { error });

      // Fall back to non-cached version
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch cached FAQ',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
