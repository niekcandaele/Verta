/**
 * Data fetching functions for the frontend
 * Now uses API calls instead of filesystem operations
 */

import type { Tenant, TenantBranding, Channel, Message, MessageAttachment, MessageEmojiReaction } from 'shared-types';
import api from './api-client';

// Extended message type that includes attachments and reactions
export interface MessageWithExtras extends Message {
  attachments: MessageAttachment[];
  reactions: MessageEmojiReaction[];
}

// Get the tenant slug from environment variable
export function getTenantSlug(): string {
  const slug = process.env.NEXT_PUBLIC_TENANT_SLUG;
  if (!slug) {
    // During build time, return a placeholder
    // The actual value will be checked when API calls are made
    console.warn('NEXT_PUBLIC_TENANT_SLUG not set, using placeholder');
    return 'takaro';
  }
  return slug;
}

// Metadata interface for combined tenant data
export interface TenantMetadata {
  tenant: Tenant;
  channels: Channel[];
  branding: TenantBranding | null;
  generatedAt: string;
  dataVersion: string;
}

// Page data interface for message pages
export interface MessagePageData {
  channelId: string;
  channelName: string;
  channelType: string;
  page: number;
  totalPages: number;
  messages: MessageWithExtras[];
}

// Extended channel type for forum threads
export interface ForumThread extends Channel {
  archived?: boolean;
  locked?: boolean;
  lastActivity?: string;
  firstMessage?: {
    content: string;
  };
  messageCount?: number;
}

// Forum threads page interface
export interface ForumThreadsPage {
  channelId: string;
  channelName: string;
  forumId: string;
  forumName: string;
  page: number;
  totalPages: number;
  totalThreads: number;
  threads: ForumThread[];
}

// Load tenant metadata (combines tenant, channels, and branding)
export async function getTenantMetadata(): Promise<TenantMetadata> {
  try {
    // Fetch tenant, channels, and branding in parallel
    const [tenantResponse, channelsResponse, brandingResponse] = await Promise.all([
      api.getTenant(),
      api.getChannels(),
      api.getBranding()
    ]);

    return {
      tenant: tenantResponse.data.data,
      channels: channelsResponse.data.data,
      branding: brandingResponse.data.data,
      generatedAt: new Date().toISOString(),
      dataVersion: '2.0.0' // API version
    };
  } catch (error) {
    console.error('Failed to load tenant metadata:', error);
    throw new Error('Failed to load tenant metadata from API');
  }
}

// Get all channels for the tenant
export async function getChannels(): Promise<Channel[]> {
  try {
    const response = await api.getChannels();
    return response.data.data;
  } catch (error) {
    console.error('Failed to load channels:', error);
    return [];
  }
}

// Get a specific channel by ID
export async function getChannel(channelId: string): Promise<Channel | undefined> {
  try {
    const response = await api.getChannel(channelId);
    return response.data.data;
  } catch (error) {
    console.error(`Failed to load channel ${channelId}:`, error);
    return undefined;
  }
}

// Get a specific channel by slug
export async function getChannelBySlug(slug: string): Promise<Channel | undefined> {
  try {
    const response = await api.getChannelBySlug(slug);
    return response.data.data;
  } catch (error) {
    console.error(`Failed to load channel by slug ${slug}:`, error);
    return undefined;
  }
}

// Get messages for a specific channel and page
export async function getChannelMessages(channelId: string, page: number): Promise<MessagePageData | null> {
  try {
    const [channelResponse, messagesResponse] = await Promise.all([
      api.getChannel(channelId),
      api.getChannelMessages(channelId, page, 50)
    ]);

    const channel = channelResponse.data.data;
    const messages = messagesResponse.data.data;
    const meta = messagesResponse.data.meta;

    // Transform messages - API now includes attachments and reactions
    const messagesWithExtras: MessageWithExtras[] = messages.map((msg: any) => ({
      ...msg,
      attachments: msg.attachments || [],
      reactions: msg.reactions || []
    }));

    return {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      page: meta.page || page,
      totalPages: meta.totalPages || 1,
      messages: messagesWithExtras
    };
  } catch (error) {
    console.error(`Failed to load messages for channel ${channelId}, page ${page}:`, error);
    return null;
  }
}

// Get messages for a channel by slug
export async function getChannelMessagesBySlug(slug: string, page: number): Promise<MessagePageData | null> {
  try {
    const [channelResponse, messagesResponse] = await Promise.all([
      api.getChannelBySlug(slug),
      api.getChannelMessagesBySlug(slug, page, 50)
    ]);

    const channel = channelResponse.data.data;
    const messages = messagesResponse.data.data;
    const meta = messagesResponse.data.meta;

    const messagesWithExtras: MessageWithExtras[] = messages.map((msg: any) => ({
      ...msg,
      attachments: msg.attachments || [],
      reactions: msg.reactions || []
    }));

    return {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      page: meta.page || page,
      totalPages: meta.totalPages || 1,
      messages: messagesWithExtras
    };
  } catch (error) {
    console.error(`Failed to load messages for channel slug ${slug}, page ${page}:`, error);
    return null;
  }
}

