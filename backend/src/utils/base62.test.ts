import { describe, it, expect } from 'vitest';
import { encodeMessageId, decodeMessageId, isValidBase62, getEncodedLength } from './base62.js';

describe('Base62 Encoding', () => {
  describe('encodeMessageId', () => {
    it('should encode a typical Discord message ID', () => {
      const messageId = '1237913052974530651';
      const encoded = encodeMessageId(messageId);
      
      expect(encoded).toBeTruthy();
      expect(encoded.length).toBeLessThan(messageId.length);
      expect(encoded.length).toBeLessThanOrEqual(11); // Should be much shorter
    });

    it('should encode zero correctly', () => {
      const encoded = encodeMessageId('0');
      expect(encoded).toBe('0');
    });

    it('should encode small numbers', () => {
      expect(encodeMessageId('61')).toBe('z');
      expect(encodeMessageId('62')).toBe('10');
      expect(encodeMessageId('123')).toBe('1z'); // Base62 uses lowercase 'z'
    });

    it('should throw on invalid input', () => {
      expect(() => encodeMessageId('')).toThrow('Invalid message ID');
      expect(() => encodeMessageId('abc')).toThrow('Invalid message ID');
      expect(() => encodeMessageId('12.34')).toThrow('Invalid message ID');
      expect(() => encodeMessageId('-123')).toThrow('Invalid message ID');
    });

    it('should handle very large Discord IDs', () => {
      const largeId = '9999999999999999999';
      const encoded = encodeMessageId(largeId);
      expect(encoded).toBeTruthy();
      expect(encoded.length).toBeLessThan(15);
    });
  });

  describe('decodeMessageId', () => {
    it('should decode back to original message ID', () => {
      const messageId = '1237913052974530651';
      const encoded = encodeMessageId(messageId);
      const decoded = decodeMessageId(encoded);
      
      expect(decoded).toBe(messageId);
    });

    it('should handle roundtrip for various IDs', () => {
      const testIds = [
        '0',
        '1',
        '62',
        '1234567890',
        '1237913052974530651',
        '9999999999999999999'
      ];

      testIds.forEach(id => {
        const encoded = encodeMessageId(id);
        const decoded = decodeMessageId(encoded);
        expect(decoded).toBe(id);
      });
    });

    it('should decode known values correctly', () => {
      expect(decodeMessageId('0')).toBe('0');
      expect(decodeMessageId('z')).toBe('61');
      expect(decodeMessageId('10')).toBe('62');
      expect(decodeMessageId('1z')).toBe('123'); // Matching the encoding test
    });

    it('should throw on invalid input', () => {
      expect(() => decodeMessageId('')).toThrow('Invalid encoded string');
      expect(() => decodeMessageId('!')).toThrow('Invalid character');
      expect(() => decodeMessageId('abc-def')).toThrow('Invalid character');
    });
  });

  describe('isValidBase62', () => {
    it('should validate correct base62 strings', () => {
      expect(isValidBase62('0')).toBe(true);
      expect(isValidBase62('abc123XYZ')).toBe(true);
      expect(isValidBase62('7h3Kx9mP2')).toBe(true);
    });

    it('should reject invalid strings', () => {
      expect(isValidBase62('')).toBe(false);
      expect(isValidBase62('abc-123')).toBe(false);
      expect(isValidBase62('hello world')).toBe(false);
      expect(isValidBase62('abc!')).toBe(false);
    });
  });

  describe('getEncodedLength', () => {
    it('should estimate encoded length', () => {
      expect(getEncodedLength('0')).toBe(1);
      expect(getEncodedLength('61')).toBe(1);
      expect(getEncodedLength('62')).toBe(1); // 62 still encodes to 1 char ('10' is 2 chars but estimate is ceil(log(62)/log(62)) = 1)
      
      // Discord IDs should be around 9-11 characters
      const discordId = '1237913052974530651';
      const estimatedLength = getEncodedLength(discordId);
      const actualLength = encodeMessageId(discordId).length;
      
      expect(Math.abs(estimatedLength - actualLength)).toBeLessThanOrEqual(1);
    });
  });

  describe('Real Discord ID examples', () => {
    it('should significantly reduce URL length', () => {
      const examples = [
        '1237913052974530651',
        '1234567890123456789',
        '9876543210987654321'
      ];

      examples.forEach(id => {
        const encoded = encodeMessageId(id);
        // Log is useful for verification during testing
        // console.log(`${id} (${id.length} chars) → ${encoded} (${encoded.length} chars)`);
        
        expect(encoded.length).toBeLessThanOrEqual(11); // Discord IDs encode to ~10-11 chars
        expect(decodeMessageId(encoded)).toBe(id); // Must decode correctly
      });
    });
  });
});