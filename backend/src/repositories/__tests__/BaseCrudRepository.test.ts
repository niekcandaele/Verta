import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Kysely, sql } from 'kysely';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { PostgresDialect } from 'kysely';
import { BaseCrudRepositoryImpl } from '../BaseCrudRepository.js';
import type { Database } from '../../database/types.js';

// Test entity interface
interface TestEntity {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Test table interface
interface TestTable {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Test database interface
interface TestDatabase extends Database {
  test_entities: TestTable;
}

// Create/Update DTOs
interface CreateTestEntity {
  name: string;
  description?: string | null;
  active?: boolean;
}

interface UpdateTestEntity {
  name?: string;
  description?: string | null;
  active?: boolean;
}

// Concrete implementation for testing
class TestRepository extends BaseCrudRepositoryImpl<
  TestEntity,
  CreateTestEntity,
  UpdateTestEntity
> {
  constructor(db: Kysely<TestDatabase>) {
    super(db as any, 'test_entities');
  }

  protected mapRowToEntity(row: any): TestEntity {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      active: row.active,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  protected mapCreateDataToRow(data: CreateTestEntity): any {
    return {
      id: sql`gen_random_uuid()`,
      name: data.name,
      description: data.description ?? null,
      active: data.active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  protected mapUpdateDataToRow(data: UpdateTestEntity): any {
    const row: any = {};
    if (data.name !== undefined) row.name = data.name;
    if (data.description !== undefined) row.description = data.description;
    if (data.active !== undefined) row.active = data.active;
    return row;
  }
}

describe('BaseCrudRepository', () => {
  let container: any;
  let db: Kysely<TestDatabase>;
  let repository: TestRepository;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

    // Create database connection
    const pool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getPassword(),
    });

    db = new Kysely<TestDatabase>({
      dialect: new PostgresDialect({ pool }),
    });

    // Create test table
    await db.schema
      .createTable('test_entities')
      .ifNotExists()
      .addColumn('id', 'uuid', (col) =>
        col.primaryKey().defaultTo(sql`gen_random_uuid()`)
      )
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('created_at', 'timestamp', (col) =>
        col.notNull().defaultTo(sql`now()`)
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        col.notNull().defaultTo(sql`now()`)
      )
      .execute();

    // Create repository instance
    repository = new TestRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
    await container.stop();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await db.deleteFrom('test_entities').execute();
  });

  describe('create', () => {
    it('should create a new entity', async () => {
      const createData: CreateTestEntity = {
        name: 'Test Entity',
        description: 'Test description',
        active: true,
      };

      const entity = await repository.create(createData);

      expect(entity).toMatchObject({
        name: 'Test Entity',
        description: 'Test description',
        active: true,
      });
      expect(entity.id).toBeDefined();
      expect(entity.created_at).toBeInstanceOf(Date);
      expect(entity.updated_at).toBeInstanceOf(Date);
    });

    it('should create entity with default values', async () => {
      const createData: CreateTestEntity = {
        name: 'Test Entity',
      };

      const entity = await repository.create(createData);

      expect(entity).toMatchObject({
        name: 'Test Entity',
        description: null,
        active: true,
      });
    });
  });

  describe('findById', () => {
    it('should find entity by id', async () => {
      const created = await repository.create({ name: 'Test Entity' });

      const found = await repository.findById(created.id);

      expect(found).toEqual(created);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000'
      );

      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      // Create test data
      for (let i = 1; i <= 15; i++) {
        await repository.create({
          name: `Entity ${i}`,
          active: i % 2 === 0,
        });
        // Small delay to ensure different timestamps
        await new Promise((resolve) => global.setTimeout(resolve, 10));
      }
    });

    it('should return paginated results with default pagination', async () => {
      const result = await repository.findAll();

      expect(result.data).toHaveLength(10);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 15,
        totalPages: 2,
      });
    });

    it('should support custom pagination', async () => {
      const result = await repository.findAll({
        page: 2,
        limit: 5,
      });

      expect(result.data).toHaveLength(5);
      expect(result.pagination).toEqual({
        page: 2,
        limit: 5,
        total: 15,
        totalPages: 3,
      });
    });

    it('should support sorting', async () => {
      const resultAsc = await repository.findAll({
        sortBy: 'name',
        sortOrder: 'asc',
      });

      const resultDesc = await repository.findAll({
        sortBy: 'name',
        sortOrder: 'desc',
      });

      expect(resultAsc.data[0].name).toBe('Entity 1');
      expect(resultDesc.data[0].name).toBe('Entity 9');
    });

    it('should handle empty results', async () => {
      await db.deleteFrom('test_entities').execute();

      const result = await repository.findAll();

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('update', () => {
    it('should update an existing entity', async () => {
      const created = await repository.create({
        name: 'Original Name',
        description: 'Original Description',
      });

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => global.setTimeout(resolve, 100));

      const updated = await repository.update(created.id, {
        name: 'Updated Name',
      });

      expect(updated).toMatchObject({
        id: created.id,
        name: 'Updated Name',
        description: 'Original Description',
      });
      expect(updated!.updated_at.getTime()).toBeGreaterThan(
        created.updated_at.getTime()
      );
    });

    it('should return null for non-existent id', async () => {
      const updated = await repository.update(
        '00000000-0000-0000-0000-000000000000',
        { name: 'Updated' }
      );

      expect(updated).toBeNull();
    });

    it('should handle null values in update', async () => {
      const created = await repository.create({
        name: 'Test',
        description: 'Has description',
      });

      const updated = await repository.update(created.id, {
        description: null,
      });

      expect(updated!.description).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an existing entity', async () => {
      const created = await repository.create({ name: 'To Delete' });

      const deleted = await repository.delete(created.id);
      expect(deleted).toBe(true);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent id', async () => {
      const deleted = await repository.delete(
        '00000000-0000-0000-0000-000000000000'
      );

      expect(deleted).toBe(false);
    });
  });
});
