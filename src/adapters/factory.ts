/**
 * Platform adapter factory for creating platform-specific adapters
 */

import type { Platform } from '../database/types.js';
import type { PlatformAdapter, PlatformAdapterConfig } from './types.js';
import { DiscordAdapter } from './discord/index.js';

/**
 * Factory for creating platform adapters
 */
export class PlatformAdapterFactory {
  /**
   * Create a platform adapter for the specified platform
   * @param platform - The platform type
   * @param config - Optional adapter configuration
   * @returns Platform adapter instance
   */
  static create(
    platform: Platform,
    config?: PlatformAdapterConfig
  ): PlatformAdapter {
    switch (platform) {
      case 'discord':
        return new DiscordAdapter(config);
      case 'slack':
        // TODO: Implement Slack adapter
        throw new Error('Slack adapter not yet implemented');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Check if a platform is supported
   * @param platform - The platform to check
   * @returns True if the platform is supported
   */
  static isSupported(platform: string): platform is Platform {
    return platform === 'discord' || platform === 'slack';
  }

  /**
   * Get list of supported platforms
   * @returns Array of supported platform names
   */
  static getSupportedPlatforms(): Platform[] {
    return ['discord', 'slack'];
  }
}
