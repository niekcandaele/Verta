import { ChannelType } from 'shared-types';
import clsx from 'clsx';

interface ChannelTypeIconProps {
  type: ChannelType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  discordType?: number;
}

// Discord channel type mapping
const discordChannelIcons: Record<number, string> = {
  0: '📝',  // GUILD_TEXT
  2: '🔊',  // GUILD_VOICE
  4: '📁',  // GUILD_CATEGORY
  5: '📢',  // GUILD_ANNOUNCEMENT (news)
  10: '📢', // GUILD_NEWS_THREAD
  11: '🧵', // GUILD_PUBLIC_THREAD
  12: '🧵', // GUILD_PRIVATE_THREAD
  13: '🎭', // GUILD_STAGE_VOICE
  15: '📋', // GUILD_FORUM
  16: '📺', // GUILD_MEDIA
};

// Fallback icons by channel type
const typeIcons: Record<ChannelType, string> = {
  text: '📝',
  thread: '🧵',
  forum: '📋',
  category: '📁',
};

const sizeMap = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

// Discord channel type names for accessibility
const discordChannelNames: Record<number, string> = {
  0: 'Text Channel',
  2: 'Voice Channel',
  4: 'Category',
  5: 'Announcement Channel',
  10: 'News Thread',
  11: 'Public Thread',
  12: 'Private Thread',
  13: 'Stage Channel',
  15: 'Forum Channel',
  16: 'Media Channel',
};

export default function ChannelTypeIcon({ type, discordType, size = 'sm', className = '' }: ChannelTypeIconProps) {
  // Use Discord type if available, otherwise fall back to channel type
  const icon = discordType !== undefined 
    ? discordChannelIcons[discordType] || typeIcons[type]
    : typeIcons[type];
  
  // Get proper name for accessibility
  const channelTypeName = discordType !== undefined
    ? discordChannelNames[discordType] || type
    : type;
  
  return (
    <span 
      className={clsx(
        'inline-flex items-center justify-center select-none opacity-80 hover:opacity-100 transition-opacity',
        sizeMap[size],
        className
      )}
      role="img"
      aria-label={channelTypeName}
      title={channelTypeName}
    >
      {icon}
    </span>
  );
}
