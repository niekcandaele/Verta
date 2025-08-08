/**
 * Data export service implementation
 */

import { mkdir, writeFile, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import type {
  DataExportService,
  ExportResult,
  ExportProgressCallback,
} from './DataExportService.js';
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

// Get the absolute path to the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..', '..');

// Use /data mount when running in Docker, otherwise use root _data
const EXPORT_BASE_PATH =
  process.env.DOCKERIZED === 'true' || process.env.NODE_ENV === 'production'
    ? '/data/data-export'
    : join(projectRoot, '_data', 'data-export');

export class DataExportServiceImpl implements DataExportService {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly tenantBrandingRepository: TenantBrandingRepository,
    private readonly channelRepository: ChannelRepository,
    private readonly messageRepository: MessageRepository,
    private readonly reactionRepository: MessageEmojiReactionRepository,
    private readonly attachmentRepository: MessageAttachmentRepository
  ) {}

  async exportAllTenants(
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult[]> {
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
      for (let i = 0; i < activeTenants.length; i++) {
        const tenant = activeTenants[i];
        try {
          // Calculate progress for all tenants
          const tenantProgress = (i / activeTenants.length) * 100;
          if (onProgress) {
            await onProgress(tenantProgress);
          }
          const result = await this.exportTenant(
            tenant.id,
            onProgress
              ? async (p) =>
                  await onProgress(
                    Math.floor(((i + p / 100) / activeTenants.length) * 100)
                  )
              : undefined
          );
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

  async exportTenant(
    tenantId: string,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
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
      logger.info(`Creating export directory at: ${exportPath}`);
      await this.ensureDirectory(exportPath);
      logger.info(`Export directory created successfully`);

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

      // Calculate total pages across all channels for progress tracking
      let totalPages = 0;
      let processedPages = 0;

      // First pass: count total pages
      for (const channel of channels) {
        const messageCount = await this.messageRepository.countByChannel(
          channel.id
        );
        totalPages += Math.ceil(messageCount / MESSAGES_PER_PAGE);
      }

      // Report initial progress
      if (onProgress && totalPages > 0) {
        await onProgress(0);
      }

      // Process each channel
      for (const channel of channels) {
        try {
          const channelPath = join(exportPath, 'channels', channel.id);
          await this.ensureDirectory(channelPath);

          // Special handling for forum channels
          if (channel.type === 'forum') {
            await this.exportForumChannel(channel, channelPath, metadata);
            continue;
          }

          // Get message count for this channel
          const messageCount = await this.messageRepository.countByChannel(
            channel.id
          );

          const channelTotalPages = Math.ceil(messageCount / MESSAGES_PER_PAGE);

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
          for (let page = 1; page <= channelTotalPages; page++) {
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
              totalPages: channelTotalPages,
              messages: archiveMessages,
            };

            // Write page file
            const pageFilePath = join(channelPath, `page-${page}.json`);
            await this.writeJsonFile(pageFilePath, pageData);
            totalFilesGenerated++;
            totalMessagesExported += messages.length;

            logger.debug(
              `Exported page ${page}/${channelTotalPages} for channel ${channel.name}`
            );

            // Update progress
            processedPages++;
            if (onProgress && totalPages > 0) {
              const progress = Math.round((processedPages / totalPages) * 100);
              await onProgress(progress);
            }
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

  /**
   * Export forum channel with thread summaries
   */
  private async exportForumChannel(
    forumChannel: any,
    channelPath: string,
    metadata: ArchiveMetadata
  ): Promise<void> {
    const THREADS_PER_PAGE = 30;

    // Add forum channel to metadata
    metadata.channels.push({
      id: forumChannel.id,
      tenantId: forumChannel.tenantId,
      platformChannelId: forumChannel.platformChannelId,
      name: forumChannel.name,
      type: forumChannel.type,
      parentChannelId: forumChannel.parentChannelId,
      metadata: forumChannel.metadata,
      createdAt: forumChannel.createdAt,
      updatedAt: forumChannel.updatedAt,
    });

    // Get all threads for this forum
    const threads = await this.channelRepository.findByParentId(
      forumChannel.platformChannelId
    );

    if (threads.length === 0) {
      // Write empty threads page
      const emptyPage = {
        forumId: forumChannel.id,
        forumName: forumChannel.name,
        page: 1,
        totalPages: 1,
        totalThreads: 0,
        threadsPerPage: THREADS_PER_PAGE,
        threads: [],
      };
      await this.writeJsonFile(
        join(channelPath, 'threads-page-1.json'),
        emptyPage
      );
      return;
    }

    // Get thread summaries with first message
    const threadSummaries = await Promise.all(
      threads.map(async (thread) => {
        const messageCount = await this.messageRepository.countByChannel(
          thread.id
        );

        // Get first message (oldest)
        const { data: allMessages } =
          await this.messageRepository.findByChannel(thread.id, {
            limit: 1000,
            offset: 0,
          });

        // Sort messages to get first and last
        const sortedMessages = allMessages.sort(
          (a, b) =>
            new Date(a.platformCreatedAt).getTime() -
            new Date(b.platformCreatedAt).getTime()
        );

        const firstMessage = sortedMessages[0];
        const lastMessage = sortedMessages[sortedMessages.length - 1];

        const lastActivity = lastMessage?.platformCreatedAt || thread.createdAt;

        return {
          id: thread.id,
          name: thread.name,
          messageCount,
          createdAt: thread.createdAt,
          archived: thread.metadata?.archived || false,
          locked: thread.metadata?.locked || false,
          firstMessage: firstMessage
            ? {
                id: firstMessage.id,
                content: firstMessage.content.substring(0, 200),
                authorId: firstMessage.anonymizedAuthorId,
                createdAt: firstMessage.platformCreatedAt,
              }
            : null,
          lastActivity,
        };
      })
    );

    // Sort by last activity (newest first)
    threadSummaries.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    // Paginate and write thread summary pages
    const threadPages = Math.ceil(threadSummaries.length / THREADS_PER_PAGE);
    for (let page = 1; page <= threadPages; page++) {
      const start = (page - 1) * THREADS_PER_PAGE;
      const pageThreads = threadSummaries.slice(
        start,
        start + THREADS_PER_PAGE
      );

      const pageData = {
        forumId: forumChannel.id,
        forumName: forumChannel.name,
        page,
        totalPages: threadPages,
        totalThreads: threads.length,
        threadsPerPage: THREADS_PER_PAGE,
        threads: pageThreads,
      };

      await this.writeJsonFile(
        join(channelPath, `threads-page-${page}.json`),
        pageData
      );
    }

    logger.debug(
      `Exported ${threads.length} thread summaries for forum ${forumChannel.name}`
    );
  }

  private async ensureDirectory(path: string): Promise<void> {
    try {
      logger.debug(`Attempting to create directory: ${path}`);

      // Check if directory already exists
      if (existsSync(path)) {
        logger.debug(`Directory already exists: ${path}`);
        return;
      }

      // Method 1: Try shell command with timeout
      try {
        logger.debug(
          `Creating directory using shell command: mkdir -p "${path}"`
        );
        const { stderr } = await execAsync(
          `mkdir -p "${path}" && chmod 777 "${path}"`,
          {
            timeout: 3000, // 3 second timeout
          }
        );
        if (stderr) {
          logger.warn(`Shell mkdir stderr: ${stderr}`);
        }
        logger.debug(
          `Directory created successfully using shell command: ${path}`
        );
        return;
      } catch (shellError) {
        logger.warn(`Shell command failed: ${shellError}`);
      }

      // Method 2: Try creating parent directories first
      try {
        const parentDir = dirname(path);
        if (!existsSync(parentDir)) {
          logger.debug(`Creating parent directory first: ${parentDir}`);
          await execAsync(`mkdir -p "${parentDir}"`, { timeout: 2000 });
        }

        // Now create the target directory
        logger.debug(`Creating target directory: ${path}`);
        await execAsync(`mkdir "${path}" && chmod 777 "${path}"`, {
          timeout: 2000,
        });
        logger.debug(`Directory created successfully: ${path}`);
        return;
      } catch (parentError) {
        logger.warn(`Parent directory approach failed: ${parentError}`);
      }

      // Method 3: Last resort - try Node.js fs methods
      logger.debug(`Falling back to Node.js fs.mkdir`);
      await mkdir(path, { recursive: true, mode: 0o777 });
      logger.debug(`Directory created successfully using fs.mkdir: ${path}`);
    } catch (error) {
      // Check if error is because directory already exists
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'EEXIST'
      ) {
        logger.debug(`Directory already exists: ${path}`);
        return;
      }

      logger.error(`Failed to create directory ${path}`, error);
      // Log more details about the error
      if (error instanceof Error) {
        logger.error(`Error details: ${error.message}`);
        logger.error(`Error stack: ${error.stack}`);
      }

      // Try to diagnose the issue
      try {
        const { stdout: lsOutput } = await execAsync(`ls -la /data 2>&1`, {
          timeout: 1000,
        });
        logger.error(`/data directory listing: ${lsOutput}`);

        const { stdout: dfOutput } = await execAsync(`df -h /data 2>&1`, {
          timeout: 1000,
        });
        logger.error(`/data filesystem info: ${dfOutput}`);
      } catch (diagError) {
        logger.error(`Failed to diagnose: ${diagError}`);
      }

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
