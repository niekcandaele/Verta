import { createHash } from 'crypto';

/**
 * Anonymizes a user ID using SHA-256 hashing without salt.
 *
 * This function creates a deterministic hash, meaning the same input
 * will always produce the same output. This is required for consistent
 * user tracking across multiple sync operations.
 *
 * @param userId - The original user ID from the platform (Discord, Slack, etc.)
 * @returns A 64-character hexadecimal string representing the SHA-256 hash
 *
 * @example
 * ```typescript
 * const anonymizedId = anonymizeUserId('123456789');
 * // Returns: 'e807f1fcf82d132f9bb018ca6738a19f7d5c5a0e50c5f3b3f3f3f3f3f3f3f3f3'
 * ```
 */
export function anonymizeUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex');
}
