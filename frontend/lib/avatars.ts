import { createAvatar } from '@dicebear/core';
import { shapes } from '@dicebear/collection';

/**
 * Generate a consistent avatar URL for a given user ID
 * Uses DiceBear shapes style with the anonymized user ID as seed
 */
export function generateAvatarUrl(anonymizedUserId: string): string {
  const avatar = createAvatar(shapes, {
    seed: anonymizedUserId,
    size: 128,
    backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
  });

  return avatar.toDataUri();
}