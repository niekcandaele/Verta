import type {
  ColumnType,
  Generated,
  Selectable,
  Insertable,
  Updateable,
} from 'kysely';

/**
 * Custom type for TiDB vector columns
 * Vectors are stored as JSON arrays of numbers in TiDB
 */
export type VectorColumn = ColumnType<
  number[],
  string | number[],
  string | number[]
>;

/**
 * Database table types for multi-tenant system
 */

// Tenant status enum matching PostgreSQL enum type
export type TenantStatus = 'ACTIVE' | 'CANCELLED' | 'MAINTENANCE';

// Platform enum matching PostgreSQL enum type
export type Platform = 'slack' | 'discord';

// Channel type enum
export type ChannelType = 'text' | 'thread' | 'forum' | 'category';

// Sync status enum
export type SyncStatus = 'in_progress' | 'completed' | 'failed';

/**
 * Database table schema for tenants
 */
export interface TenantsTable {
  // UUID primary key with default generation
  id: Generated<string>;

  // Tenant display name
  name: string;

  // URL-friendly unique identifier
  slug: string;

  // Tenant status
  status: TenantStatus;

  // Integration platform
  platform: Platform;

  // Platform-specific identifier (e.g., Slack workspace ID, Discord guild ID)
  platform_id: string;

  // Timestamps with automatic management
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for channels
 */
export interface ChannelsTable {
  id: Generated<string>;
  tenant_id: string;
  platform_channel_id: string;
  name: string;
  type: ChannelType;
  parent_channel_id: string | null;
  metadata: ColumnType<unknown, string | undefined, string>;
  slug: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for messages
 */
export interface MessagesTable {
  id: Generated<string>;
  channel_id: string;
  platform_message_id: string;
  anonymized_author_id: string;
  content: string;
  reply_to_id: string | null;
  metadata: ColumnType<unknown, string | undefined, string>;
  platform_created_at: ColumnType<Date, Date | string, never>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
  embedding: VectorColumn | null;
}

/**
 * Database table schema for message emoji reactions
 */
export interface MessageEmojiReactionsTable {
  id: Generated<string>;
  message_id: string;
  emoji: string;
  anonymized_user_id: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

/**
 * Database table schema for message attachments
 */
export interface MessageAttachmentsTable {
  id: Generated<string>;
  message_id: string;
  filename: string;
  file_size: ColumnType<
    bigint,
    bigint | number | string,
    bigint | number | string
  >;
  content_type: string;
  url: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

/**
 * Database table schema for sync progress
 */
export interface SyncProgressTable {
  id: Generated<string>;
  tenant_id: string;
  channel_id: string;
  last_synced_message_id: string;
  last_synced_at: ColumnType<Date, Date | string, Date | string>;
  status: SyncStatus;
  error_details: ColumnType<unknown, unknown | undefined, unknown>;
  worker_id: string | null;
  started_at: ColumnType<Date, Date | string | undefined, Date | string>;
  messages_per_second: ColumnType<number, number | undefined, number>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for channel sync jobs
 */
export interface ChannelSyncJobsTable {
  id: Generated<string>;
  tenant_id: string;
  channel_id: string;
  parent_job_id: string;
  worker_id: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: ColumnType<Date, Date | string | undefined, Date | string>;
  completed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  messages_processed: ColumnType<number, number | undefined, number>;
  error_details: ColumnType<unknown, unknown | undefined, unknown>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for tenant branding
 */
export interface TenantBrandingTable {
  id: Generated<string>;
  tenant_id: string;
  logo: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for question clusters
 */
export interface QuestionClustersTable {
  id: Generated<string>;
  tenant_id: string;
  representative_text: string;
  thread_title: string | null;
  embedding: VectorColumn;
  instance_count: ColumnType<number, number | undefined, number>;
  first_seen_at: ColumnType<Date, Date | string, Date | string>;
  last_seen_at: ColumnType<Date, Date | string, Date | string>;
  metadata: ColumnType<unknown, unknown | undefined, unknown>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for question instances
 */
export interface QuestionInstancesTable {
  id: Generated<string>;
  cluster_id: string;
  thread_id: string;
  thread_title: string | null;
  original_text: string;
  rephrased_text: string | null;
  confidence_score: ColumnType<number, number, number>;
  created_at: ColumnType<Date, string | undefined, never>;
}

/**
 * Database table schema for analysis jobs
 */
export interface AnalysisJobsTable {
  id: Generated<string>;
  tenant_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  job_type: ColumnType<string, string | undefined, string>;
  parameters: ColumnType<unknown, unknown | undefined, unknown>;
  progress: ColumnType<number, number | undefined, number>;
  total_items: ColumnType<number, number | undefined, number>;
  processed_items: ColumnType<number, number | undefined, number>;
  thread_min_age_days: ColumnType<number, number | undefined, number>;
  error_details: ColumnType<unknown, unknown | undefined, unknown>;
  started_at: ColumnType<Date | null, Date | string | undefined, Date | string>;
  completed_at: ColumnType<
    Date | null,
    Date | string | undefined,
    Date | string
  >;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * OCR result status enum
 */
export type OcrStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Database table schema for OCR results
 */
export interface OcrResultsTable {
  id: Generated<string>;
  attachment_id: string;
  model_version: string;
  extracted_text: string | null;
  confidence: ColumnType<number | null, number | null, number | null>;
  status: OcrStatus;
  error_message: string | null;
  retry_count: ColumnType<number, number | undefined, number>;
  processing_time_ms: number | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Answer format enum
 */
export type AnswerFormat = 'markdown' | 'plaintext';

/**
 * Database table schema for golden answers
 */
export interface GoldenAnswersTable {
  id: Generated<string>;
  cluster_id: string;
  tenant_id: string;
  answer: string;
  answer_format: ColumnType<
    AnswerFormat,
    AnswerFormat | undefined,
    AnswerFormat
  >;
  embedding: VectorColumn | null;
  created_by: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Chunk method enum
 */
export type ChunkMethod = 'semantic' | 'fixed_size' | 'structural';

/**
 * Database table schema for knowledge bases
 */
export interface KnowledgeBasesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: string | null;
  sitemap_url: string;
  last_crawled_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  last_crawl_event: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for knowledge base chunks
 */
export interface KnowledgeBaseChunksTable {
  id: Generated<string>;
  knowledge_base_id: string;
  source_url: string;
  title: string | null;
  heading_hierarchy: ColumnType<unknown, unknown | null, unknown | null>;
  content: string;
  embedding: VectorColumn | null;
  chunk_index: number;
  total_chunks: number;
  start_char_index: number | null;
  end_char_index: number | null;
  overlap_with_previous: ColumnType<number, number | undefined, number>;
  checksum: string | null;
  chunk_method: ColumnType<ChunkMethod, ChunkMethod | undefined, ChunkMethod>;
  token_count: number | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database table schema for bot configuration
 */
export interface BotConfigTable {
  id: Generated<string>;
  tenant_id: string;
  monitored_channels: ColumnType<string[], string[], string[]>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Database schema interface
 */
export interface Database {
  tenants: TenantsTable;
  channels: ChannelsTable;
  messages: MessagesTable;
  message_emoji_reactions: MessageEmojiReactionsTable;
  message_attachments: MessageAttachmentsTable;
  sync_progress: SyncProgressTable;
  channel_sync_jobs: ChannelSyncJobsTable;
  tenant_branding: TenantBrandingTable;
  question_clusters: QuestionClustersTable;
  question_instances: QuestionInstancesTable;
  analysis_jobs: AnalysisJobsTable;
  ocr_results: OcrResultsTable;
  golden_answers: GoldenAnswersTable;
  knowledge_bases: KnowledgeBasesTable;
  knowledge_base_chunks: KnowledgeBaseChunksTable;
  bot_config: BotConfigTable;
}

/**
 * Type helpers for working with tenant records
 */
export type Tenant = Selectable<TenantsTable>;
export type NewTenant = Insertable<TenantsTable>;
export type TenantUpdate = Updateable<TenantsTable>;

/**
 * Type helpers for working with channel records
 */
export type Channel = Selectable<ChannelsTable>;
export type NewChannel = Insertable<ChannelsTable>;
export type ChannelUpdate = Updateable<ChannelsTable>;

/**
 * Type helpers for working with message records
 */
export type Message = Selectable<MessagesTable>;
export type NewMessage = Insertable<MessagesTable>;
export type MessageUpdate = Updateable<MessagesTable>;

/**
 * Type helpers for working with message emoji reaction records
 */
export type MessageEmojiReaction = Selectable<MessageEmojiReactionsTable>;
export type NewMessageEmojiReaction = Insertable<MessageEmojiReactionsTable>;

/**
 * Type helpers for working with message attachment records
 */
export type MessageAttachment = Selectable<MessageAttachmentsTable>;
export type NewMessageAttachment = Insertable<MessageAttachmentsTable>;

/**
 * Type helpers for working with sync progress records
 */
export type SyncProgress = Selectable<SyncProgressTable>;
export type NewSyncProgress = Insertable<SyncProgressTable>;
export type SyncProgressUpdate = Updateable<SyncProgressTable>;

/**
 * Type helpers for working with tenant branding records
 */
export type TenantBranding = Selectable<TenantBrandingTable>;
export type NewTenantBranding = Insertable<TenantBrandingTable>;
export type TenantBrandingUpdate = Updateable<TenantBrandingTable>;

/**
 * Type helpers for working with question cluster records
 */
export type QuestionCluster = Selectable<QuestionClustersTable>;
export type NewQuestionCluster = Insertable<QuestionClustersTable>;
export type QuestionClusterUpdate = Updateable<QuestionClustersTable>;

/**
 * Type helpers for working with question instance records
 */
export type QuestionInstance = Selectable<QuestionInstancesTable>;
export type NewQuestionInstance = Insertable<QuestionInstancesTable>;
export type QuestionInstanceUpdate = Updateable<QuestionInstancesTable>;

/**
 * Type helpers for working with analysis job records
 */
export type AnalysisJob = Selectable<AnalysisJobsTable>;
export type NewAnalysisJob = Insertable<AnalysisJobsTable>;
export type AnalysisJobUpdate = Updateable<AnalysisJobsTable>;

/**
 * Type helpers for working with OCR result records
 */
export type OcrResult = Selectable<OcrResultsTable>;
export type NewOcrResult = Insertable<OcrResultsTable>;
export type OcrResultUpdate = Updateable<OcrResultsTable>;

/**
 * Type helpers for working with golden answer records
 */
export type GoldenAnswer = Selectable<GoldenAnswersTable>;
export type NewGoldenAnswer = Insertable<GoldenAnswersTable>;
export type GoldenAnswerUpdate = Updateable<GoldenAnswersTable>;

/**
 * Type helpers for working with knowledge base records
 */
export type KnowledgeBase = Selectable<KnowledgeBasesTable>;
export type NewKnowledgeBase = Insertable<KnowledgeBasesTable>;
export type KnowledgeBaseUpdate = Updateable<KnowledgeBasesTable>;

/**
 * Type helpers for working with knowledge base chunk records
 */
export type KnowledgeBaseChunk = Selectable<KnowledgeBaseChunksTable>;
export type NewKnowledgeBaseChunk = Insertable<KnowledgeBaseChunksTable>;
export type KnowledgeBaseChunkUpdate = Updateable<KnowledgeBaseChunksTable>;

/**
 * Type helpers for working with bot config records
 */
export type BotConfig = Selectable<BotConfigTable>;
export type NewBotConfig = Insertable<BotConfigTable>;
export type BotConfigUpdate = Updateable<BotConfigTable>;
