import { ChannelType } from 'shared-types';
import clsx from 'clsx';
import { 
  FiHash, 
  FiMic, 
  FiFolder, 
  FiBell, 
  FiMessageCircle, 
  FiUsers, 
  FiGrid,
  FiImage
} from 'react-icons/fi';
import { IconType } from 'react-icons';

interface ChannelTypeIconProps {
  type: ChannelType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  discordType?: number;
}

// Discord channel type mapping to Feather icons
const discordChannelIcons: Record<number, IconType> = {
  0: FiHash,         // GUILD_TEXT
  2: FiMic,          // GUILD_VOICE
  4: FiFolder,       // GUILD_CATEGORY
  5: FiBell,         // GUILD_ANNOUNCEMENT (news)
  10: FiBell,        // GUILD_NEWS_THREAD
  11: FiMessageCircle, // GUILD_PUBLIC_THREAD
  12: FiMessageCircle, // GUILD_PRIVATE_THREAD
  13: FiUsers,       // GUILD_STAGE_VOICE
  15: FiGrid,        // GUILD_FORUM
  16: FiImage,       // GUILD_MEDIA
};

// Fallback icons by channel type
const typeIcons: Record<ChannelType, IconType> = {
  text: FiHash,
  thread: FiMessageCircle,
  forum: FiGrid,
  category: FiFolder,
};

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
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
  const IconComponent = discordType !== undefined 
    ? discordChannelIcons[discordType] || typeIcons[type]
    : typeIcons[type];
  
  // Get proper name for accessibility
  const channelTypeName = discordType !== undefined
    ? discordChannelNames[discordType] || type
    : type;
  
  // Ensure icon exists, fallback to FiHash if not
  const Icon = IconComponent || FiHash;
  
  return (
    <Icon 
      className={clsx(
        'inline-flex flex-shrink-0',
        sizeMap[size],
        className
      )}
      aria-label={channelTypeName}
      title={channelTypeName}
    />
  );
}