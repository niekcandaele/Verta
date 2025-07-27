export type Message = {
  id: string;
  channelId: string;
  platformMessageId: string;
  anonymizedAuthorId: string;
  content: string;
  replyToId: string | null;
  metadata: Record<string, unknown>;
  platformCreatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMessageData = {
  channelId: string;
  platformMessageId: string;
  anonymizedAuthorId: string;
  content: string;
  replyToId?: string | null;
  metadata?: Record<string, unknown>;
  platformCreatedAt: Date;
};

export type MessageEmojiReaction = {
  id: string;
  messageId: string;
  emoji: string;
  anonymizedUserId: string;
  createdAt: Date;
};

export type CreateMessageEmojiReactionData = {
  messageId: string;
  emoji: string;
  anonymizedUserId: string;
};

export type MessageAttachment = {
  id: string;
  messageId: string;
  filename: string;
  fileSize: bigint;
  contentType: string;
  url: string;
  createdAt: Date;
};

export type CreateMessageAttachmentData = {
  messageId: string;
  filename: string;
  fileSize: bigint | number;
  contentType: string;
  url: string;
};
