/**
 * URL navigation utilities for the frontend
 * Provides functions for generating and parsing URLs with slugs and base62 message IDs
 */

// Base62 alphabet (same as backend implementation)
const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = BigInt(BASE62_ALPHABET.length);

/**
 * Encode a Discord message ID to base62
 */
export function encodeMessageId(messageId: string): string {
  if (!messageId || !/^\d+$/.test(messageId)) {
    throw new Error('Invalid message ID: must be a numeric string');
  }

  let num = BigInt(messageId);
  if (num === BigInt(0)) return BASE62_ALPHABET[0];

  let result = '';
  while (num > BigInt(0)) {
    const remainder = Number(num % BASE);
    result = BASE62_ALPHABET[remainder] + result;
    num = num / BASE;
  }

  return result;
}

/**
 * Decode a base62 string back to Discord message ID
 */
export function decodeMessageId(encoded: string): string {
  if (!encoded || encoded.length === 0) {
    throw new Error('Invalid encoded message ID: cannot be empty');
  }

  let result = BigInt(0);
  for (let i = 0; i < encoded.length; i++) {
    const char = encoded[i];
    const value = BASE62_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid character in encoded message ID: ${char}`);
    }
    result = result * BASE + BigInt(value);
  }

  return result.toString();
}

/**
 * URL generation functions
 */

// Generate channel URL with slug
export function getChannelUrl(channelSlug: string): string {
  return `/channel/${channelSlug}`;
}

// Generate message permalink URL
export function getMessageUrl(channelSlug: string, messageId: string): string {
  const encodedId = encodeMessageId(messageId);
  return `/channel/${channelSlug}/message/${encodedId}`;
}

// Generate thread URL
export function getThreadUrl(threadId: string): string {
  return `/thread/${threadId}`;
}

// Generate timestamp-based URL
export function getTimestampUrl(channelSlug: string, timestamp: Date | string): string {
  const ts = typeof timestamp === 'string' ? timestamp : timestamp.toISOString();
  return `/channel/${channelSlug}/at/${encodeURIComponent(ts)}`;
}

/**
 * URL parsing functions
 */

// Parse message ID from URL
export function parseMessageId(encodedId: string): string | null {
  try {
    return decodeMessageId(encodedId);
  } catch {
    return null;
  }
}

// Extract channel slug from pathname
export function extractChannelSlug(pathname: string): string | null {
  const match = pathname.match(/^\/channel\/([^\/]+)/);
  return match ? match[1] : null;
}

// Extract message ID from pathname
export function extractMessageId(pathname: string): string | null {
  const match = pathname.match(/\/message\/([^\/]+)$/);
  if (!match) return null;
  
  return parseMessageId(match[1]);
}

// Extract thread ID from pathname
export function extractThreadId(pathname: string): string | null {
  const match = pathname.match(/^\/thread\/([^\/]+)/);
  return match ? match[1] : null;
}

/**
 * Navigation helpers
 */

// Get the URL for the next/previous page (for cursor-based pagination)
export function getPageUrl(channelSlug: string, cursor?: string): string {
  const baseUrl = getChannelUrl(channelSlug);
  return cursor ? `${baseUrl}?cursor=${cursor}` : baseUrl;
}

// Build search URL with query parameters
export function getSearchUrl(query: string, filters?: { channel?: string; user?: string }): string {
  const params = new URLSearchParams({ q: query });
  
  if (filters?.channel) params.append('channel', filters.channel);
  if (filters?.user) params.append('user', filters.user);
  
  return `/search?${params.toString()}`;
}

/**
 * Utility functions
 */

// Check if a URL is a message permalink
export function isMessagePermalink(pathname: string): boolean {
  return /\/channel\/[^\/]+\/message\/[^\/]+/.test(pathname);
}

// Check if a URL is a thread URL
export function isThreadUrl(pathname: string): boolean {
  return /^\/thread\/[^\/]+/.test(pathname);
}

// Generate a share URL (absolute URL for sharing)
export function getShareUrl(path: string, baseUrl?: string): string {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${path}`;
}