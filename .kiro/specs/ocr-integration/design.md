# OCR Integration Design

## Architecture Overview

The OCR system integrates with the existing ML service and message processing pipeline. It uses OpenRouter's free vision models for text extraction, BullMQ for job management, and stores results in a dedicated database table.

## Key Components

### ML Service (Python)
- **OpenRouter OCR Model**: Uses free vision models (Gemini, Llama) with retry logic
- **FastAPI Endpoints**: `/api/ml/ocr` for single images, `/api/ml/ocr/batch` for multiple
- **Exponential Backoff**: Handles rate limits with delays [1, 2, 4, 8, 16, 32] seconds
- **Model Rotation**: Tries multiple free models if one fails

### Backend Service (TypeScript)
- **OCR Worker**: Processes OCR jobs from BullMQ queue
- **OCR Queue**: Manages job processing with retry logic
- **OCR Repository**: Handles database operations for OCR results
- **ML Client Service**: Circuit breaker pattern for resilient API calls

### Database Schema
```sql
CREATE TABLE ocr_results (
  id UUID PRIMARY KEY,
  attachment_id UUID REFERENCES message_attachments(id) ON DELETE CASCADE,
  model_version VARCHAR(100),
  extracted_text TEXT,
  confidence FLOAT,
  status ENUM('pending', 'processing', 'completed', 'failed'),
  error_message TEXT,
  retry_count INT DEFAULT 0,
  processing_time_ms INT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE KEY unique_attachment (attachment_id)
)
```

## Processing Flow

1. **Message Sync**: Channel sync worker detects image attachments
2. **Job Queue**: Creates OCR job with attachment details
3. **OCR Worker**: Picks up job, calls ML service
4. **ML Service**: Extracts text using vision models
5. **Storage**: Saves results to database
6. **Question Processing**: Combines OCR text with message content

## Integration Points

### Channel Sync Worker
```typescript
// Queue OCR for image attachments
if (isImageContentType(attachment.contentType)) {
  await addOcrJob({
    tenantId,
    messageId,
    attachmentId,
    attachmentUrl,
    attachmentFilename
  });
}
```

### Question Processing Service
```typescript
// Fetch and combine OCR text
const ocrTextMap = await fetchOcrResultsForMessages(messages);
const combinedText = `${message.content} ${ocrText}`.trim();
```

## Error Handling

### Retry Strategy
- **Immediate**: 3 attempts with exponential backoff
- **Scheduled**: Hourly job retries failed results (up to 10 times)
- **Missing OCR**: Queues jobs for images without results

### Circuit Breaker
- **Threshold**: 10 failures before opening
- **Reset Time**: 5 minutes
- **Half-Open**: 3 test attempts before closing

## Performance Optimizations

### Batch Processing
- Process up to 2000 images per retry cycle
- Concurrent OCR workers (2 parallel jobs)
- Bulk database operations for efficiency

### Caching
- 15-minute WebFetch cache for repeated URLs
- Reuse platform adapters across jobs
- Connection pooling for database queries

## Security Considerations

- Image validation before processing
- API key authentication for ML service
- No storage of sensitive image data
- Cascade deletes maintain referential integrity

## Help Channel Context

The OCR prompt focuses on troubleshooting context:
- Identifies interface type (terminal, browser, game)
- Describes error states and situations
- Extracts all visible text exactly as shown
- Provides relevant context for Q&A assistance