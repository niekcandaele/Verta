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
    throw new Error('NEXT_PUBLIC_TENANT_SLUG environment variable is required');
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

// Forum threads page interface
export interface ForumThreadsPage {
  channelId: string;
  channelName: string;
  page: number;
  totalPages: number;
  threads: Channel[];
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
      page: meta.page || page,
      totalPages: meta.totalPages || 1,
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