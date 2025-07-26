# Design Document

## Overview

The Tenant Static Archive feature generates fully static NextJS websites for each tenant that serve as comprehensive archives of all chat messages. The system consists of three main components: a backend data export job that aggregates tenant data into JSON files, a shared-types package for type safety across components, and a frontend NextJS application that builds static sites from the exported JSON data. This architecture ensures clean separation of concerns with the frontend having no direct database access.

## Architecture

### High-Level Architecture

```mermaid
graph TB
    A[Backend Export Job] --> B[Data Export Service]
    B --> C[(PostgreSQL)]
    B --> D[TenantBrandingRepo]
    B --> E[ChannelRepo]
    B --> F[MessageRepo]
    B --> G[JSON Files]
    G --> H[backend/data-export/tenant-slug/]
    
    I[Admin User] --> J[npm run build]
    J --> K[NextJS Builder]
    H --> K
    K --> L[Static Files]
    L --> M[frontend/out/]
    M --> N[Deploy to Static Host]
    N --> O[User Browser]
    
    P[shared-types] --> B
    P --> K
```

### Component Integration

The static site generation system consists of three integrated components:

- **Backend Data Export**: Service that runs in the backend, leveraging existing repositories to export tenant data
- **Shared Types Package**: Common TypeScript definitions used by both backend and frontend
- **Frontend NextJS App**: Reads exported JSON files and generates static sites without database access
- **Data Flow**: Backend exports → JSON files → Frontend reads → Static site output

## Components and Interfaces

### 1. Backend Data Export Service

**Purpose**: Backend service that exports all tenant data to structured JSON files for static site generation.

**Interface**:

```typescript
// backend/src/services/dataExport/DataExportService.ts
export interface DataExportService {
  exportAllTenants(): Promise<ExportResult[]>;
  exportTenant(tenantId: string): Promise<ExportResult>;
}

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
```

**Implementation**:

- Loops through all active tenants
- Uses existing repositories (ChannelRepository, MessageRepository, etc.)
- Fetches tenant branding from TenantBrandingRepository
- Generates paginated JSON files (1000 messages per file)
- Saves output to `backend/data-export/{tenant-slug}/` directory

### 2. Shared Types Package

**Purpose**: Provides common TypeScript type definitions shared between backend and frontend.

**Package Structure**:

```
shared-types/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── tenant.ts      // Tenant and branding types
    ├── channel.ts     // Channel types
    ├── message.ts     // Message, reaction, attachment types
    └── archive.ts     // Static archive data structures
```

**Key Types**:

```typescript
// shared-types/src/archive.ts
export interface ArchiveMetadata {
  tenant: TenantInfo;
  branding: TenantBranding | null;
  channels: ChannelSummary[];
  generatedAt: string;
  dataVersion: string;
}

export interface ChannelPageData {
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  page: number;
  totalPages: number;
  messages: ArchiveMessage[];
}

export interface ArchiveMessage {
  id: string;
  platformMessageId: string;
  anonymizedAuthorId: string;
  content: string;
  replyToId: string | null;
  platformCreatedAt: string;
  reactions: MessageReaction[];
  attachments: MessageAttachment[];
}
```

### 3. Tenant Data Structure

```typescript
// Main tenant metadata file
export interface TenantMetadata {
  tenant: {
    id: string;
    name: string;
    slug: string;
    platform: Platform;
  };
  branding: {
    logo: string | null; // Base64 encoded image data
    primaryColor: string; // Hex color code
    secondaryColor: string; // Hex color code
    accentColor: string; // Hex color code
  } | null;
  channels: Array<{
    id: string;
    name: string;
    type: ChannelType;
    parentChannelId: string | null;
    messageCount: number;
    totalPages: number;
  }>;
  generatedAt: Date;
}

// Individual channel page data (1000 messages per page)
export interface ChannelPageData {
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  page: number;
  totalPages: number;
  messages: Array<{
    id: string;
    platformMessageId: string;
    anonymizedAuthorId: string;
    content: string;
    replyToId: string | null;
    platformCreatedAt: string; // ISO string for JSON compatibility
    reactions: Array<{
      emoji: string;
      anonymizedUserId: string;
    }>;
    attachments: Array<{
      filename: string;
      fileSize: number; // JSON doesn't support bigint
      contentType: string;
      url: string;
    }>;
  }>;
}
```

### 3. NextJS Static Site Application

