import { Kysely } from 'kysely';
import { v4 as uuidv4 } from 'uuid';
import { BaseCrudRepositoryImpl } from './BaseCrudRepository.js';
import type {
  Database,
  BotConfig,
  NewBotConfig,
  BotConfigUpdate,
} from '../database/types.js';

/**
 * Repository for managing Discord bot configuration
 */
export class BotConfigRepository extends BaseCrudRepositoryImpl<
  BotConfig,
  NewBotConfig,
  BotConfigUpdate
> {
  constructor(protected readonly db: Kysely<Database>) {
    super(db, 'bot_config');
  }

  /**
   * Find bot configuration by tenant ID
   */
  async findByTenantId(tenantId: string): Promise<BotConfig | null> {
    const row = await this.db
      .selectFrom('bot_config')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Upsert bot configuration (create or update based on tenant_id)
   * This is useful because each tenant should have only one bot config
   */
  async upsert(data: NewBotConfig): Promise<BotConfig> {
    // Check if config already exists for this tenant
    const existing = await this.findByTenantId(data.tenant_id);

    if (existing) {
      // Update existing config
      const updateData: BotConfigUpdate = {
        monitored_channels: data.monitored_channels,
      };

      const updated = await this.update(existing.id, updateData);
      if (!updated) {
        throw new Error('Failed to update bot config');
      }
      return updated;
    } else {
      // Create new config
      return this.create(data);
    }
  }

  /**
   * Map database row to BotConfig entity
   */
  protected mapRowToEntity(row: any): BotConfig {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      monitored_channels: Array.isArray(row.monitored_channels)
        ? row.monitored_channels
        : JSON.parse(row.monitored_channels || '[]'),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  /**
   * Map create data to database row format
   */
  protected mapCreateDataToRow(data: NewBotConfig): any {
    return {
      id: data.id || uuidv4(),
      tenant_id: data.tenant_id,
      monitored_channels: JSON.stringify(data.monitored_channels || []),
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
    };
  }

  /**
   * Map update data to database row format
   */
  protected mapUpdateDataToRow(data: BotConfigUpdate): any {
    const row: any = {};

    if (data.monitored_channels !== undefined) {
      row.monitored_channels = JSON.stringify(data.monitored_channels);
    }

    return row;
  }
}