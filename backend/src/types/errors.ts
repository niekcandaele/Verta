/**
 * Error types and classifications for sync operations
 */

/**
 * Sync error types
 */
export enum SyncErrorType {
  // Rate limit errors - no retry, exit immediately
  RATE_LIMIT = 'RATE_LIMIT',

  // Transient errors - retry with exponential backoff
  NETWORK_ERROR = 'NETWORK_ERROR',
  TEMPORARY_FAILURE = 'TEMPORARY_FAILURE',
  TIMEOUT = 'TIMEOUT',

  // Permanent errors - no retry, log and bail
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',

  // Unknown errors
  UNKNOWN = 'UNKNOWN',
}

/**
 * Sync error classification
 */
export enum SyncErrorClassification {
  RATE_LIMIT = 'RATE_LIMIT', // Exit immediately, no retry
  TRANSIENT = 'TRANSIENT', // Retry with exponential backoff
  PERMANENT = 'PERMANENT', // No retry, fail immediately
}

/**
 * Sync error interface
 */
export interface SyncError extends Error {
  type: SyncErrorType;
  classification: SyncErrorClassification;
  context?: Record<string, unknown>;
  statusCode?: number;
  retryable: boolean;
}

/**
 * Custom sync error class
 */
export class SyncOperationError extends Error implements SyncError {
  type: SyncErrorType;
  classification: SyncErrorClassification;
  context?: Record<string, unknown>;
  statusCode?: number;
  retryable: boolean;

  constructor(
    message: string,
    type: SyncErrorType,
    classification: SyncErrorClassification,
    context?: Record<string, unknown>,
    statusCode?: number
  ) {
    super(message);
    this.name = 'SyncOperationError';
    this.type = type;
    this.classification = classification;
    this.context = context;
    this.statusCode = statusCode;
    this.retryable = classification === SyncErrorClassification.TRANSIENT;

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, SyncOperationError.prototype);
  }
}

/**
 * Helper function to classify errors
 */
export function classifyError(error: unknown): SyncError {
  // If it's already a SyncError, return it
  if (error instanceof SyncOperationError) {
    return error;
  }

  // Check for Discord.js rate limit errors
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name?.toLowerCase() || '';

    // Discord rate limit detection
    if (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('429') ||
      errorName.includes('ratelimit') ||
      (error as unknown as Record<string, unknown>).code === 429 ||
      (error as unknown as Record<string, unknown>).status === 429
    ) {
      return new SyncOperationError(
        'Discord API rate limit exceeded',
        SyncErrorType.RATE_LIMIT,
        SyncErrorClassification.RATE_LIMIT,
        { originalError: error.message },
        429
      );
    }

    // Network errors
    if (
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('etimedout') ||
      errorMessage.includes('network') ||
      errorName.includes('fetch')
    ) {
      return new SyncOperationError(
        'Network error occurred',
        SyncErrorType.NETWORK_ERROR,
        SyncErrorClassification.TRANSIENT,
        { originalError: error.message }
      );
    }

    // Authentication errors
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('invalid token') ||
      errorMessage.includes('authentication')
    ) {
      return new SyncOperationError(
        'Authentication failed',
        SyncErrorType.AUTHENTICATION_FAILED,
        SyncErrorClassification.PERMANENT,
        { originalError: error.message },
        401
      );
    }

    // Permission errors
    if (
      errorMessage.includes('403') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('missing access')
    ) {
      return new SyncOperationError(
        'Permission denied',
        SyncErrorType.PERMISSION_DENIED,
        SyncErrorClassification.PERMANENT,
        { originalError: error.message },
        403
      );
    }

    // Not found errors
    if (
      errorMessage.includes('404') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('unknown')
    ) {
      return new SyncOperationError(
        'Resource not found',
        SyncErrorType.RESOURCE_NOT_FOUND,
        SyncErrorClassification.PERMANENT,
        { originalError: error.message },
        404
      );
    }

    // Timeout errors
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out')
    ) {
      return new SyncOperationError(
        'Operation timed out',
        SyncErrorType.TIMEOUT,
        SyncErrorClassification.TRANSIENT,
        { originalError: error.message }
      );
    }
  }

  // Default to unknown error (transient to allow retry)
  return new SyncOperationError(
    error instanceof Error ? error.message : 'Unknown error occurred',
    SyncErrorType.UNKNOWN,
    SyncErrorClassification.TRANSIENT,
    {
      originalError:
        error instanceof Error ? error.message : JSON.stringify(error),
    }
  );
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  const classified = classifyError(error);
  return classified.classification === SyncErrorClassification.RATE_LIMIT;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const classified = classifyError(error);
  return classified.retryable;
}
