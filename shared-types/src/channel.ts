export type ChannelType = 'text' | 'thread' | 'forum';

export type Channel = {
  id: string;
  tenantId: string;
  platformChannelId: string;
  name: string;
  type: ChannelType;
  parentChannelId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateChannelData = {
  tenantId: string;
  platformChannelId: string;
  name: string;
  type: ChannelType;
  parentChannelId?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateChannelData = {
  name?: string;
  type?: ChannelType;
  parentChannelId?: string | null;
  metadata?: Record<string, unknown>;
};
