# Implementation Plan

## Phase 1: Foundation & Data Export

- [x] 1. Set up database schema for tenant branding configuration
  - Create migration for tenant_branding table with logo, colors, and tenant relationship
  - Add foreign key constraint to tenants table
  - Include proper indexes for efficient tenant lookups
  - _Requirements: 8.1, 8.2_

- [x] 2. Restructure project into backend and frontend directories
  - Move all existing code to backend/ directory
  - Keep specs at root level
  - Update documentation to reflect new structure
  - _Requirements: Project organization_

- [x] 3. Create shared-types package
  - Initialize new TypeScript package in shared-types/ directory
  - Define tenant, channel, message, and archive types
  - Configure package.json for use by both backend and frontend
  - Set up build process for type definitions
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 4. Update existing backend to use shared-types
  - Update TenantRepository to use shared types
  - Update ChannelRepository to use shared types
  - Update MessageRepository to use shared types
  - Update all related services to use shared types
  - Ensure type consistency across backend codebase
  - _Requirements: 10.2, 10.4_

- [x] 5. Implement tenant branding repository
  - Create TenantBrandingRepository interface in backend
  - Implement repository using Kysely following existing patterns
  - Add CRUD operations for tenant branding configuration
  - Add validation for color hex codes and base64 logo data
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 6. Implement backend data export service
  - Create DataExportService in backend/src/services/dataExport/
  - Implement exportAllTenants() method to loop through active tenants
  - Implement exportTenant() method for individual tenant export
  - Use existing repositories to fetch all tenant data
  - Include tenant branding data in export
  - Output to _data/data-export/{tenant-slug}/
  - Create paginated JSON files (1000 messages per file)
  - Ensure exported files have open permissions (chmod 777)
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 7. Add HTTP API endpoints for export
  - Create POST /api/export/all-tenants endpoint
  - Create POST /api/export/tenant/:tenantId endpoint
  - Create GET /api/export/status/:jobId endpoint
  - Integrate with BullMQ for job tracking
  - Create ExportJobProcessor for async processing
  - Implement job status tracking and reporting
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 12.1, 12.2_

- [x] 8. Add export npm scripts
  - Add "export:tenants" script that calls HTTP endpoint
  - Add "export:tenant" script that calls HTTP endpoint
  - Add "export:status" script to check job status
  - Create simple CLI wrapper scripts
  - _Requirements: 11.5_

- [x] 9. Implement error handling and retry logic
  - Add retry mechanism (3 retries with exponential backoff)
  - Implement proper error logging and reporting
  - Handle partial export failures gracefully
  - Store error details in job metadata
  - _Requirements: 11.6, 12.3_

## Phase 2: Basic Frontend & Data Verification

- [x] 10. Create minimal NextJS project
  - Initialize new NextJS project in frontend/ directory
  - Configure TypeScript and static export in next.config.js
  - Install shared-types package as dependency
  - Set up basic project structure
  - _Requirements: 1.1, 1.2_

- [x] 11. Create basic data loading
  - Create data loading utilities in frontend/lib/data.ts
  - Implement functions to read from _data/data-export/
  - Add tenant selection based on build parameter
  - Create basic error handling for missing files
  - _Requirements: 4.7, 5.1_

- [x] 12. Build minimal pages to verify data
  - Create basic index.tsx that lists channels (no styling)
  - Create channel/[id]/[page].tsx that dumps messages as JSON
  - Set up getStaticProps and getStaticPaths
  - Verify data is loading correctly from exported files
  - _Requirements: 2.1, 2.2_

- [x] 13. Add tenant-specific build scripts
  - Create npm run build:tenant <tenant-slug> script
  - Create npm run export:tenant <tenant-slug> script
  - Configure output to _data/next-export/{tenant-slug}/
  - Test building multiple tenants separately
  - _Requirements: 5.1, 5.2, 5.6_

## Phase 3: Styling & Components

- [x] 14. Install and configure DaisyUI
  - Install Tailwind CSS and DaisyUI
  - Configure tailwind.config.js with DaisyUI plugin
  - Set up global styles with default theme
  - Add responsive design utilities
  - _Requirements: 6.4, 6.5_

- [x] 15. Create basic layout and navigation
  - Create Layout component with header
  - Add sidebar for channel navigation
  - Implement responsive design
  - Apply default theme colors
  - _Requirements: 2.1_

- [x] 16. Build channel list component
  - Create ChannelList with DaisyUI menu
  - Add channel type indicators
  - Show message counts as badges
  - Group channels by type
  - _Requirements: 2.1, 7.4_

- [x] 17. Create message display components
  - Build MessageList component
  - Create Message component with basic styling
  - Add timestamps and author display (no avatars yet)
  - Implement pagination controls
  - _Requirements: 2.2, 2.3, 6.3_

## Phase 4: Features & Polish

- [x] 18. Implement avatar generation
  - Install @dicebear/core and @dicebear/collection packages
  - Create avatars.ts utility in frontend/lib/
  - Use anonymized user IDs directly as seeds
  - Integrate avatars into Message components
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 19. Add white labeling support
  - Read branding data from metadata.json
  - Implement dynamic theming using CSS variables
  - Apply tenant logo in header
  - Use brand colors throughout components
  - Implement default theme fallback
  - _Requirements: 8.4, 8.5, 8.6, 8.7_

- [ ] 20. Implement channel type layouts
  - Create different layouts for text channels
  - Add forum channel layout with post grouping
  - Implement thread channel with hierarchy
  - Apply appropriate styling for each type
  - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [ ] 21. Add message features
  - Display emoji reactions with counts
  - Show attachments with file info
  - Implement reply relationships
  - Add thread expansion/collapse
  - _Requirements: 2.4, 2.5, 9.1, 9.2, 9.3_

## Phase 5: Testing & Documentation

- [ ] 22. Add error handling
  - Handle missing JSON files gracefully
  - Add validation for data integrity
  - Create fallback UI for missing data
  - Improve error messages
  - _Requirements: 4.6, 4.7_

- [ ] 23. Write tests
  - Test TenantBrandingRepository implementation
  - Test data export service logic
  - Test job status tracking
  - Test React components with sample data
  - Add integration tests for full workflow
  - _Requirements: Testing_

- [ ] 24. Create documentation
  - Write README for shared-types package
  - Document backend export process
  - Create frontend build guide
  - Add deployment instructions
  - Document shared volume requirements
  - _Requirements: Documentation_

- [ ] 25. Handle edge cases
  - Test empty tenants with no data
  - Handle very large channels
  - Test with missing/corrupted files
  - Verify performance with large datasets
  - Test file permission issues
  - _Requirements: 4.6, 6.1_

- [ ] 26. Final preparation
  - Complete end-to-end testing
  - Update all documentation
  - Create deployment checklist
  - Prepare for production use
  - _Requirements: All_