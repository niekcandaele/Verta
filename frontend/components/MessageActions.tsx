import { useState } from 'react';
import { FiCopy, FiLink, FiShare2 } from 'react-icons/fi';
import type { Message } from 'shared-types';
import clsx from 'clsx';

interface MessageActionsProps {
  message: Message;
  onCopy?: () => void;
  className?: string;
}

export default function MessageActions({ message, onCopy, className }: MessageActionsProps) {
  const [copiedType, setCopiedType] = useState<'content' | 'link' | null>(null);

  const handleCopyContent = async () => {
    if (!message.content) return;
    
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedType('content');
      onCopy?.();
      
      // Reset after 2 seconds
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setCopiedType('link');
      
      // Reset after 2 seconds
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Message from Archive',
          text: message.content?.substring(0, 100) + '...',
          url: window.location.href,
        });
      } catch (err) {
        // User cancelled share
      }
    } else {
      // Fallback to copy link
      handleCopyLink();
    }
  };

  return (
    <div className={clsx(
      'flex items-center gap-1 glass rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200',
      className
    )}>
      <button
        onClick={handleCopyContent}
        disabled={!message.content}
        className="btn btn-ghost btn-xs hover:bg-primary/10 hover:text-primary focus-ring"
        aria-label="Copy message content"
        title="Copy message"
      >
        <FiCopy className="text-sm" />
        {copiedType === 'content' && <span className="ml-1 text-xs">Copied!</span>}
      </button>
      
      <button
        onClick={handleCopyLink}
        className="btn btn-ghost btn-xs hover:bg-primary/10 hover:text-primary focus-ring"
        aria-label="Copy message link"
        title="Copy link"
      >
        <FiLink className="text-sm" />
        {copiedType === 'link' && <span className="ml-1 text-xs">Copied!</span>}
      </button>
      
      <button
        onClick={handleShare}
        className="btn btn-ghost btn-xs hover:bg-primary/10 hover:text-primary focus-ring"
        aria-label="Share message"
        title="Share"
      >
        <FiShare2 className="text-sm" />
      </button>
    </div>
  );
}