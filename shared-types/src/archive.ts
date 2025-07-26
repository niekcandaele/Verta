import { Tenant } from './tenant';
import { Channel, ChannelType } from './channel';
import { Message, MessageEmojiReaction, MessageAttachment } from './message';

export interface ArchiveTenant extends Tenant {}

export interface ArchiveChannel extends Channel {}

// Archive attachment with number fileSize for JSON compatibility
export interface ArchiveMessageAttachment extends Omit<MessageAttachment, 'fileSize'> {
  fileSize: number;
}

export interface ArchiveMessage extends Omit<Message, 'attachments'> {
  reactions: MessageEmojiReaction[];
  attachments: ArchiveMessageAttachment[];
}

export interface ArchiveChannelPage {
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  page: number;
  totalPages: number;
  messages: ArchiveMessage[];
}

export interface ArchiveMetadata {
  tenant: ArchiveTenant;
  channels: ArchiveChannel[];
}
