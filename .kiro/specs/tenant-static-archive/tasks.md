# Implementation Plan

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

- [ ] 3. Implement tenant branding repository
  - Create TenantBrandingRepository interface in backend
  - Implement repository using Kysely following existing patterns
  - Add CRUD operations for tenant branding configuration
  - Add validation for color hex codes and base64 logo data
  - _Requirements: 8.1, 8.2, 8.3_

- [ ] 4. Create shared-types package
  - Initialize new TypeScript package in shared-types/ directory
  - Define tenant, channel, message, and archive types
  - Configure package.json for use by both backend and frontend
  - Set up build process for type definitions
  - _Requirements: 10.1, 10.2, 10.3_

- [ ] 5. Implement backend data export service
  - Create DataExportService in backend/src/services/dataExport/
  - Implement exportAllTenants() method to loop through active tenants
  - Implement exportTenant() method for individual tenant export
  - Use existing repositories to fetch all tenant data
  - Include tenant branding data in export
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 6. Create data export file generation logic
  - Implement JSON file generation with 1000 messages per file
  - Create directory structure: backend/data-export/{tenant-slug}/
  - Generate metadata.json with tenant info and channel summaries
  - Create paginated channel message files
  - Handle large datasets with streaming/batching
  - _Requirements: 4.3, 4.4, 4.5_

- [ ] 7. Add backend export scripts
  - Add "export:tenants" script to backend package.json
  - Add "export:tenant" script for individual tenant export
  - Create CLI entry points for the export commands
  - Add progress logging during export
  - _Requirements: 4.1_

- [ ] 8. Create frontend NextJS project
  - Initialize new NextJS project in frontend/ directory
  - Configure TypeScript and static export in next.config.js
  - Install shared-types package as dependency
  - Set up project structure without database dependencies
  - _Requirements: 1.1, 1.2_

- [ ] 9. Configure data loading from JSON files
  - Create data loading utilities in frontend/lib/data.ts
  - Implement functions to read from backend/data-export/
  - Add logic to select tenant based on build configuration
  - Handle missing data gracefully
  - _Requirements: 4.7, 5.1_

- [ ] 10. Install and configure DaisyUI
  - Install Tailwind CSS and DaisyUI
  - Configure tailwind.config.js with DaisyUI plugin
  - Set up global styles with DaisyUI theme
  - Add responsive design utilities
  - _Requirements: 6.4, 6.5_

- [ ] 11. Build avatar generation service using Dicebear
  - Install @dicebear/core and @dicebear/collection packages
  - Create avatars.ts utility in frontend/lib/
  - Implement consistent avatar generation using anonymized user IDs
  - Configure shapes style with appropriate options
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 12. Create NextJS pages and routing
  - Implement index.tsx for channel list page
  - Create channel/[id]/[page].tsx for paginated messages
  - Set up getStaticProps for data loading from JSON files
  - Configure getStaticPaths for all routes based on exported data
  - _Requirements: 2.1, 2.2_

- [ ] 13. Build React components with DaisyUI
  - Create Layout component with navigation
  - Implement ChannelList with menu and badges
  - Build MessageList with appropriate styling for channel types
  - Create Message component with chat bubbles
  - Add Pagination component
  - _Requirements: 2.3, 7.1, 7.2, 7.3_

- [ ] 14. Implement white labeling support
  - Read branding data from metadata.json
  - Implement dynamic theming using CSS variables
  - Apply tenant logo in header
  - Use brand colors throughout components
  - Add fallback for default branding
  - _Requirements: 8.4, 8.5, 8.6, 8.7_

- [ ] 15. Implement message threading and replies
  - Add reply relationship visualization
  - Create thread expansion/collapse functionality
  - Style nested messages appropriately
  - Maintain context in paginated views
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 16. Add comprehensive error handling
  - Handle missing JSON files gracefully
  - Add validation for data integrity
  - Create fallback UI for missing data
  - Log errors appropriately
  - _Requirements: 4.6, 4.7_

- [ ] 17. Create documentation
  - Write README.md for shared-types package
  - Document backend export process
  - Create frontend build and deployment guide
  - Include troubleshooting section
  - _Requirements: Documentation_

- [ ] 18. Write unit tests
  - Test TenantBrandingRepository implementation
  - Test data export service logic
  - Add tests for avatar generation consistency
  - Test React components with sample data
  - Verify pagination logic
  - _Requirements: Testing_

- [ ] 19. Create integration tests
  - Test full workflow from data export to static build
  - Verify JSON file generation and structure
  - Test static site functionality with exported data
  - Check performance with large datasets
  - _Requirements: 5.4, 6.1_

- [ ] 20. Optimize build performance
  - Implement efficient data loading strategies
  - Optimize image loading and avatars
  - Add code splitting for better performance
  - Minimize bundle sizes
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 21. Handle edge cases
  - Empty tenants with no data
  - Very large channels with thousands of messages
  - Missing or corrupted JSON files
  - Attachment URLs that have expired
  - _Requirements: 4.6_

- [ ] 22. Final testing and documentation
  - Complete end-to-end testing
  - Update all documentation
  - Create deployment checklist
  - Prepare for production use
  - _Requirements: All_