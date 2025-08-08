import { readFile } from 'fs/promises';
import path from 'path';
import type { Tenant, TenantBranding, Channel, Message, MessageAttachment, MessageEmojiReaction } from 'shared-types';

// Extended message type that includes attachments and reactions
export interface MessageWithExtras extends Message {
  attachments: MessageAttachment[];
  reactions: MessageEmojiReaction[];
}

// Get the tenant slug from environment variable or build parameter
export function getTenantSlug(): string {
  const slug = process.env.TENANT_SLUG;
  if (!slug) {
    throw new Error('TENANT_SLUG environment variable is required');
  }
  return slug;
}

// Get the base path for data export files
export function getDataBasePath(): string {
  const basePath = process.env.DATA_EXPORT_PATH || '../_data/data-export';
  return path.resolve(basePath);
}

// Metadata interface for the exported metadata.json
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

// Load tenant metadata
export async function getTenantMetadata(): Promise<TenantMetadata> {
  const tenantSlug = getTenantSlug();
  const metadataPath = path.join(getDataBasePath(), tenantSlug, 'metadata.json');
  
  try {
    const content = await readFile(metadataPath, 'utf-8');
    return JSON.parse(content) as TenantMetadata;
  } catch (error) {
    console.error(`Failed to load metadata for tenant ${tenantSlug}:`, error);
    throw new Error(`Failed to load tenant metadata from ${metadataPath}`);
  }
}

// Get all channels for the tenant
export async function getChannels(): Promise<Channel[]> {
  const metadata = await getTenantMetadata();
  return metadata.channels;
}

// Get a specific channel by ID
export async function getChannel(channelId: string): Promise<Channel | undefined> {
  const channels = await getChannels();
  return channels.find(channel => channel.id === channelId);
}

// Get messages for a specific channel and page
export async function getChannelMessages(channelId: string, page: number): Promise<MessagePageData | null> {
  const tenantSlug = getTenantSlug();
  const messagePath = path.join(
    getDataBasePath(),
    tenantSlug,
    'channels',
    channelId,
    `page-${page}.json`
  );
  
  try {
    const content = await readFile(messagePath, 'utf-8');
    return JSON.parse(content) as MessagePageData;
  } catch (error) {
    console.error(`Failed to load messages for channel ${channelId}, page ${page}:`, error);
    return null;
  }
}

// Get all page numbers for a channel
export async function getChannelPageNumbers(channelId: string): Promise<number[]> {
  // Check if this is a forum channel by looking at metadata
  const channel = await getChannel(channelId);
  
  if (channel && channel.type === 'forum') {
    // For forum channels, check for thread summary pages
    const firstThreadPage = await getForumThreadsPage(channelId, 1);
    if (!firstThreadPage) {
      return [];
    }
    // Generate array of page numbers from 1 to totalPages
    return Array.from({ length: firstThreadPage.totalPages }, (_, i) => i + 1);
  } else {
    // For regular channels, check for message pages
    const firstPage = await getChannelMessages(channelId, 1);
    if (!firstPage) {
      // If no messages exist for the channel, return empty array
      return [];
    }
    // Generate array of page numbers from 1 to totalPages
    return Array.from({ length: firstPage.totalPages }, (_, i) => i + 1);
  }
}

// Get tenant branding information
export async function getTenantBranding(): Promise<TenantBranding | null> {
  const metadata = await getTenantMetadata();
  return metadata.branding;
}

// Forum thread summary interface
export interface ThreadSummary {
  id: string;
  name: string;
  messageCount: number;
  createdAt: string;
  archived: boolean;
  locked: boolean;
  firstMessage: {
    id: string;
    content: string;
    authorId: string;
    createdAt: string;
  } | null;
  lastActivity: string;
}

export interface ForumThreadsPage {
  forumId: string;
  forumName: string;
  page: number;
  totalPages: number;
  totalThreads: number;
  threadsPerPage: number;
  threads: ThreadSummary[];
}

// Get forum thread summaries for a specific page
export async function getForumThreadsPage(forumChannelId: string, page: number): Promise<ForumThreadsPage | null> {
  const tenantSlug = getTenantSlug();
  const threadSummaryPath = path.join(
    getDataBasePath(),
    tenantSlug,
    'channels',
    forumChannelId,
    `threads-page-${page}.json`
  );
  
  try {
    const content = await readFile(threadSummaryPath, 'utf-8');
    return JSON.parse(content) as ForumThreadsPage;
  } catch (error) {
    console.error(`Failed to load forum threads page ${page} for channel ${forumChannelId}:`, error);
    return null;
  }
}

// Get all threads for a forum channel (for static path generation)
export async function getForumThreads(forumChannelId: string): Promise<Channel[]> {
  const threads: Channel[] = [];
  let currentPage = 1;
  let hasMorePages = true;
  
  // First get all thread IDs from the forum summary pages
  const threadIds: string[] = [];
  while (hasMorePages) {
    const pageData = await getForumThreadsPage(forumChannelId, currentPage);
    if (!pageData) {
      hasMorePages = false;
      break;
    }
    
    // Collect all thread IDs from this page
    for (const threadSummary of pageData.threads) {
      threadIds.push(threadSummary.id);
    }
    
    hasMorePages = currentPage < pageData.totalPages;
    currentPage++;
  }
  
  // Now get the full channel data for threads that exist
  const channels = await getChannels();
  for (const threadId of threadIds) {
    const thread = channels.find(c => c.id === threadId);
    if (thread) {
      threads.push(thread);
    } else {
      // If thread isn't in main channels list, create a minimal channel object
      // This ensures we generate pages for all threads that have data
      threads.push({
        id: threadId,
        tenantId: '',
        platformChannelId: '',
        name: 'Thread',
        type: 'thread' as const,
        parentChannelId: forumChannelId,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as Channel);
    }
  }
  
  return threads;
}

// Get messages for a thread
export async function getThreadMessages(threadId: string): Promise<MessageWithExtras[]> {
  const allMessages: MessageWithExtras[] = [];
  let currentPage = 1;
  let hasMorePages = true;
  
  while (hasMorePages) {
    const pageData = await getChannelMessages(threadId, currentPage);
    if (!pageData) {
      hasMorePages = false;
      break;
    }
    
    allMessages.push(...pageData.messages);
    hasMorePages = currentPage < pageData.totalPages;
    currentPage++;
  }
  
  // Sort by date (oldest first)
  allMessages.sort((a, b) => 
    new Date(a.platformCreatedAt).getTime() - new Date(b.platformCreatedAt).getTime()
  );
  
  return allMessages;
}