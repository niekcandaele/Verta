import { describe, it, expect } from 'vitest';
import {
  generateSlug,
  makeSlugUnique,
  isValidSlug,
  sanitizeSlug,
  generateSlugsForChannels,
  generateSlugWithEmojiHandling
} from './slugify.js';

describe('Slug Generation', () => {
  describe('generateSlug', () => {
    it('should convert simple channel names', () => {
      expect(generateSlug('General Chat')).toBe('general-chat');
      expect(generateSlug('announcements')).toBe('announcements');
      expect(generateSlug('FAQ')).toBe('faq');
    });

    it('should handle spaces and underscores', () => {
      expect(generateSlug('general_chat')).toBe('general-chat');
      expect(generateSlug('general   chat')).toBe('general-chat');
      expect(generateSlug('general___chat')).toBe('general-chat');
      expect(generateSlug('general chat room')).toBe('general-chat-room');
    });

    it('should remove special characters', () => {
      expect(generateSlug('general-chat!')).toBe('general-chat');
      expect(generateSlug('general@chat#room')).toBe('generalchatroom');
      expect(generateSlug('general.chat')).toBe('generalchat');
      expect(generateSlug('general/chat\\room')).toBe('generalchatroom');
    });

    it('should handle edge cases', () => {
      expect(() => generateSlug('   ')).toThrow('Channel name cannot be empty');
      expect(generateSlug('###')).toBe('channel');
      expect(generateSlug('-general-chat-')).toBe('general-chat');
      expect(generateSlug('UPPERCASE')).toBe('uppercase');
    });

    it('should handle numbers', () => {
      expect(generateSlug('channel-123')).toBe('channel-123');
      expect(generateSlug('123-channel')).toBe('123-channel');
      expect(generateSlug('channel123')).toBe('channel123');
    });

    it('should throw on empty input', () => {
      expect(() => generateSlug('')).toThrow('Channel name cannot be empty');
      expect(() => generateSlug(null as any)).toThrow('Channel name cannot be empty');
    });

    it('should handle Discord-style names', () => {
      expect(generateSlug('【general】')).toBe('general');
      expect(generateSlug('〖support〗')).toBe('support');
      expect(generateSlug('└─ voice-chat')).toBe('voice-chat');
      expect(generateSlug('• announcements')).toBe('announcements');
    });
  });

  describe('makeSlugUnique', () => {
    it('should return base slug if unique', () => {
      const existing = new Set(['general', 'announcements']);
      expect(makeSlugUnique('support', existing)).toBe('support');
    });

    it('should append number for duplicates', () => {
      const existing = new Set(['general', 'general-2', 'general-3']);
      expect(makeSlugUnique('general', existing)).toBe('general-4');
    });

    it('should find first available number', () => {
      const existing = new Set(['chat', 'chat-3', 'chat-4']);
      expect(makeSlugUnique('chat', existing)).toBe('chat-2');
    });

    it('should handle sequential duplicates', () => {
      const existing = new Set<string>();
      
      const slug1 = makeSlugUnique('general', existing);
      existing.add(slug1);
      expect(slug1).toBe('general');

      const slug2 = makeSlugUnique('general', existing);
      existing.add(slug2);
      expect(slug2).toBe('general-2');

      const slug3 = makeSlugUnique('general', existing);
      existing.add(slug3);
      expect(slug3).toBe('general-3');
    });
  });

  describe('isValidSlug', () => {
    it('should validate correct slugs', () => {
      expect(isValidSlug('general-chat')).toBe(true);
      expect(isValidSlug('channel123')).toBe(true);
      expect(isValidSlug('test')).toBe(true);
      expect(isValidSlug('a-b-c-d')).toBe(true);
    });

    it('should reject invalid slugs', () => {
      expect(isValidSlug('')).toBe(false);
      expect(isValidSlug('-general')).toBe(false);
      expect(isValidSlug('general-')).toBe(false);
      expect(isValidSlug('general--chat')).toBe(false);
      expect(isValidSlug('General-Chat')).toBe(false);
      expect(isValidSlug('general chat')).toBe(false);
      expect(isValidSlug('general_chat')).toBe(false);
    });
  });

  describe('sanitizeSlug', () => {
    it('should clean up existing slugs', () => {
      expect(sanitizeSlug('General-Chat')).toBe('general-chat');
      expect(sanitizeSlug('general--chat')).toBe('general-chat');
      expect(sanitizeSlug('-general-chat-')).toBe('general-chat');
      expect(sanitizeSlug('general_chat')).toBe('general-chat');
    });

    it('should handle edge cases', () => {
      expect(sanitizeSlug('')).toBe('channel');
      expect(sanitizeSlug('---')).toBe('channel');
      expect(sanitizeSlug('UPPERCASE')).toBe('uppercase');
    });
  });

  describe('generateSlugsForChannels', () => {
    it('should generate unique slugs for multiple channels', () => {
      const channels = ['General', 'General', 'general', 'General Chat'];
      const results = generateSlugsForChannels(channels);

      expect(results).toHaveLength(4);
      expect(results[0]).toEqual({ originalName: 'General', slug: 'general', isModified: false });
      expect(results[1]).toEqual({ originalName: 'General', slug: 'general-2', isModified: true });
      expect(results[2]).toEqual({ originalName: 'general', slug: 'general-3', isModified: true });
      expect(results[3]).toEqual({ originalName: 'General Chat', slug: 'general-chat', isModified: false });

      // All slugs should be unique
      const slugs = results.map(r => r.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('should handle empty array', () => {
      expect(generateSlugsForChannels([])).toEqual([]);
    });
  });

  describe('generateSlugWithEmojiHandling', () => {
    it('should replace common Discord emojis', () => {
      expect(generateSlugWithEmojiHandling('🔊 Voice Chat')).toBe('voice-voice-chat');
      expect(generateSlugWithEmojiHandling('📢-announcements')).toBe('announcements-announcements');
      expect(generateSlugWithEmojiHandling('💬 general')).toBe('chat-general');
      expect(generateSlugWithEmojiHandling('🎮gaming')).toBe('gaminggaming');
    });

    it('should handle multiple emojis', () => {
      expect(generateSlugWithEmojiHandling('🔒 🤖 bot-commands')).toBe('private-bot-bot-commands');
      expect(generateSlugWithEmojiHandling('⭐ featured ⭐')).toBe('featured-featured-featured');
    });

    it('should work with regular slugification', () => {
      expect(generateSlugWithEmojiHandling('General Chat')).toBe('general-chat');
      expect(generateSlugWithEmojiHandling('UPPERCASE CHANNEL')).toBe('uppercase-channel');
    });
  });

  describe('Real Discord channel examples', () => {
    it('should handle common Discord channel patterns', () => {
      const examples = [
        { input: '📢┃announcements', expected: 'announcementsannouncements' },
        { input: '💬┃general-chat', expected: 'chatgeneral-chat' },
        { input: '❓┃help-support', expected: 'helphelp-support' },
        { input: '🔊 Voice Channel 1', expected: 'voice-voice-channel-1' },
        { input: '【🎮】gaming', expected: 'gaminggaming' },
        { input: '• general •', expected: 'general' },
        { input: '└─ support', expected: 'support' },
        { input: '▸ faq', expected: 'faq' }
      ];

      examples.forEach(({ input, expected }) => {
        const slug = generateSlugWithEmojiHandling(input);
        expect(slug).toBe(expected);
        expect(isValidSlug(slug)).toBe(true);
      });
    });
  });
});