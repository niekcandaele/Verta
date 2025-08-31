# OCR Integration Requirements

## Problem Statement

Discord messages contain images with text that the system can't extract or process. This limits question classification, clustering, and rephrasing features. Screenshots, error messages, and diagrams contain valuable information that's currently ignored.

## Business Goals

- Extract text from 95% of image attachments automatically
- Improve question identification accuracy by 10% for threads with images
- Process images within 5 seconds on CPU-only infrastructure
- Enable text extraction without external API dependencies
- Maintain backward compatibility with existing systems

## Functional Requirements

1. **Image Processing**: Extract text from PNG, JPG, JPEG, GIF, WebP attachments
2. **Queue Integration**: Process images asynchronously via BullMQ job queue
3. **Storage**: Store OCR results in versioned database table
4. **Text Combination**: Merge message text with OCR-extracted text for ML processing
5. **Retry Logic**: Retry failed OCR operations up to 10 times
6. **Batch Processing**: Support concurrent processing of multiple images
7. **Help Context**: Include visual context relevant for troubleshooting
8. **Automatic Retry**: Process failed OCR results hourly via scheduled job

## Non-Functional Requirements

- **Performance**: Complete OCR within 5 seconds per image on CPU
- **Accuracy**: Minimum 85% character accuracy for clear text
- **Security**: Validate image files before processing
- **Scalability**: Handle 2000+ images per batch
- **Reliability**: Circuit breaker pattern for ML service resilience
- **Integration**: Seamless integration with question processing pipeline

## Constraints

- Must use self-hosted models (OpenRouter free tier)
- Run efficiently on CPU-only hardware
- Integrate with existing ML service architecture
- Database changes must support cascade deletes
- Handle rate limiting and service failures gracefully

## Success Criteria

- ✅ OCR endpoint functional in ML service
- ✅ Database schema supports OCR results with foreign keys
- ✅ Images queued automatically during message sync
- ✅ Failed OCR results retry automatically
- ✅ OCR text combined with message content for classification
- ✅ Visual context included for troubleshooting assistance