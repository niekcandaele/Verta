import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Channel } from 'shared-types';
import type { MessageWithExtras } from '@/lib/data';
import Message from './Message';
import { useUrlState } from '@/hooks/useUrlState';

interface MessageViewProps {
  messages: MessageWithExtras[];
  channelSlug: string;
  channels: Channel[];
  highlightMessageId?: string;
  enableUrlSync?: boolean;
  showLoadMore?: boolean;
  onLoadMore?: () => void;
  isLoading?: boolean;
}

export default function MessageView({
  messages,
  channelSlug,
  channels,
  highlightMessageId,
  enableUrlSync = false,
  showLoadMore = false,
  onLoadMore,
  isLoading = false,
}: MessageViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const highlightedRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { currentMessageId, scrollToMessage } = useUrlState({
    channelSlug,
    messages,
    enabled: enableUrlSync,
  });

  // Scroll to highlighted message on mount
  useEffect(() => {
    if (highlightMessageId) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        scrollToMessage(highlightMessageId);
      }, 100);
    }
  }, [highlightMessageId, scrollToMessage]);

  // Group messages by date
  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Load more button at top */}
      {showLoadMore && (
        <div className="text-center py-4">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="btn btn-sm btn-outline btn-primary"
          >
            {isLoading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Loading...
              </>
            ) : (
              'Load Earlier Messages'
            )}
          </button>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {groupedMessages.map(({ date, messages: dayMessages }) => (
          <motion.div
            key={date}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {/* Date separator */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-base-content/10"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-base-100 text-sm text-base-content/60">
                  {formatDateSeparator(date)}
                </span>
              </div>
            </div>

            {/* Messages for this day */}
            <div className="space-y-4">
              {dayMessages.map((message, index) => {
                const isHighlighted = message.id === highlightMessageId || 
                                    message.platformMessageId === highlightMessageId;
                const isCurrent = message.id === currentMessageId || 
                                message.platformMessageId === currentMessageId;
                
                return (
                  <motion.div
                    key={message.id}
                    id={`message-${message.id}`}
                    ref={isHighlighted ? highlightedRef : undefined}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className={`transition-all duration-300 ${
                      isHighlighted ? 'message-highlighted' : ''
                    } ${isCurrent ? 'message-current' : ''}`}
                  >
                    <Message 
                      message={message} 
                      showChannel={false}
                      channels={channels}
                      isHighlighted={isHighlighted}
                      channelSlug={channelSlug}
                    />
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />

      <style jsx>{`
        .message-highlighted {
          animation: highlight-pulse 2s ease-in-out;
        }

        .message-current {
          position: relative;
        }

        .message-current::before {
          content: '';
          position: absolute;
          left: -4px;
          top: 0;
          bottom: 0;
          width: 4px;
          background: linear-gradient(to bottom, 
            transparent,
            rgb(var(--primary) / 0.5) 20%,
            rgb(var(--primary) / 0.5) 80%,
            transparent
          );
          border-radius: 2px;
        }

        @keyframes highlight-pulse {
          0% {
            background-color: transparent;
          }
          20% {
            background-color: rgb(var(--primary) / 0.1);
            box-shadow: 0 0 0 4px rgb(var(--primary) / 0.2);
          }
          80% {
            background-color: rgb(var(--primary) / 0.1);
            box-shadow: 0 0 0 4px rgb(var(--primary) / 0.2);
          }
          100% {
            background-color: transparent;
          }
        }
      `}</style>
    </div>
  );
}

// Group messages by date
function groupMessagesByDate(messages: MessageWithExtras[]) {
  const groups = new Map<string, MessageWithExtras[]>();

  messages.forEach(message => {
    const date = new Date(message.platformCreatedAt).toDateString();
    const existing = groups.get(date) || [];
    groups.set(date, [...existing, message]);
  });

  return Array.from(groups.entries()).map(([date, messages]) => ({
    date,
    messages,
  }));
}

// Format date for separator
function formatDateSeparator(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}