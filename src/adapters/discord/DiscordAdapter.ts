/**
 * Discord platform adapter implementation
 */

import {
  Client,
  GatewayIntentBits,
  TextChannel,
  ThreadChannel,
  type GuildBasedChannel,
  type Message,
  ChannelType,
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

      return channels
        .filter((channel) => channel !== null)
        .map((channel) => this.mapDiscordChannelToPlatform(channel!))
        .filter((channel): channel is PlatformChannel => channel !== null);
    } catch (error) {
      logger.error('Failed to fetch Discord channels', {
        platformId,
        error,
      });
      throw new Error('Failed to fetch Discord channels');
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

      if (!this.isTextBasedChannel(channel)) {
        return {
          messages: [],
          hasMore: false,
        };
      }

      const fetchOptions: { limit: number; after?: string; before?: string } = {
        limit: Math.min(options?.limit || 100, 100), // Discord API limit
      };

      if (options?.afterMessageId) {
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

      // Convert to platform messages
      const platformMessages = await Promise.all(
        messages.map((msg) => this.mapDiscordMessageToPlatform(msg))
      );

      // Sort by creation date (oldest first)
      platformMessages.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );

      return {
        messages: platformMessages,
        hasMore: messages.size === fetchOptions.limit,
        checkpoint:
          messages.size > 0
            ? {
                channelId,
                lastMessageId: messages.last()!.id,
                lastMessageTimestamp: messages.last()!.createdAt,
                messagesProcessed: messages.size,
                hasMoreMessages: messages.size === fetchOptions.limit,
              }
            : undefined,
      };
    } catch (error) {
      logger.error('Failed to fetch Discord messages', {
        channelId,
        error,
      });
      throw new Error('Failed to fetch Discord messages');
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
