# Requirements: Discord Question Analysis & Clustering System

## Introduction

### Feature Overview
A system to automatically extract, analyze, and group questions from Discord messages on a monthly basis. The system processes the previous month's data and stores results in PostgreSQL for historical tracking and trend analysis.

### Motivation
- Manual analysis of 250k+ Discord messages is time-prohibitive
- Full LLM processing would cost $10-50 per analysis run
- Community teams need data-driven insights into user questions
- Support documentation needs to address actual user concerns
- Historical data enables trend analysis over time

## User Stories

### Primary User Stories
1. **As a** community manager, **I want** to see the most common questions asked each month, **so that** I can create targeted FAQ content.

2. **As a** support team member, **I want** to understand question patterns and trends, **so that** I can proactively address recurring issues.

3. **As a** product manager, **I want** to identify user pain points from questions, **so that** I can prioritize feature improvements.

4. **As a** system administrator, **I want** automated monthly analysis of the previous month's data, **so that** I have consistent historical records.

### Secondary User Stories
5. **As a** developer, **I want** cost-efficient processing, **so that** we stay within operational budgets.

6. **As a** analyst, **I want** grouped similar questions stored in the database, **so that** I can query historical patterns.

7. **As a** analyst, **I want** to compare question trends month-over-month, **so that** I can identify emerging issues.

8. **As a** community manager, **I want** to view question analysis results in the static web interface, **so that** I don't need database access.

9. **As a** user, **I want** question insights available offline in the static archive, **so that** I can browse without API calls.

## Acceptance Criteria

### Functional Requirements

#### Data Processing Window
- REQ-001: WHEN executed on any day of month M, the system SHALL process all messages from month M-1
- REQ-002: The system SHALL determine the previous month's date range automatically
- REQ-003: IF executed on August 8th, THEN the system SHALL process July 1st 00:00:00 to July 31st 23:59:59
- REQ-004: The system SHALL handle month boundaries correctly (28/29/30/31 days)

#### Multi-Tenant Processing
- REQ-005: The system SHALL process each tenant's data independently
- REQ-006: The system SHALL generate separate question clusters per tenant
- REQ-007: WHEN monthly analysis runs, the system SHALL process all active tenants
- REQ-008: IF one tenant's analysis fails, THEN other tenants SHALL continue processing

#### Question Extraction
- REQ-009: The system SHALL identify questions within Discord messages
- REQ-010: WHEN a message contains interrogative content, the system SHALL classify it as a question
- REQ-011: The system SHALL handle informal text without proper punctuation
- REQ-012: The system SHALL process messages in multiple languages
- REQ-013: The system SHALL achieve >95% precision in question detection

#### Question Grouping
- REQ-014: The system SHALL group semantically similar questions together
- REQ-015: WHEN questions have similar meaning, the system SHALL place them in the same cluster
- REQ-016: The system SHALL NOT require predefined number of clusters
- REQ-017: IF a question doesn't fit any cluster, THEN the system SHALL mark it as an outlier

#### Data Storage
- REQ-018: The system SHALL store analysis results in PostgreSQL
- REQ-019: The system SHALL store cluster information including:
  - Analysis month/year
  - Cluster ID
  - Representative question
  - Cluster size
  - Sample questions (3-5 examples)
  - Tenant ID
- REQ-020: The system SHALL prevent duplicate analysis for the same tenant and month
- REQ-021: WHEN rerun for the same tenant/month, the system SHALL update existing records

#### Processing Performance
- REQ-022: The system SHALL process 250,000 messages per tenant within 1 hour
- REQ-023: The system SHALL operate primarily on CPU resources
- REQ-024: WHEN using external APIs, the system SHALL limit costs to <$5 per run across all tenants

#### Reporting and Display
- REQ-025: The system SHALL generate a monthly report per tenant from stored PostgreSQL data
- REQ-026: The report SHALL include cluster size and representative questions
- REQ-027: The report SHALL rank clusters by frequency within each tenant
- REQ-028: WHEN a cluster contains >10 questions, the system SHALL provide 3-5 examples

#### Static Export Integration
- REQ-029: The system SHALL include tenant-specific question clusters in the static JSON export
- REQ-030: The export SHALL generate a questions.json file containing that tenant's historical analysis
- REQ-031: WHEN questions.json exists, the frontend SHALL display an "Insights" tab
- REQ-032: The Insights tab SHALL show clusters ranked by frequency with sample questions
- REQ-033: Users SHALL be able to filter insights by analysis month
- REQ-034: The export SHALL include a flag in metadata.json indicating question analysis availability

### Non-Functional Requirements

#### Performance
- NFR-001: Question extraction SHALL process at least 100 messages per second
- NFR-002: The system SHALL use batch processing for efficiency
- NFR-003: Memory usage SHALL NOT exceed 8GB during processing

