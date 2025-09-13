import { Router, Request, Response } from 'express';
import { db } from '../../../database/index.js';
import { BotConfigRepository } from '../../../repositories/BotConfigRepository.js';
import { ChannelRepositoryImpl } from '../../../repositories/sync/ChannelRepository.js';
import logger from '../../../utils/logger.js';

const router = Router();
const botConfigRepo = new BotConfigRepository(db);
const channelRepo = new ChannelRepositoryImpl(db);

/**
 * Admin authentication middleware
 * Reuses pattern from other admin endpoints
 */
const requireAdminKey = (
  req: Request,
  res: Response,
  next: () => void
): void | Response => {
  const apiKey = req.headers['x-api-key'];
  const adminKey = process.env.ADMIN_API_KEY || 'ikbeneenaap';

  if (apiKey !== adminKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing X-API-KEY header',
      timestamp: new Date().toISOString(),
    });
  }

  next();
};

/**
 * Validate UUID format
 */
const isValidUUID = (uuid: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * GET /api/admin/bot-config
 * Get bot configuration and available channels for a tenant
 */
router.get(
  '/',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { tenant_id } = req.query;

      // Validate tenant_id
      if (!tenant_id || typeof tenant_id !== 'string') {
        return res.status(400).json({
          error: 'Missing tenant_id',
          message: 'tenant_id query parameter is required',
          timestamp: new Date().toISOString(),
        });
      }

      if (!isValidUUID(tenant_id)) {
        return res.status(400).json({
          error: 'Invalid tenant_id format',
          message: 'tenant_id must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Fetch bot config and available channels in parallel
      const [botConfig, allChannels] = await Promise.all([
        botConfigRepo.findByTenantId(tenant_id),
        channelRepo.findByTenantId(tenant_id),
      ]);

      // Debug logging
      logger.info('All channels for tenant', {
        tenant_id,
        total_channels: allChannels.length,
        channel_types: allChannels.map(ch => ({ id: ch.platformChannelId, name: ch.name, type: ch.type }))
      });

      // Filter channels to only include text and forum channels (exclude threads and categories)
      const availableChannels = allChannels.filter(
        (channel) => channel.type === 'text' || channel.type === 'forum'
      );

      logger.info('Filtered channels', {
        available_count: availableChannels.length,
        available_channels: availableChannels.map(ch => ({ id: ch.platformChannelId, name: ch.name, type: ch.type }))
      });

      // Format response
      return res.json({
        config: botConfig
          ? {
              id: botConfig.id,
              tenant_id: botConfig.tenant_id,
              monitored_channels: botConfig.monitored_channels,
              created_at: botConfig.created_at,
              updated_at: botConfig.updated_at,
            }
          : null,
        available_channels: availableChannels.map((channel) => ({
          id: channel.platformChannelId,
          name: channel.name,
          type: channel.type,
        })),
      });
    } catch (error) {
      logger.error('Error fetching bot config', { error, tenant_id: req.query.tenant_id });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to fetch bot configuration',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * PUT /api/admin/bot-config
 * Update bot configuration for a tenant
 */
router.put(
  '/',
  requireAdminKey,
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { tenant_id, monitored_channels } = req.body;

      // Validate tenant_id
      if (!tenant_id || typeof tenant_id !== 'string') {
        return res.status(400).json({
          error: 'Missing tenant_id',
          message: 'tenant_id is required in request body',
          timestamp: new Date().toISOString(),
        });
      }

      if (!isValidUUID(tenant_id)) {
        return res.status(400).json({
          error: 'Invalid tenant_id format',
          message: 'tenant_id must be a valid UUID',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate monitored_channels
      if (!Array.isArray(monitored_channels)) {
        return res.status(400).json({
          error: 'Invalid monitored_channels',
          message: 'monitored_channels must be an array',
          timestamp: new Date().toISOString(),
        });
      }

      // Validate that all channel IDs are strings
      if (!monitored_channels.every((channelId) => typeof channelId === 'string')) {
        return res.status(400).json({
          error: 'Invalid channel ID format',
          message: 'All channel IDs must be strings',
          timestamp: new Date().toISOString(),
        });
      }

      // Optional: Validate that the channels exist for this tenant
      if (monitored_channels.length > 0) {
        const tenantChannels = await channelRepo.findByTenantId(tenant_id);
        const tenantChannelIds = new Set(
          tenantChannels.map((ch) => ch.platformChannelId)
        );

        const invalidChannels = monitored_channels.filter(
          (channelId) => !tenantChannelIds.has(channelId)
        );

        if (invalidChannels.length > 0) {
          return res.status(400).json({
            error: 'Invalid channel IDs',
            message: `The following channel IDs do not exist for this tenant: ${invalidChannels.join(', ')}`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Upsert the bot config
      const updatedConfig = await botConfigRepo.upsert({
        tenant_id,
        monitored_channels,
      });

      logger.info('Bot config updated successfully', {
        tenant_id,
        monitored_channels_count: monitored_channels.length,
        config_id: updatedConfig.id,
      });

      return res.json({
        message: 'Bot configuration updated successfully',
        config: {
          id: updatedConfig.id,
          tenant_id: updatedConfig.tenant_id,
          monitored_channels: updatedConfig.monitored_channels,
          created_at: updatedConfig.created_at,
          updated_at: updatedConfig.updated_at,
        },
      });
    } catch (error) {
      logger.error('Error updating bot config', {
        error,
        tenant_id: req.body.tenant_id,
        body: req.body,
      });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update bot configuration',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;