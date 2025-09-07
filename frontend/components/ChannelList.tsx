import Link from 'next/link';
import type { Channel } from 'shared-types';
import ChannelTypeIcon from './ChannelTypeIcon';
import { useState, KeyboardEvent } from 'react';
import clsx from 'clsx';
import { getChannelUrl, getThreadUrl } from '@/lib/navigation';

interface ChannelListProps {
  channels: Channel[];
  currentChannelId?: string;
}

export default function ChannelList({ channels, currentChannelId }: ChannelListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);

  const handleCategoryToggle = (categoryId: string) => {
    setCollapsedCategories(prev => 
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, categoryId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      handleCategoryToggle(categoryId);
    }
  };

  // Create a mapping from platformChannelId to channel for easy lookup
  const channelsByPlatformId = new Map(channels.map(c => [c.platformChannelId, c]));

  // Categories are channels with type 'category' or channels that have children
  const categories = channels.filter(c => 
    c.type === 'category' || (!c.parentChannelId && channels.some(child => child.parentChannelId === c.id))
  );
  
  // Orphan channels are non-category channels without a parent
  const orphanChannels = channels.filter(c => 
    c.type !== 'category' && !c.parentChannelId && !categories.some(cat => cat.id === c.id)
  );

  return (
    <nav className="w-full h-full space-y-2" aria-label="Channels">
      <ul role="tree" className="space-y-1">
        {categories.map(category => {
          const isCollapsed = collapsedCategories.includes(category.id);
          // Match child channels by comparing parentChannelId (platform ID) with category's platformChannelId
          const childChannels = channels.filter(c => c.parentChannelId === category.id);
          
          // Skip rendering empty categories
          if (childChannels.length === 0) {
            return null;
          }
          
          return (
            <li key={category.id} role="treeitem" aria-expanded={!isCollapsed} aria-level={1}>
              <div 
                className="flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer hover:bg-primary/5 hover:border-primary/20 border border-transparent transition-all duration-200 focus-ring group" 
                onClick={() => handleCategoryToggle(category.id)}
                onKeyDown={(e) => handleKeyDown(e, category.id)}
                tabIndex={0}
              >
                <span className="font-semibold text-xs uppercase tracking-wider text-base-content/70 group-hover:text-primary">{category.name}</span>
                <span className={`transition-transform transform text-primary/60 group-hover:text-primary ${isCollapsed ? '-rotate-90' : ''}`}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>
              {!isCollapsed && (
                <ul role="group" className="pl-3 mt-1 space-y-0.5 animate-fade-slide-up">
                  {childChannels.map(channel => (
                    <ChannelItem key={channel.id} channel={channel} currentChannelId={currentChannelId} level={2} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {orphanChannels.map(channel => (
          <ChannelItem key={channel.id} channel={channel} currentChannelId={currentChannelId} level={1} />
        ))}
      </ul>
    </nav>
  );
}

interface ChannelItemProps {
  channel: Channel;
  currentChannelId?: string;
  level?: number;
}

function ChannelItem({ channel, currentChannelId, level = 1 }: ChannelItemProps) {
  const isActive = channel.id === currentChannelId;
  // Determine the href - threads use ID, regular channels use slug
  const href = channel.type === 'thread' && channel.parentChannelId 
    ? getThreadUrl(channel.id)
    : channel.slug 
      ? getChannelUrl(channel.slug)
      : null;

  const linkClasses = clsx(
    'group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all duration-200 focus-ring',
    isActive 
      ? 'bg-primary/25 text-white font-semibold ring-2 ring-primary/50 shadow-lg shadow-primary/40 glow-purple' 
      : 'text-base-content/80 hover:bg-primary/15 hover:text-primary hover:shadow-md hover:shadow-primary/20 hover:ring-1 hover:ring-primary/30'
  );

  const content = (
    <>
      <ChannelTypeIcon 
        type={channel.type} 
        discordType={channel.metadata?.discordType as number | undefined} 
        size="sm" 
        className={clsx(
          'transition-opacity',
          isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
        )} 
      />
      <span className="truncate flex-1">{channel.name}</span>
    </>
  );

  return (
    <li role="treeitem" aria-level={level}>
      {href ? (
        <Link href={href} className={linkClasses}>
          {content}
        </Link>
      ) : (
        <div className={clsx(linkClasses, 'cursor-not-allowed opacity-50')}>
          {content}
        </div>
      )}
    </li>
  );
}