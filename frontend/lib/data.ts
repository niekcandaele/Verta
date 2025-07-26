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
  // During build, we read from the backend _data directory (temporary until we fix the backend path)
  const basePath = process.env.DATA_EXPORT_PATH || '../backend/_data/data-export';
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
  // First, get page 1 to find out total pages
  const firstPage = await getChannelMessages(channelId, 1);
  if (!firstPage) {
    // If no messages exist for the channel, return empty array
    return [];
  }
  
  // Generate array of page numbers from 1 to totalPages
  return Array.from({ length: firstPage.totalPages }, (_, i) => i + 1);
}

// Get tenant branding information
export async function getTenantBranding(): Promise<TenantBranding | null> {
  const metadata = await getTenantMetadata();
  return metadata.branding;
}