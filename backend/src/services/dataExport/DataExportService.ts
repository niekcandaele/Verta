/**
 * Data export service interface
 */

export interface ExportResult {
  tenantId: string;
  tenantSlug: string;
  channelsExported: number;
  messagesExported: number;
  filesGenerated: number;
  exportPath: string;
  executionTimeMs: number;
  errors: string[];
}

/**
 * Progress callback for export operations
 */
export type ExportProgressCallback = (progress: number) => Promise<void>;

/**
 * Service interface for exporting tenant data to JSON files
 */
export interface DataExportService {
  /**
   * Export all active tenants' data to JSON files
   * @param onProgress - Optional callback to report progress (0-100)
   * @returns Array of export results for each tenant
   */
  exportAllTenants(
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult[]>;

  /**
   * Export a specific tenant's data to JSON files
   * @param tenantId - The tenant ID to export
   * @param onProgress - Optional callback to report progress (0-100)
   * @returns Export result for the tenant
   */
  exportTenant(
    tenantId: string,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult>;
}
