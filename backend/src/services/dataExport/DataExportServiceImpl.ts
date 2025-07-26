/**
 * Data export service implementation
 */

import { mkdir, writeFile, chmod } from 'fs/promises';
import { join } from 'path';
import type { DataExportService, ExportResult } from './DataExportService.js';
import type {
  TenantRepository,
  TenantBrandingRepository,
} from '../../repositories/tenant/index.js';
import type {
  ChannelRepository,
  MessageRepository,
  MessageEmojiReactionRepository,
  MessageAttachmentRepository,
} from '../../repositories/sync/index.js';
import type {
  ArchiveMetadata,
  ArchiveChannelPage,
  ArchiveMessage,
} from 'shared-types';
import logger from '../../utils/logger.js';

const MESSAGES_PER_PAGE = 1000;
const EXPORT_BASE_PATH = '_data/data-export';

export class DataExportServiceImpl implements DataExportService {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly tenantBrandingRepository: TenantBrandingRepository,
    private readonly channelRepository: ChannelRepository,
    private readonly messageRepository: MessageRepository,
    private readonly reactionRepository: MessageEmojiReactionRepository,
    private readonly attachmentRepository: MessageAttachmentRepository
  ) {}

  async exportAllTenants(): Promise<ExportResult[]> {
    const startTime = Date.now();
    const results: ExportResult[] = [];

    try {
      // Get all active tenants
      const { data: tenants } = await this.tenantRepository.findAll({
        limit: 1000,
      });

      const activeTenants = tenants.filter((t) => t.status === 'ACTIVE');

      logger.info(`Exporting data for ${activeTenants.length} active tenants`);

      // Export each tenant
      for (const tenant of activeTenants) {
        try {
          const result = await this.exportTenant(tenant.id);
          results.push(result);
        } catch (error) {
          logger.error(`Failed to export tenant ${tenant.id}`, error);
          results.push({
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            channelsExported: 0,
            messagesExported: 0,
            filesGenerated: 0,
            exportPath: '',
            executionTimeMs: Date.now() - startTime,
            errors: [error instanceof Error ? error.message : String(error)],
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to export all tenants', error);
      throw error;
    }
  }

  async exportTenant(tenantId: string): Promise<ExportResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Get tenant data
      const tenant = await this.tenantRepository.findById(tenantId);
      if (!tenant) {
        throw new Error(`Tenant ${tenantId} not found`);
      }

      logger.info(`Starting export for tenant ${tenant.slug}`);

      // Create export directory
      const exportPath = join(EXPORT_BASE_PATH, tenant.slug);
      await this.ensureDirectory(exportPath);

      // Get tenant branding
      const branding =
        await this.tenantBrandingRepository.findByTenantId(tenantId);

      // Get all channels
      const channels = await this.channelRepository.findByTenantId(tenantId);

      // Create metadata file
      const metadata: ArchiveMetadata = {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          platform: tenant.platform,
          platformId: tenant.platformId,
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt,
        },
        channels: [],
      };

      let totalMessagesExported = 0;
      let totalFilesGenerated = 1; // metadata.json

      // Process each channel
      for (const channel of channels) {
        try {
          const channelPath = join(exportPath, 'channels', channel.id);
          await this.ensureDirectory(channelPath);

          // Get message count for this channel
          const messageCount = await this.messageRepository.countByChannel(
            channel.id
          );

          const totalPages = Math.ceil(messageCount / MESSAGES_PER_PAGE);

          // Add channel to metadata
          metadata.channels.push({
            id: channel.id,
            tenantId: channel.tenantId,
            platformChannelId: channel.platformChannelId,
            name: channel.name,
            type: channel.type,
            parentChannelId: channel.parentChannelId,
            metadata: channel.metadata,
            createdAt: channel.createdAt,
            updatedAt: channel.updatedAt,
          });

          // Export messages in pages
          for (let page = 1; page <= totalPages; page++) {
            const offset = (page - 1) * MESSAGES_PER_PAGE;
            const { data: messages } =
              await this.messageRepository.findByChannel(channel.id, {
                limit: MESSAGES_PER_PAGE,
                offset,
              });

            // Get reactions and attachments for each message
            const archiveMessages: ArchiveMessage[] = await Promise.all(
              messages.map(async (message) => {
                const [reactions, attachments] = await Promise.all([
                  this.reactionRepository.findByMessage(message.id),
                  this.attachmentRepository.findByMessage(message.id),
                ]);

                return {
                  id: message.id,
                  channelId: message.channelId,
                  platformMessageId: message.platformMessageId,
                  anonymizedAuthorId: message.anonymizedAuthorId,
                  content: message.content,
                  replyToId: message.replyToId,
                  metadata: message.metadata,
                  platformCreatedAt: message.platformCreatedAt,
                  createdAt: message.createdAt,
                  updatedAt: message.updatedAt,
                  reactions,
                  attachments: attachments.map((a) => ({
                    ...a,
                    fileSize: Number(a.fileSize), // Convert bigint to number for JSON
                  })),
                };
              })
            );

            // Create page data
            const pageData: ArchiveChannelPage = {
              channelId: channel.id,
              channelName: channel.name,
              channelType: channel.type,
              page,
              totalPages,
              messages: archiveMessages,
            };

            // Write page file
            const pageFilePath = join(channelPath, `page-${page}.json`);
            await this.writeJsonFile(pageFilePath, pageData);
            totalFilesGenerated++;
            totalMessagesExported += messages.length;

            logger.debug(
              `Exported page ${page}/${totalPages} for channel ${channel.name}`
            );
          }
        } catch (error) {
          const errorMsg = `Failed to export channel ${channel.id}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Write metadata file with branding
      const metadataWithBranding = {
        ...metadata,
        branding: branding
          ? {
              logo: branding.logo,
              primaryColor: branding.primaryColor,
              secondaryColor: branding.secondaryColor,
              accentColor: branding.accentColor,
            }
          : null,
        generatedAt: new Date().toISOString(),
        dataVersion: '1.0.0',
      };

      const metadataPath = join(exportPath, 'metadata.json');
      await this.writeJsonFile(metadataPath, metadataWithBranding);

      const executionTimeMs = Date.now() - startTime;
      logger.info(
        `Export completed for tenant ${tenant.slug} in ${executionTimeMs}ms`
      );

      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        channelsExported: channels.length,
        messagesExported: totalMessagesExported,
        filesGenerated: totalFilesGenerated,
        exportPath,
        executionTimeMs,
        errors,
      };
    } catch (error) {
      logger.error(`Failed to export tenant ${tenantId}`, error);
      throw error;
    }
  }

  private async ensureDirectory(path: string): Promise<void> {
    try {
      await mkdir(path, { recursive: true });
      // Set open permissions for container compatibility
      await chmod(path, 0o777);
    } catch (error) {
      logger.error(`Failed to create directory ${path}`, error);
      throw error;
    }
  }

  private async writeJsonFile(path: string, data: unknown): Promise<void> {
    try {
      const jsonContent = JSON.stringify(data, null, 2);
      await writeFile(path, jsonContent, 'utf-8');
      // Set open permissions for container compatibility
      await chmod(path, 0o777);
    } catch (error) {
      logger.error(`Failed to write file ${path}`, error);
      throw error;
    }
  }
}
