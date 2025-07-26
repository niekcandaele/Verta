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
 * Service interface for exporting tenant data to JSON files
 */
export interface DataExportService {
  /**
   * Export all active tenants' data to JSON files
   * @returns Array of export results for each tenant
   */
  exportAllTenants(): Promise<ExportResult[]>;

  /**
   * Export a specific tenant's data to JSON files
   * @param tenantId - The tenant ID to export
   * @returns Export result for the tenant
   */
  exportTenant(tenantId: string): Promise<ExportResult>;
}