**Purpose**: Standalone NextJS application that generates static sites from aggregated tenant data.

**Key Features**:

- Server-side generation (SSG) with all data bundled at build time
- DaisyUI component library for consistent, responsive design
- Channel navigation with different layouts for text/forum/thread channels
- Message threading and reply visualization
- Dicebear avatar integration with consistent hashing
- Pagination with 1000 messages per page for optimal performance

**File Structure**:

```
frontend/
├── package.json
├── next.config.js
├── pages/
│   ├── index.tsx                    # Channel list
│   ├── channel/[id]/[page].tsx      # Channel messages (paginated)
│   └── _app.tsx                     # App wrapper
├── components/
│   ├── ChannelList.tsx      # DaisyUI menu and badge components
│   ├── MessageList.tsx      # DaisyUI card and timeline components
│   ├── Message.tsx          # DaisyUI chat bubble and badge components
│   ├── Avatar.tsx           # DaisyUI avatar component
│   ├── Pagination.tsx       # DaisyUI pagination component
│   └── Layout.tsx           # DaisyUI navbar and drawer components
├── lib/
│   ├── data.ts                      # Data loading utilities
│   └── avatars.ts                   # Dicebear integration
├── styles/
│   └── globals.css
└── out/                             # NextJS build output (gitignored)

backend/data-export/                 # Exported tenant data
└── {tenant-slug}/
    ├── metadata.json                # Tenant and channel metadata
    └── channels/
        ├── {channel-id}/
        │   ├── page-1.json          # First 1000 messages
        │   ├── page-2.json          # Next 1000 messages
        │   └── ...
        └── {another-channel-id}/
            ├── page-1.json
            └── ...
```

### 4. Avatar Generation Service

**Purpose**: Generates consistent Dicebear avatars using the "shapes" style via the NPM library.

**Implementation**:

```typescript
import { createAvatar } from '@dicebear/core';
import { shapes } from '@dicebear/collection';
import { createHash } from 'crypto';

export class AvatarService {
  static generateAvatarSvg(anonymizedUserId: string): string {
    // Use anonymized user ID as seed for consistent avatars
    const seed = createHash('md5').update(anonymizedUserId).digest('hex');

    const avatar = createAvatar(shapes, {
      seed,
      // Additional styling options can be configured here
    });

    return avatar.toString();
  }

  static generateAvatarDataUrl(anonymizedUserId: string): string {
    const svg = this.generateAvatarSvg(anonymizedUserId);
    const base64 = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
  }
}
```


## Data Models

### TenantBrandingRepository

**Purpose**: Manages tenant branding configuration for white labeling static archives.

**Interface**:

```typescript
// backend/src/repositories/tenant/TenantBrandingRepository.ts
export interface TenantBrandingRepository {
  findByTenantId(tenantId: string): Promise<TenantBranding | null>;
  create(data: CreateTenantBrandingData): Promise<TenantBranding>;
  update(id: string, data: UpdateTenantBrandingData): Promise<TenantBranding>;
  delete(id: string): Promise<void>;
}
```

### White Labeling Configuration

Tenants can customize their static archive appearance through branding configuration stored in the database:

```typescript
export interface TenantBranding {
  id: string;
  tenantId: string;
  logo: string | null; // Base64 encoded image data
  primaryColor: string; // Hex color code
  secondaryColor: string; // Hex color code
  accentColor: string; // Hex color code
  createdAt: Date;
  updatedAt: Date;
}
```

### Data Export and Build Workflow

The static site generation consists of two phases:

**Phase 1: Backend Data Export**
```bash
# Run from backend directory
npm run export:tenants   # Exports all active tenants
# OR
npm run export:tenant <tenantId>  # Export specific tenant

# Data is exported to backend/data-export/{tenant-slug}/
```

**Phase 2: Frontend Static Site Generation**
```bash
# Run from frontend directory
npm run build   # Builds static site from exported data
npm run export  # Exports to static files

# Static files are now available in frontend/out/
```

### Static Site Data Schema

The static site will consume multiple JSON files with a paginated structure:

**metadata.json** (Main tenant and channel metadata):

```json
{
  "tenant": {
    "id": "uuid",
    "name": "Tenant Name",
    "slug": "tenant-slug",
    "platform": "discord"
  },
  "branding": {
    "logo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "primaryColor": "#3b82f6",
    "secondaryColor": "#64748b",
    "accentColor": "#10b981"
  },
  "channels": [
    {
      "id": "channel-uuid",
      "name": "general",
      "type": "text",
      "parentChannelId": null,
      "messageCount": 150,
      "totalPages": 3
    }
  ],
  "generatedAt": "2024-01-01T12:00:00Z"
}
```

