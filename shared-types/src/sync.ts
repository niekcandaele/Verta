export type SyncStatus = 'in_progress' | 'completed' | 'failed';

export type SyncProgress = {
  id: string;
  tenantId: string;
  channelId: string;
  lastSyncedMessageId: string;
  lastSyncedAt: Date;
  status: SyncStatus;
  errorDetails: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateSyncProgressData = {
  tenantId: string;
  channelId: string;
  lastSyncedMessageId: string;
  lastSyncedAt: Date;
  status: SyncStatus;
  errorDetails?: unknown;
};

export type UpdateSyncProgressData = {
  lastSyncedMessageId?: string;
  lastSyncedAt?: Date;
  status?: SyncStatus;
  errorDetails?: unknown;
};