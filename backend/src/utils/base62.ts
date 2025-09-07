/**
 * Base62 encoding/decoding utility for Discord message IDs
 * Converts long numeric IDs to shorter URL-friendly strings
 */

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = 62n;

/**
 * Encode a Discord message ID to base62
 * @param messageId - Discord message ID string (e.g., "1237913052974530651")
 * @returns Base62 encoded string (e.g., "7h3Kx9mP2")
 */
export function encodeMessageId(messageId: string): string {
  if (!messageId || !/^\d+$/.test(messageId)) {
    throw new Error('Invalid message ID: must be a numeric string');
  }

  let num = BigInt(messageId);
  if (num === 0n) return BASE62_ALPHABET[0];

  let result = '';
  while (num > 0n) {
    const remainder = Number(num % BASE);
    result = BASE62_ALPHABET[remainder] + result;
    num = num / BASE;
  }

  return result;
}

/**
 * Decode a base62 string back to Discord message ID
 * @param encoded - Base62 encoded string
 * @returns Original Discord message ID string
 */
export function decodeMessageId(encoded: string): string {
  if (!encoded || encoded.length === 0) {
    throw new Error('Invalid encoded string: cannot be empty');
  }

  let result = 0n;
  for (const char of encoded) {
    const value = BASE62_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid character in encoded string: ${char}`);
    }
    result = result * BASE + BigInt(value);
  }

  return result.toString();
}

/**
 * Validate if a string is a valid base62 encoded value
 * @param encoded - String to validate
 * @returns true if valid base62
 */
export function isValidBase62(encoded: string): boolean {
  if (!encoded || encoded.length === 0) return false;
  return encoded.split('').every(char => BASE62_ALPHABET.includes(char));
}

/**
 * Get the approximate length of base62 encoding for a Discord ID
 * Discord IDs are ~64-bit numbers, so base62 encoding is typically 9-11 chars
 */
export function getEncodedLength(messageId: string): number {
  const num = BigInt(messageId);
  if (num === 0n) return 1;
  
  // log(n) / log(62) gives us the number of digits in base 62
  const log62 = Math.log(62);
  const logNum = Math.log(Number(num));
  return Math.ceil(logNum / log62);
}