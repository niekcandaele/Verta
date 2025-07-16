import { describe, it, expect } from 'vitest';
import { anonymizeUserId } from '../crypto.js';

describe('anonymizeUserId', () => {
  it('should produce the same hash for the same input', () => {
    const userId = '123456789';
    const hash1 = anonymizeUserId(userId);
    const hash2 = anonymizeUserId(userId);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different inputs', () => {
    const hash1 = anonymizeUserId('user123');
    const hash2 = anonymizeUserId('user456');

    expect(hash1).not.toBe(hash2);
  });

  it('should always produce a 64-character hex string', () => {
    const testCases = [
      '123456789',
      'a',
      'very-long-user-id-with-many-characters-1234567890',
      'user@example.com',
      '',
    ];

    testCases.forEach((userId) => {
      const hash = anonymizeUserId(userId);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  it('should handle empty strings', () => {
    const hash = anonymizeUserId('');
    expect(hash).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('should handle unicode and special characters', () => {
    const specialCases = [
      'user👤',
      'пользователь',
      '用户123',
      'user\nwith\nnewlines',
      'user with spaces',
      'user!@#$%^&*()',
    ];

    specialCases.forEach((userId) => {
      const hash = anonymizeUserId(userId);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  it('should produce known hashes for known inputs (regression test)', () => {
    // These test cases ensure the hashing algorithm remains consistent
    const knownCases = [
      {
        input: 'discord_user_123',
        expected:
          '9ec35db6a38b2685115720e66f7ac57b4d684d5eb45a95e475b0976ac7a835d5',
      },
      {
        input: '987654321',
        expected:
          '8a9bcf1e51e812d0af8465a8dbcc9f741064bf0af3b3d08e6b0246437c19f7fb',
      },
      {
        input: 'test@example.com',
        expected:
          '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
      },
    ];

    knownCases.forEach(({ input, expected }) => {
      expect(anonymizeUserId(input)).toBe(expected);
    });
  });

  it('should be deterministic across multiple calls', () => {
    const userId = 'consistent_user_id';
    const hashes = Array(10)
      .fill(null)
      .map(() => anonymizeUserId(userId));

    // All hashes should be identical
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(1);
  });
});