#### Data Management
- NFR-004: The system SHALL maintain referential integrity with existing tables
- NFR-005: Historical data SHALL be retained indefinitely for trend analysis
- NFR-006: Database queries SHALL use appropriate indexes for performance

#### Reliability
- NFR-007: The system SHALL handle malformed or empty messages gracefully
- NFR-008: IF processing fails, THEN the system SHALL save progress and be resumable
- NFR-009: The system SHALL log all errors with sufficient context for debugging

#### Maintainability
- NFR-010: The system SHALL use well-documented, pre-trained models
- NFR-011: Configuration SHALL be externalized and version-controlled
- NFR-012: The system SHALL support updating models without code changes

#### Usability
- NFR-013: Reports SHALL be human-readable without technical expertise
- NFR-014: The system SHALL provide progress indicators during processing
- NFR-015: Cluster labels SHALL be descriptive and meaningful
- NFR-016: The Insights tab SHALL load within 2 seconds
- NFR-017: The interface SHALL be responsive and work on mobile devices
- NFR-018: Question clusters SHALL be visually distinct with clear hierarchy

### Constraints

#### Technical Constraints
- CON-001: The system SHALL NOT require GPU resources for standard operation
- CON-002: The system SHALL NOT store personally identifiable information
- CON-003: The system SHALL use existing PostgreSQL database schema
- CON-004: The system SHALL extend existing tables rather than replacing them

#### Business Constraints
- CON-005: Monthly processing cost SHALL NOT exceed $5
- CON-006: Development SHALL use existing Node.js backend with new Python microservice
- CON-007: The system SHALL use Docker containers for deployment
- CON-008: Python service SHALL NOT have direct database access (security separation)

## Database Schema

### New Tables Required

```sql
-- Store question cluster analysis results
CREATE TABLE question_clusters (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  analysis_month DATE NOT NULL, -- First day of analyzed month
  cluster_id INTEGER NOT NULL,
  representative_text TEXT NOT NULL,
  cluster_label TEXT, -- Human-readable label generated by LLM
  member_count INTEGER NOT NULL,
  sample_messages TEXT[], -- Array of example questions
  message_ids UUID[], -- References to original messages
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, analysis_month, cluster_id)
);

-- Store individual question classifications for audit trail
CREATE TABLE question_classifications (
  id SERIAL PRIMARY KEY,
  message_id UUID REFERENCES messages(id) NOT NULL,
  is_question BOOLEAN NOT NULL,
  confidence FLOAT,
  cluster_id INTEGER,
  processed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id)
);
```

## Success Metrics

1. **Accuracy**: >95% precision in question identification
2. **Performance**: <1 hour processing time for monthly data
3. **Cost**: <$5 per monthly analysis run
4. **Coverage**: Successfully process >99% of messages without errors
5. **Usability**: Stakeholders can interpret reports without assistance
6. **Data Completeness**: 100% of processed months have stored results

## Out of Scope

- Real-time question detection
- Individual message UI classification
- Training custom ML models from scratch
- Processing images, videos, or attachments
- Answering or responding to questions
- Integration with Discord bot for live responses
- Processing current month's incomplete data
- Dynamic API endpoints for question data (frontend remains static)
- User-submitted question categorization

## Dependencies

### Infrastructure Dependencies
- Docker and Docker Compose for containerization
- PostgreSQL database (existing)
- Redis for job queue (existing)
- Network connectivity between containers

### Node.js Backend Dependencies
- BullMQ for job scheduling
- Fetch API for HTTP communication
- Kysely for database migrations

### Python Service Dependencies
- Python 3.12+ runtime
- uv package manager
- FastAPI for REST API
- ML models from HuggingFace hub
- Optional: LLM API for cluster labeling

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model accuracy on informal text | Medium | Use models trained on conversational data |
| Processing time exceeds limits | High | Implement efficient batching and caching |
| LLM costs exceed budget | Medium | Make LLM refinement optional |
| Multilingual support issues | Low | Use multilingual transformer models |
| Duplicate processing | Low | Implement idempotency checks |
| Data growth over time | Medium | Implement data retention policies |
| Python service unavailable | High | Health checks, automatic restarts, circuit breakers |
| Inter-service communication failure | Medium | Retry logic, timeout configuration |
| Model loading time on startup | Low | Cache models in Docker volume |

## Open Questions

1. Should we implement data retention policies (e.g., keep only 12 months)?
2. Do we need an API endpoint to trigger analysis on-demand?
3. Should cluster labels be manually reviewable/editable?
4. What's the preferred output format for reports (JSON, CSV, HTML)?
5. Should we support custom similarity thresholds?
6. How should we handle edited/deleted messages?