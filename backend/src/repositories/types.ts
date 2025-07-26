/**
 * Repository layer type definitions
 */

/**
 * Options for paginating query results
 */
export interface PaginationOptions {
  /** Page number (1-indexed) */
  page?: number;
  /** Number of items per page */
  limit?: number;
  /** Column to sort by */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Metadata for paginated results
 */
export interface PaginationMeta {
  /** Current page number */
  page: number;
  /** Items per page */
  limit: number;
  /** Total number of items */
  total: number;
  /** Total number of pages */
  totalPages: number;
}

/**
 * Container for paginated query results
 */
export interface PaginatedResult<T> {
  /** Array of items for the current page */
  data: T[];
  /** Pagination metadata */
  pagination: PaginationMeta;
}

/**
 * Base interface for CRUD repository operations
 */
export interface BaseCrudRepository<T, CreateData, UpdateData> {
  /**
   * Find all entities with optional pagination
   */
  findAll(pagination?: PaginationOptions): Promise<PaginatedResult<T>>;

  /**
   * Find a single entity by ID
   * @returns The entity or null if not found
   */
  findById(id: string): Promise<T | null>;

  /**
   * Create a new entity
   * @returns The created entity
   */
  create(data: CreateData): Promise<T>;

  /**
   * Update an existing entity
   * @returns The updated entity or null if not found
   */
  update(id: string, data: UpdateData): Promise<T | null>;

  /**
   * Delete an entity by ID
   * @returns true if deleted, false if not found
   */
  delete(id: string): Promise<boolean>;
}
