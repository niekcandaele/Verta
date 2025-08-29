import { Kysely } from 'kysely';
import type {
  BaseCrudRepository,
  PaginatedResult,
  PaginationOptions,
} from './types.js';

/**
 * Abstract base class for CRUD repository implementations
 * Provides common database operations using Kysely ORM
 */
export abstract class BaseCrudRepositoryImpl<T, CreateData, UpdateData>
  implements BaseCrudRepository<T, CreateData, UpdateData>
{
  constructor(
    protected readonly db: Kysely<any>,
    protected readonly tableName: string
  ) {}

  /**
   * Find all entities with pagination and sorting
   */
  async findAll(pagination?: PaginationOptions): Promise<PaginatedResult<T>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = pagination || {};

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Execute count and data queries in parallel for performance
    const [dataQuery, countQuery] = await Promise.all([
      // Data query with pagination and sorting
      this.db
        .selectFrom(this.tableName)
        .selectAll()
        .orderBy(sortBy as any, sortOrder)
        .limit(limit)
        .offset(offset)
        .execute(),
      // Count query for total items
      this.db
        .selectFrom(this.tableName)
        .select((eb) => eb.fn.count('id').as('count'))
        .executeTakeFirst(),
    ]);

    // Parse count result
    const total = Number(countQuery?.count || 0);
    const totalPages = Math.ceil(total / limit);

    // Map database rows to entities
    const data = dataQuery.map((row) => this.mapRowToEntity(row));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Find a single entity by ID
   */
  async findById(id: string): Promise<T | null> {
    const row = await this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where('id' as any, '=', id)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Create a new entity
   */
  async create(data: CreateData): Promise<T> {
    const insertData = this.mapCreateDataToRow(data);

    await this.db
      .insertInto(this.tableName)
      .values(insertData)
      .execute();

    // MySQL doesn't support RETURNING, so fetch the created row
    const row = await this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where('id' as any, '=', insertData.id)
      .executeTakeFirstOrThrow();

    return this.mapRowToEntity(row);
  }

  /**
   * Update an existing entity
   */
  async update(id: string, data: UpdateData): Promise<T | null> {
    const updateData = this.mapUpdateDataToRow(data);

    // Add updated_at timestamp
    const dataWithTimestamp = {
      ...updateData,
      updated_at: new Date().toISOString(),
    };

    await this.db
      .updateTable(this.tableName)
      .set(dataWithTimestamp as any)
      .where('id' as any, '=', id)
      .execute();

    // MySQL doesn't support RETURNING, so fetch the updated row
    const row = await this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where('id' as any, '=', id)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Delete an entity by ID
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom(this.tableName)
      .where('id' as any, '=', id)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  /**
   * Map a database row to the entity type
   * Must be implemented by concrete repository classes
   */
  protected abstract mapRowToEntity(row: any): T;

  /**
   * Map create data to database row format
   * Must be implemented by concrete repository classes
   */
  protected abstract mapCreateDataToRow(data: CreateData): any;

  /**
   * Map update data to database row format
   * Must be implemented by concrete repository classes
   */
  protected abstract mapUpdateDataToRow(data: UpdateData): any;
}
