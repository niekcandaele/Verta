/**
 * Discord platform adapter implementation
 */

import {
  Client,
  GatewayIntentBits,
  TextChannel,
  ThreadChannel,
  ForumChannel,
  type GuildBasedChannel,
  type Message,
  ChannelType,
  PermissionsBitField,
} from 'discord.js';
import logger from '../../utils/logger.js';
import type {
  PlatformAdapter,
  FetchMessagesOptions,
  FetchMessagesResult,
  PlatformAdapterConfig,
} from '../types.js';
import type { PlatformChannel, PlatformMessage } from '../../types/sync.js';
import { config } from '../../config/env.js';
import { SyncErrorClassification, classifyError } from '../../types/errors.js';

/**
 * Discord adapter implementation for syncing Discord data
 */
export class DiscordAdapter implements PlatformAdapter {
  private client: Client;
  private initialized = false;

  constructor(_config?: PlatformAdapterConfig) {
    // Config can be used for future enhancements

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.client.login(config.DISCORD_BOT_TOKEN);
      this.initialized = true;
      logger.info('Discord adapter initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Discord adapter', { error });
      throw new Error('Failed to initialize Discord adapter');
    }
  }

  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      this.client.destroy();
      this.initialized = false;
      logger.info('Discord adapter cleaned up successfully');
    } catch (error) {
      logger.error('Failed to cleanup Discord adapter', { error });
      throw new Error('Failed to cleanup Discord adapter');
    }
  }

  async verifyConnection(platformId: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Discord adapter not initialized');
    }

    try {
      const guild = await this.client.guilds.fetch(platformId);
      return guild !== null;
    } catch (error) {
      // Check if it's a rate limit error
      const classifiedError = classifyError(error);
      if (
        classifiedError.classification === SyncErrorClassification.RATE_LIMIT
      ) {
        logger.error('Rate limit hit while verifying Discord connection', {
          platformId,
          error,
        });
        throw classifiedError;
      }

      logger.warn('Failed to verify Discord connection', {
        platformId,
        error,
      });
      return false;
    }
  }

  async fetchChannels(platformId: string): Promise<PlatformChannel[]> {
    if (!this.initialized) {
      throw new Error('Discord adapter not initialized');
    }

    try {
      const guild = await this.client.guilds.fetch(platformId);
      const channels = await guild.channels.fetch();

      // Get the @everyone role (it has the same ID as the guild)
      const everyoneRole = guild.roles.everyone;

      return channels
        .filter((channel) => {
          if (!channel) return false;

          // Check if @everyone has VIEW_CHANNEL permission
          const permissions = channel.permissionsFor(everyoneRole);
          return (
            permissions?.has(PermissionsBitField.Flags.ViewChannel) ?? false
          );
        })
        .map((channel) => this.mapDiscordChannelToPlatform(channel!))
        .filter((channel): channel is PlatformChannel => channel !== null);
    } catch (error) {
      // Check if it's a rate limit error
      const classifiedError = classifyError(error);
      if (
        classifiedError.classification === SyncErrorClassification.RATE_LIMIT
      ) {
        logger.error('Rate limit hit while fetching Discord channels', {
          platformId,
          error,
        });
        throw classifiedError;
      }

      logger.error('Failed to fetch Discord channels', {
        platformId,
        error,
        errorType: classifiedError.type,
      });
      throw classifiedError;
    }
  }

  async fetchMessages(
    channelId: string,
    options?: FetchMessagesOptions
  ): Promise<FetchMessagesResult> {
    if (!this.initialized) {
      throw new Error('Discord adapter not initialized');
    }

    try {
      const channel = await this.client.channels.fetch(channelId);

      // Handle forum channels separately
      if (channel && channel.type === ChannelType.GuildForum) {
        return this.fetchForumMessages(channel as any, options);
      }

      if (!this.isTextBasedChannel(channel)) {
        return {
          messages: [],
          hasMore: false,
        };
      }

      const fetchOptions: { limit: number; after?: string; before?: string } = {
        limit: Math.min(options?.limit || 100, 100), // Discord API limit
      };

      // For Discord, when doing historical sync (no afterTimestamp),
      // we need to paginate backwards using 'before'
      // The afterMessageId in this case represents the oldest message we've seen
      if (options?.afterMessageId && !options?.afterTimestamp) {
        // Use 'before' to get older messages
        fetchOptions.before = options.afterMessageId;
      } else if (options?.afterMessageId && options?.afterTimestamp) {
        // For incremental sync, use 'after' to get newer messages
        fetchOptions.after = options.afterMessageId;
      }

      // Fetch messages (ForumChannels don't have messages)
      if (!('messages' in channel)) {
        return {
          messages: [],
          hasMore: false,
        };
      }

      const messages = await channel.messages.fetch(fetchOptions);

      logger.debug('Discord fetch result', {
        channelId,
        messageCount: messages.size,
        fetchOptions,
        firstMessageId: messages.first()?.id,
        lastMessageId: messages.last()?.id,
        hasMore: messages.size === fetchOptions.limit,
      });

      // Convert to platform messages
      const platformMessages = await Promise.all(
        messages.map((msg) => this.mapDiscordMessageToPlatform(msg))
      );

      // Sort by creation date (oldest first)
      platformMessages.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );

      // For pagination:
      // - When doing historical sync (no afterTimestamp), always use oldest message as checkpoint
      // - When doing incremental sync (with afterTimestamp), use newest message
      const isIncrementalSync = !!options?.afterTimestamp;
      const checkpointMessageIndex = isIncrementalSync
        ? platformMessages.length - 1
        : 0;

      const result = {
        messages: platformMessages,
        hasMore: messages.size === fetchOptions.limit,
        checkpoint:
          platformMessages.length > 0
            ? {
                channelId,
                lastMessageId: platformMessages[checkpointMessageIndex].id,
                lastMessageTimestamp:
                  platformMessages[checkpointMessageIndex].createdAt,
                messagesProcessed: platformMessages.length,
                hasMoreMessages: messages.size === fetchOptions.limit,
              }
            : undefined,
      };

      logger.debug('Returning fetch result', {
        channelId,
        hasMore: result.hasMore,
        checkpointMessageId: result.checkpoint?.lastMessageId,
        messagesReturned: platformMessages.length,
      });

      return result;
    } catch (error) {
      // Check if it's a rate limit error
      const classifiedError = classifyError(error);
      if (
        classifiedError.classification === SyncErrorClassification.RATE_LIMIT
      ) {
        logger.error('Rate limit hit while fetching Discord messages', {
          channelId,
          error,
        });
        throw classifiedError;
      }

      logger.error('Failed to fetch Discord messages', {
        channelId,
        error,
        errorType: classifiedError.type,
      });
      throw classifiedError;
    }
  }

  async getChannelMetadata(
    channelId: string
  ): Promise<Record<string, unknown>> {
    if (!this.initialized) {
      throw new Error('Discord adapter not initialized');
    }

    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !('guild' in channel)) {
        return {};
      }

      const metadata: Record<string, unknown> = {
        type: channel.type,
        position: 'position' in channel ? channel.position : undefined,
        nsfw: 'nsfw' in channel ? channel.nsfw : undefined,
      };

      if (channel.type === ChannelType.GuildText) {
        metadata.topic = (channel as TextChannel).topic;
        metadata.rateLimitPerUser = (channel as TextChannel).rateLimitPerUser;
      }

      return metadata;
    } catch (error) {
      logger.error('Failed to get Discord channel metadata', {
        channelId,
        error,
      });
      return {};
    }
  }

  async getPlatformMetadata(
    platformId: string
  ): Promise<Record<string, unknown>> {
    if (!this.initialized) {
      throw new Error('Discord adapter not initialized');
    }

    try {
      const guild = await this.client.guilds.fetch(platformId);

      return {
        name: guild.name,
        memberCount: guild.memberCount,
        createdAt: guild.createdAt,
        features: guild.features,
        premiumTier: guild.premiumTier,
        verificationLevel: guild.verificationLevel,
      };
    } catch (error) {
      logger.error('Failed to get Discord platform metadata', {
        platformId,
        error,
      });
      return {};
    }
  }

  /**
   * Map Discord channel to platform channel
   */
  private mapDiscordChannelToPlatform(
    channel: GuildBasedChannel
  ): PlatformChannel | null {
    let type: PlatformChannel['type'];

    switch (channel.type) {
      case ChannelType.GuildText:
      case ChannelType.GuildAnnouncement:
        type = 'text';
        break;
      case ChannelType.PublicThread:
      case ChannelType.PrivateThread:
      case ChannelType.AnnouncementThread:
        type = 'thread';
        break;
      case ChannelType.GuildForum:
        type = 'forum';
        break;
      case ChannelType.GuildVoice:
      case ChannelType.GuildStageVoice:
        type = 'voice';
        break;
      case ChannelType.GuildCategory:
        type = 'category';
        break;
      default:
        return null; // Skip unsupported channel types
    }

    return {
      id: channel.id,
      name: channel.name,
      type,
      parentId: channel.parentId || undefined,
      metadata: {
        discordType: channel.type,
        position: 'position' in channel ? channel.position : undefined,
      },
    };
  }

  /**
   * Map Discord message to platform message
   */
  private async mapDiscordMessageToPlatform(
    message: Message
  ): Promise<PlatformMessage> {
    const reactions = message.reactions.cache.map((reaction) => ({
      emoji: reaction.emoji.toString(),
      users: reaction.users.cache.map((user) => user.id),
    }));

    const attachments = message.attachments.map((attachment) => ({
      filename: attachment.name || 'unknown',
      fileSize: attachment.size || 0,
      contentType: attachment.contentType || 'application/octet-stream',
      url: attachment.url,
    }));

    return {
      id: message.id,
      channelId: message.channelId,
      authorId: message.author.id,
      content: message.content,
      replyToId: message.reference?.messageId,
      createdAt: message.createdAt,
      metadata: {
        editedAt: message.editedAt,
        pinned: message.pinned,
        type: message.type,
        mentions: {
          users: message.mentions.users.map((u) => u.id),
          roles: message.mentions.roles.map((r) => r.id),
          channels: message.mentions.channels.map((c) => c.id),
          everyone: message.mentions.everyone,
        },
      },
      reactions: reactions.length > 0 ? reactions : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  /**
   * Fetch messages from a forum channel by aggregating messages from all threads
   */
  private async fetchForumMessages(
    forumChannel: ForumChannel,
    options?: FetchMessagesOptions
  ): Promise<FetchMessagesResult> {
    try {
      logger.debug('Fetching messages from forum channel', {
        channelId: forumChannel.id,
        channelName: forumChannel.name,
      });

      // Fetch active threads in the forum
      const threads = await forumChannel.threads.fetchActive();
      const allMessages: PlatformMessage[] = [];

      // Also fetch archived threads
      const archivedThreads = await forumChannel.threads.fetchArchived();

      // Combine all threads
      const allThreads = [
        ...threads.threads.values(),
        ...archivedThreads.threads.values(),
      ];

      logger.debug('Found threads in forum', {
        channelId: forumChannel.id,
        activeThreadCount: threads.threads.size,
        archivedThreadCount: archivedThreads.threads.size,
        totalThreadCount: allThreads.length,
      });

      // Fetch messages from each thread
      for (const thread of allThreads) {
        try {
          const fetchOptions: {
            limit: number;
            after?: string;
            before?: string;
          } = {
            limit: Math.min(options?.limit || 100, 100),
          };

          // Apply message ID filters if provided
          if (options?.afterMessageId && !options?.afterTimestamp) {
            fetchOptions.before = options.afterMessageId;
          } else if (options?.afterMessageId && options?.afterTimestamp) {
            fetchOptions.after = options.afterMessageId;
          }

          const messages = await thread.messages.fetch(fetchOptions);

          // Convert Discord messages to platform messages
          const platformMessages = await Promise.all(
            messages.map((msg) => this.mapDiscordMessageToPlatform(msg))
          );

          allMessages.push(...platformMessages);
        } catch (error) {
          logger.error('Failed to fetch messages from thread', {
            threadId: thread.id,
            threadName: thread.name,
            error,
          });
        }
      }

      // Sort messages by timestamp (oldest first for historical sync)
      allMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // Apply pagination limit
      const limit = options?.limit || 100;
      const paginatedMessages = allMessages.slice(0, limit);
      const hasMore = allMessages.length > limit;

      // Calculate checkpoint
      const checkpoint =
        paginatedMessages.length > 0
          ? {
              channelId: forumChannel.id,
              lastMessageId: paginatedMessages[paginatedMessages.length - 1].id,
              lastMessageTimestamp:
                paginatedMessages[paginatedMessages.length - 1].createdAt,
              messagesProcessed: paginatedMessages.length,
              hasMoreMessages: hasMore,
            }
          : undefined;

      return {
        messages: paginatedMessages,
        hasMore,
        checkpoint,
      };
    } catch (error) {
      logger.error('Failed to fetch forum messages', {
        channelId: forumChannel.id,
        error,
      });
      throw error;
    }
  }

  /**
   * Check if channel supports text messages
   */
  private isTextBasedChannel(
    channel: any
  ): channel is TextChannel | ThreadChannel {
    return (
      channel &&
      (channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement ||
        channel.type === ChannelType.PublicThread ||
        channel.type === ChannelType.PrivateThread ||
        channel.type === ChannelType.AnnouncementThread)
    );
  }
}
