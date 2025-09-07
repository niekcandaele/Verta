/**
 * Slug generation utility for creating URL-safe channel names
 * Handles special characters, duplicates, and ensures uniqueness
 */

/**
 * Generate a URL-safe slug from a channel name
 * @param channelName - Original channel name
 * @returns URL-safe slug
 */
export function generateSlug(channelName: string): string {
  if (!channelName || channelName.trim().length === 0) {
    throw new Error('Channel name cannot be empty');
  }

  return channelName
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove all non-alphanumeric characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Replace multiple hyphens with single hyphen
    .replace(/-+/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Handle empty result (e.g., all special characters)
    || 'channel';
}

/**
 * Generate a unique slug by appending a suffix if needed
 * @param baseSlug - Base slug to make unique
 * @param existingSlugs - Set of existing slugs to check against
 * @returns Unique slug with numeric suffix if needed
 */
export function makeSlugUnique(baseSlug: string, existingSlugs: Set<string>): string {
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  let uniqueSlug = `${baseSlug}-${counter}`;
  
  while (existingSlugs.has(uniqueSlug)) {
    counter++;
    uniqueSlug = `${baseSlug}-${counter}`;
  }

  return uniqueSlug;
}

/**
 * Check if a slug is valid (contains only allowed characters)
 * @param slug - Slug to validate
 * @returns true if valid
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length === 0) return false;
  
  // Must contain only lowercase letters, numbers, and hyphens
  // Cannot start or end with a hyphen
  // Cannot have consecutive hyphens
  const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  return slugRegex.test(slug);
}

/**
 * Sanitize an existing slug (useful for migrations)
 * @param slug - Potentially invalid slug
 * @returns Sanitized slug
 */
export function sanitizeSlug(slug: string): string {
  if (!slug) return 'channel';
  
  const sanitized = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'channel';
}

/**
 * Interface for bulk slug generation with conflict resolution
 */
export interface SlugGenerationResult {
  originalName: string;
  slug: string;
  isModified: boolean;
}

/**
 * Generate slugs for multiple channels with automatic conflict resolution
 * @param channelNames - Array of channel names
 * @returns Array of slug generation results
 */
export function generateSlugsForChannels(channelNames: string[]): SlugGenerationResult[] {
  const results: SlugGenerationResult[] = [];
  const usedSlugs = new Set<string>();

  for (const name of channelNames) {
    const baseSlug = generateSlug(name);
    const finalSlug = makeSlugUnique(baseSlug, usedSlugs);
    
    usedSlugs.add(finalSlug);
    
    results.push({
      originalName: name,
      slug: finalSlug,
      isModified: finalSlug !== baseSlug
    });
  }

  return results;
}

/**
 * Common Discord channel name patterns that need special handling
 */
export const CHANNEL_NAME_REPLACEMENTS: Record<string, string> = {
  '🔊': 'voice',
  '📢': 'announcements',
  '💬': 'chat',
  '❓': 'help',
  '📝': 'notes',
  '🎮': 'gaming',
  '🎵': 'music',
  '🤖': 'bot',
  '⭐': 'featured',
  '🔒': 'private'
};

/**
 * Enhanced slug generation with emoji handling
 * @param channelName - Channel name possibly containing emojis
 * @returns URL-safe slug with emoji replacements
 */
export function generateSlugWithEmojiHandling(channelName: string): string {
  let processed = channelName;

  // Replace known emoji patterns
  for (const [emoji, replacement] of Object.entries(CHANNEL_NAME_REPLACEMENTS)) {
    processed = processed.replace(new RegExp(emoji, 'g'), replacement);
  }

  return generateSlug(processed);
}