// Message context interface
export interface MessageContext {
  message: MessageWithExtras;
  before: MessageWithExtras[];
  after: MessageWithExtras[];
  channel: Channel;
}

// Get message with context
export async function getMessageWithContext(messageId: string, before: number = 50, after: number = 50): Promise<MessageContext | null> {
  try {
    const response = await api.getMessageContext(messageId, before, after);
    const data = response.data.data;
    
    // Transform backend response format
    // Backend returns: { messages, target: { id, position }, navigation }
    // We need: { message, before, after, channel }
    
    if (!data.messages || !data.target) {
      throw new Error('Invalid message context response format');
    }
    
    const targetPosition = data.target.position;
    const targetMessage = data.messages[targetPosition];
    
    if (!targetMessage) {
      throw new Error('Target message not found in response');
    }
    
    // Transform all messages to ensure they have required properties
    const transformMessage = (msg: any): MessageWithExtras => ({
      ...msg,
      attachments: msg.attachments || [],
      reactions: msg.reactions || []
    });
    
    const transformedMessages = data.messages.map(transformMessage);
    
    // Split messages into before and after arrays
    const beforeMessages = transformedMessages.slice(0, targetPosition);
    const afterMessages = transformedMessages.slice(targetPosition + 1);
    const targetMsg = transformedMessages[targetPosition];
    
    // Get the channel information
    const channel = await getChannel(targetMsg.channelId);
    if (!channel) {
      throw new Error('Channel not found for message');
    }
    
    return {
      message: targetMsg,
      before: beforeMessages,
      after: afterMessages,
      channel: channel
    };
  } catch (error) {
    console.error(`Failed to load message context for ${messageId}:`, error);
    return null;
  }
}

// Get all page numbers for a channel
export async function getChannelPageNumbers(channelId: string): Promise<number[]> {
  try {
    const channel = await getChannel(channelId);
    
    if (channel && channel.type === 'forum') {
      // For forum channels, get thread pages
      const response = await api.getChannelThreads(channelId, 1, 1);
      const totalPages = response.data.meta.totalPages || 0;
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
      // For regular channels, get message pages
      const response = await api.getChannelMessages(channelId, 1, 1);
      const totalPages = response.data.meta.totalPages || 0;
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
  } catch (error) {
    console.error(`Failed to get page numbers for channel ${channelId}:`, error);
    return [];
  }
}

// Get tenant branding
export async function getTenantBranding(): Promise<TenantBranding | null> {
  try {
    const response = await api.getBranding();
    return response.data.data;
  } catch (error) {
    console.error('Failed to load tenant branding:', error);
    return null;
  }
}

// Get forum threads page
export async function getForumThreadsPage(forumChannelId: string, page: number): Promise<ForumThreadsPage | null> {
  try {
    const [channelResponse, threadsResponse] = await Promise.all([
      api.getChannel(forumChannelId),
      api.getChannelThreads(forumChannelId, page, 20)
    ]);

    const channel = channelResponse.data.data;
    const threads = threadsResponse.data.data;
    const meta = threadsResponse.data.meta;

    return {
      channelId: channel.id,
      channelName: channel.name,
      forumId: channel.id,
      forumName: channel.name,
      page: meta.page || page,
      totalPages: meta.totalPages || 1,
      totalThreads: meta.total || threads.length,
      threads: threads
    };
  } catch (error) {
    console.error(`Failed to load threads for forum ${forumChannelId}, page ${page}:`, error);
    return null;
  }
}

// Get all threads for a forum channel
export async function getForumThreads(forumChannelId: string): Promise<Channel[]> {
  try {
    const allThreads: Channel[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await api.getChannelThreads(forumChannelId, page, 100);
      const threads = response.data.data;
      const meta = response.data.meta;
      
      allThreads.push(...threads);
      
      if (page >= (meta.totalPages || 1)) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return allThreads;
  } catch (error) {
    console.error(`Failed to load all threads for forum ${forumChannelId}:`, error);
    return [];
  }
}

// Get messages for a thread
export async function getThreadMessages(threadId: string): Promise<MessageWithExtras[]> {
  try {
    // Need to get the channel ID first - for now, use a workaround
    // In a real implementation, you might want to pass channelId as a parameter
    const channels = await getChannels();
    const forumChannel = channels.find(c => c.type === 'forum');
    
    if (!forumChannel) {
      console.error('No forum channel found');
      return [];
    }

    const response = await api.getThreadMessages(forumChannel.id, threadId, 1, 100);
    const messages = response.data.data;

    // Transform messages - API now includes attachments and reactions
    return messages.map((msg: any) => ({
      ...msg,
      attachments: msg.attachments || [],
      reactions: msg.reactions || []
    }));
  } catch (error) {
    console.error(`Failed to load messages for thread ${threadId}:`, error);
    return [];
  }
}