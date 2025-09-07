import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMessageUrl, parseMessageId } from '@/lib/navigation';
import type { MessageWithExtras } from '@/lib/data';

interface UseUrlStateOptions {
  channelSlug: string;
  messages: MessageWithExtras[];
  enabled?: boolean;
}

interface UseUrlStateResult {
  currentMessageId: string | null;
  updateUrl: (messageId: string) => void;
  scrollToMessage: (messageId: string) => void;
}

export function useUrlState({
  channelSlug,
  messages,
  enabled = true,
}: UseUrlStateOptions): UseUrlStateResult {
  const router = useRouter();
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigatingRef = useRef(false);

  // Parse initial message ID from URL
  useEffect(() => {
    const { messageId } = router.query;
    if (messageId && typeof messageId === 'string') {
      const decoded = parseMessageId(messageId);
      if (decoded) {
        setCurrentMessageId(decoded);
      }
    }
  }, [router.query]);

  // Update URL without triggering navigation
  const updateUrl = useCallback((messageId: string) => {
    if (!enabled || isNavigatingRef.current) return;

    const newUrl = getMessageUrl(channelSlug, messageId);
    
    // Use shallow routing to update URL without re-rendering
    router.replace(newUrl, undefined, { shallow: true });
    setCurrentMessageId(messageId);
  }, [channelSlug, enabled, router]);

  // Scroll to a specific message
  const scrollToMessage = useCallback((messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      isNavigatingRef.current = true;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Highlight the message
      element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      
      // Remove highlight after animation
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        isNavigatingRef.current = false;
      }, 2000);
    }
  }, []);

  // Handle scroll events to update URL
  useEffect(() => {
    if (!enabled || messages.length === 0) return;

    const handleScroll = () => {
      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Debounce scroll events
      scrollTimeoutRef.current = setTimeout(() => {
        if (isNavigatingRef.current) return;

        // Find the message closest to the viewport center
        const viewportCenter = window.innerHeight / 2;
        let closestMessage: MessageWithExtras | null = null;
        let closestDistance = Infinity;

        for (const message of messages) {
          const element = document.getElementById(`message-${message.id}`);
          if (element) {
            const rect = element.getBoundingClientRect();
            const elementCenter = rect.top + rect.height / 2;
            const distance = Math.abs(elementCenter - viewportCenter);

            if (distance < closestDistance) {
              closestDistance = distance;
              closestMessage = message;
            }
          }
        }

        if (closestMessage) {
          const messageId = closestMessage.id;
          const platformMessageId = closestMessage.platformMessageId;
          if (messageId !== currentMessageId) {
            updateUrl(platformMessageId);
          }
        }
      }, 150);
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [enabled, messages, currentMessageId, updateUrl]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      const match = url.match(/\/message\/([^/?]+)/);
      if (match) {
        const decoded = parseMessageId(match[1]);
        if (decoded) {
          scrollToMessage(decoded);
        }
      }
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events, scrollToMessage]);

  return {
    currentMessageId,
    updateUrl,
    scrollToMessage,
  };
}

// Helper hook for managing scroll position restoration
export function useScrollRestoration(key: string) {
  const scrollPositions = useRef<Map<string, number>>(new Map());

  const saveScrollPosition = useCallback(() => {
    scrollPositions.current.set(key, window.scrollY);
  }, [key]);

  const restoreScrollPosition = useCallback(() => {
    const position = scrollPositions.current.get(key);
    if (position !== undefined) {
      window.scrollTo(0, position);
    }
  }, [key]);

  useEffect(() => {
    // Save position before unload
    window.addEventListener('beforeunload', saveScrollPosition);
    
    // Restore on mount
    restoreScrollPosition();

    return () => {
      window.removeEventListener('beforeunload', saveScrollPosition);
      saveScrollPosition();
    };
  }, [saveScrollPosition, restoreScrollPosition]);

  return {
    saveScrollPosition,
    restoreScrollPosition,
  };
}