**channels/{channel-id}/page-{n}.json** (Channel message pages, 250 messages each):

```json
{
  "channelId": "channel-uuid",
  "channelName": "general",
  "channelType": "text",
  "page": 1,
  "totalPages": 3,
  "messages": [
    {
      "id": "message-uuid",
      "platformMessageId": "discord-message-id",
      "anonymizedAuthorId": "anon-user-123",
      "content": "Hello world!",
      "replyToId": null,
      "platformCreatedAt": "2024-01-01T12:00:00Z",
      "reactions": [
        {
          "emoji": "👍",
          "anonymizedUserId": "anon-user-456"
        }
      ],
      "attachments": []
    }
  ]
}
```

## Error Handling

### Script Execution Failures

- **Invalid Tenant ID**: Display clear error message and exit gracefully
- **Database Connection Errors**: Log connection details and suggest troubleshooting steps
- **Data Fetching Errors**: Log specific queries that failed, continue with partial data if possible
- **File System Errors**: Check write permissions, ensure data directory exists
- **Out of Memory**: Process data in smaller batches for large tenants

### Build Failures

- **Missing Data Files**: Verify data aggregation completed successfully
- **NextJS Build Errors**: Display build logs with clear error messages
- **Template Errors**: Validate component integrity during development

### Error Handling in Scripts

```typescript
// Example error handling in tenantDataAggregator.ts
try {
  const tenant = await getTenant(tenantId);
  if (!tenant) {
    console.error(`Error: Tenant with ID '${tenantId}' not found`);
    process.exit(1);
  }
  // Continue processing...
} catch (error) {
  console.error('Failed to connect to database:', error);
  console.error('Please check your DATABASE_URL environment variable');
  process.exit(1);
}
```

### Graceful Degradation

- If tenant has no data, generate empty archive with appropriate messaging
- If specific channels fail to process, continue with remaining channels
- If avatar generation fails, use default placeholder avatars
- If build fails completely, preserve previous version if available

## Testing Strategy

### Unit Tests

- **Data Aggregator**: Test data fetching and transformation logic
- **Avatar Service**: Test consistent avatar generation
- **Worker Logic**: Test job processing with mocked dependencies
- **Template Components**: Test React components with sample data

### Integration Tests

- **End-to-End Generation**: Test complete flow from job trigger to static site
- **Database Integration**: Test data fetching with real database
- **NextJS Build**: Test build process with various data scenarios
- **Nginx Routing**: Test static site serving with different tenant slugs

### Test Data Scenarios

- Empty tenant (no channels/messages)
- Single channel with few messages
- Multiple channels with threading
- Large dataset with pagination requirements
- Various channel types (text, forum, thread)
- Messages with attachments and reactions

### Performance Testing

- **Build Time**: Measure generation time for various data sizes
- **Memory Usage**: Monitor memory consumption during build process
- **Concurrent Jobs**: Test multiple static site generations simultaneously
- **Static Site Performance**: Measure load times and navigation speed

## Security Considerations

### Data Privacy

- All user IDs remain anonymized in static sites
- No platform-specific identifiers exposed in generated sites
- Attachment URLs may need proxy/caching strategy for privacy

### Access Control

- Static sites are publicly accessible once generated
- No authentication required for viewing archives
- Consider tenant-level privacy settings for future enhancement

### File System Security

- Generated files stored in isolated tenant directories
- Proper file permissions to prevent cross-tenant access
- Input validation for tenant slugs to prevent directory traversal

## Performance Optimization

### Build Performance

- **Full Regeneration**: Always perform complete rebuilds to maintain simplicity and consistency
- **Parallel Processing**: Process multiple channels concurrently
- **Memory Management**: Stream large datasets to avoid memory issues
- **Build Optimization**: Optimize NextJS build process for faster generation

### Static Site Performance

- **Code Splitting**: Split JavaScript bundles by route
- **Image Optimization**: Optimize avatar images and attachments
- **Lazy Loading**: Implement virtual scrolling for large message lists

### Storage Optimization

- **Compression**: Gzip static assets
- **Asset Deduplication**: Share common assets between tenant sites
- **Cleanup**: Remove old generated sites based on retention policy
