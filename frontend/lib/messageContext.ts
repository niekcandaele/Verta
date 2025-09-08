import { useState, useEffect, useCallback } from 'react';
import { api } from './api-client';
import type { Channel } from 'shared-types';
import type { MessageWithExtras } from './data';

export interface MessageContext {
  message: MessageWithExtras;
  before: MessageWithExtras[];
  after: MessageWithExtras[];
  channel: Channel;
}

export interface UseMessageContextOptions {
  messageId: string;
  beforeCount?: number;
  afterCount?: number;
}

export interface UseMessageContextResult {
  context: MessageContext | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useMessageContext({
  messageId,
  beforeCount = 50,
  afterCount = 50,
}: UseMessageContextOptions): UseMessageContextResult {
  const [context, setContext] = useState<MessageContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchContext = useCallback(async () => {
    if (!messageId) {
      setError(new Error('No message ID provided'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.getMessageContext(messageId, beforeCount, afterCount);
      if (response.data?.data) {
        setContext(response.data.data);
      } else {
        throw new Error('Failed to fetch message context');
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [messageId, beforeCount, afterCount]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  return {
    context,
    isLoading,
    error,
    refetch: fetchContext,
  };
}

// Helper to find message position in a list
export function findMessageIndex(messages: MessageWithExtras[], messageId: string): number {
  return messages.findIndex(m => m.id === messageId || m.platformMessageId === messageId);
}

// Helper to merge message lists when navigating
export function mergeMessageContexts(
  existing: MessageContext | null,
  newContext: MessageContext
): MessageContext {
  if (!existing) return newContext;

  // Create maps for deduplication
  const messageMap = new Map<string, MessageWithExtras>();

  // Add all existing messages
  [...existing.before, existing.message, ...existing.after].forEach(msg => {
    messageMap.set(msg.id, msg);
  });

  // Add new messages
  [...newContext.before, newContext.message, ...newContext.after].forEach(msg => {
    messageMap.set(msg.id, msg);
  });

  // Sort by created_at
  const allMessages = Array.from(messageMap.values()).sort((a, b) => 
    new Date(a.platformCreatedAt).getTime() - new Date(b.platformCreatedAt).getTime()
  );

  // Find the target message
  const targetIndex = allMessages.findIndex(m => m.id === newContext.message.id);
  
  return {
    message: newContext.message,
    before: allMessages.slice(0, targetIndex),
    after: allMessages.slice(targetIndex + 1),
    channel: newContext.channel,
  };
}