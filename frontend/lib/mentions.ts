import type { Channel } from 'shared-types';

// Discord mention patterns
const CHANNEL_MENTION_PATTERN = /<#(\d+)>/g;
const USER_MENTION_PATTERN = /<@!?([a-fA-F0-9]+)>/g; // Matches both <@userId> and <@!userId>
const ROLE_MENTION_PATTERN = /<@&(\d+)>/g;

export interface ParsedMention {
  type: 'channel' | 'user' | 'role';
  id: string;
  raw: string;
  display: string;
}

// Parse all mentions in a text
export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];

  // Parse channel mentions
  let match;
  while ((match = CHANNEL_MENTION_PATTERN.exec(text)) !== null) {
    mentions.push({
      type: 'channel',
      id: match[1],
      raw: match[0],
      display: `#${match[1]}`, // Will be replaced with channel name
    });
  }

  // Parse user mentions
  while ((match = USER_MENTION_PATTERN.exec(text)) !== null) {
    mentions.push({
      type: 'user',
      id: match[1],
      raw: match[0],
      display: `User ${match[1].slice(0, 8)}`, // Show first 8 chars of anonymized ID
    });
  }

  // Parse role mentions
  while ((match = ROLE_MENTION_PATTERN.exec(text)) !== null) {
    mentions.push({
      type: 'role',
      id: match[1],
      raw: match[0],
      display: `@Role`, // Generic role display
    });
  }

  return mentions;
}

// Replace mentions in text with displayable content
export function replaceMentionsInText(
  text: string,
  channels: Channel[],
  renderMention: (mention: ParsedMention) => string
): string {
  let processedText = text;

  // Replace channel mentions
  processedText = processedText.replace(CHANNEL_MENTION_PATTERN, (match, channelId) => {
    const channel = channels.find(c => c.platformChannelId === channelId);
    const mention: ParsedMention = {
      type: 'channel',
      id: channelId,
      raw: match,
      display: channel ? `#${channel.name}` : `#unknown-channel`,
    };
    return renderMention(mention);
  });

  // Replace user mentions
  processedText = processedText.replace(USER_MENTION_PATTERN, (match, userId) => {
    const mention: ParsedMention = {
      type: 'user',
      id: userId,
      raw: match,
      display: `User ${userId.slice(0, 8)}`,
    };
    return renderMention(mention);
  });

  // Replace role mentions
  processedText = processedText.replace(ROLE_MENTION_PATTERN, (match, roleId) => {
    const mention: ParsedMention = {
      type: 'role',
      id: roleId,
      raw: match,
      display: '@Role',
    };
    return renderMention(mention);
  });

  return processedText;
}

// Convert mentions for React components (returns JSX string)
export function processMentionsForMarkdown(text: string, channels: Channel[]): string {
  return replaceMentionsInText(text, channels, (mention) => {
    switch (mention.type) {
      case 'channel':
        const channel = channels.find(c => c.platformChannelId === mention.id);
        return `[${channel ? `#${channel.name}` : '#unknown-channel'}](channel:${mention.id})`;
      case 'user':
        return `[@${mention.display}](user:${mention.id})`;
      case 'role':
        return `[@Role](role:${mention.id})`;
      default:
        return mention.raw;
    }
  });
}