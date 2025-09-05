# Admin Interface and FAQ Requirements

## Problem Statement

The system currently lacks an administrative interface for managing question clusters that are automatically generated from Discord messages. Administrators need visibility into these clusters, the ability to add "golden answers" to them, and a way to expose answered questions as an FAQ to end users. Without this, valuable question-answer patterns remain hidden and cannot be leveraged to provide self-service support.

## Business Goals

- Enable administrators to manage question clusters through a web interface
- Provide canonical answers to frequently asked questions
- Create a public FAQ section for self-service support
- Reduce support burden by exposing common Q&As
- Leverage existing question clustering to provide value to end users

## Current State

The system currently:
- Automatically identifies and clusters questions from Discord threads using embeddings and TiDB vector search
- Stores question clusters with representative text, embeddings, and instance counts
- Tracks individual question instances linked to clusters
- Has basic authentication via API key for admin operations
- Has a static frontend that displays archived Discord content
- Uses basic auth for Bull Board queue monitoring

Pain points:
- No UI for administrators to view or manage question clusters
- No way to add canonical answers to frequently asked questions
- No public-facing FAQ section for users to find answers
- Golden answers cannot be attached to question clusters

## Functional Requirements

1. **Admin Interface Access**: System SHALL provide admin interface at `/admin` path within main frontend
2. **Authentication**: Admin interface SHALL require basic auth using ADMIN_API_KEY
3. **Cluster Visibility**: Admins SHALL see all question clusters with representative text, instance count, original messages/threads, and attachments
4. **Golden Answer Management**: Admins SHALL be able to add, edit, and remove golden answers for clusters (latest version only)
5. **Answer Persistence**: System SHALL persist golden answers in database linked to clusters (single version, no history)
6. **Public FAQ**: Public frontend SHALL display FAQ section showing clusters with golden answers
7. **FAQ Ordering**: FAQ SHALL display questions ordered by cluster size (most asked first)
8. **Public Access**: FAQ SHALL be accessible without authentication from main frontend
9. **Tenant Isolation**: Golden answers SHALL be tenant-specific with complete isolation
10. **Simple Display**: FAQ SHALL be displayed as simple list without categories, tags, or search
11. **Representative Text Editing**: Admins SHALL be able to edit representative text inline

## Non-Functional Requirements

- **Performance**: Admin interface should load clusters within 2 seconds
- **Security**: Admin interface must be protected by basic authentication at both API and frontend levels
- **Usability**: Golden answer editor should support basic markdown only (bold, italic, lists, links)
- **Compatibility**: Must work with existing TiDB vector database schema
- **Reliability**: System should handle concurrent admin operations gracefully
- **Accessibility**: FAQ should be readable and navigable by screen readers

## Constraints

- Must use existing authentication pattern (basic auth with ADMIN_API_KEY)
- Must integrate with existing Next.js frontend architecture
- Must extend existing database schema without breaking changes
- Must maintain compatibility with static export functionality
- Admin interface integrated into main frontend with route-based protection
- Limited to basic markdown for security reasons

## Success Criteria

- Administrators can view all question clusters and their details
- Administrators can add golden answers to clusters
- Administrators can edit representative text for clusters
- Public users can view FAQ with golden answers
- Authentication prevents unauthorized access to admin interface
- No performance degradation of existing features
- FAQ loads quickly for public users
- Golden answers are properly isolated by tenant