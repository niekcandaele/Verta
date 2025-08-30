/**
 * Singleton manager for Discord client
 * Ensures only ONE Discord bot connection across the entire application
 */

import { Client, GatewayIntentBits } from 'discord.js';
import logger from '../../utils/logger.js';
import { config } from '../../config/env.js';

/**
 * Global Discord client manager
 * This singleton ensures we only have ONE Discord bot connection
 * across all workers, API routes, and other components
 */
class DiscordClientManager {
  private static instance: DiscordClientManager | null = null;
  private client: Client | null = null;
  private initialized = false;
  private initializing = false;
  private initPromise: Promise<void> | null = null;
  private rateLimitMetrics = {
    encounters: 0,
    totalDelayMs: 0,
  };

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): DiscordClientManager {
    if (!DiscordClientManager.instance) {
      DiscordClientManager.instance = new DiscordClientManager();
    }
    return DiscordClientManager.instance;
  }

  /**
   * Initialize the Discord client
   * This should be called once at application startup
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.initialized) {
      logger.debug('Discord client already initialized, skipping');
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializing && this.initPromise) {
      logger.debug('Discord client initialization in progress, waiting');
      return this.initPromise;
    }

    // Start initialization
    this.initializing = true;
    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
    } finally {
      this.initializing = false;
      this.initPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    logger.info('Initializing global Discord client');

    try {
      // Create the client with required intents
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMessageReactions,
        ],
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Set up rate limit monitoring if enabled
      if (config.DEBUG_RATE_LIMITS) {
        this.setupRateLimitMonitoring();
      }

      // Login to Discord
      await this.client.login(config.DISCORD_BOT_TOKEN);

      this.initialized = true;
      logger.info('Global Discord client initialized successfully', {
        userId: this.client.user?.id,
        username: this.client.user?.username,
        discriminator: this.client.user?.discriminator,
      });
    } catch (error) {
      logger.error('Failed to initialize global Discord client', { error });
      this.initialized = false;
      this.client = null;
      throw new Error('Failed to initialize Discord client');
    }
  }

  /**
   * Get the Discord client
   * Throws if not initialized
   */
  getClient(): Client {
    if (!this.initialized || !this.client) {
      throw new Error(
        'Discord client not initialized. Call initialize() first.'
      );
    }
    return this.client;
  }

  /**
   * Check if the client is initialized and ready
   */
  isReady(): boolean {
    return this.initialized && this.client?.isReady() === true;
  }

  /**
   * Cleanup the Discord client
   * This should only be called on application shutdown
   */
  async cleanup(): Promise<void> {
    if (!this.client) {
      return;
    }

    logger.info('Cleaning up global Discord client');

    try {
      // Log final rate limit metrics if monitoring was enabled
      if (config.DEBUG_RATE_LIMITS && this.rateLimitMetrics.encounters > 0) {
        logger.info('Discord rate limit summary', {
          context: 'rate-limit-debug',
          summary: {
            totalEncounters: this.rateLimitMetrics.encounters,
            totalDelayMs: this.rateLimitMetrics.totalDelayMs,
            averageDelayMs:
              this.rateLimitMetrics.totalDelayMs /
              this.rateLimitMetrics.encounters,
          },
        });
      }

      // Destroy the client
      this.client.destroy();
      this.client = null;
      this.initialized = false;

      logger.info('Global Discord client cleaned up successfully');
    } catch (error) {
      logger.error('Failed to cleanup global Discord client', { error });
      throw new Error('Failed to cleanup Discord client');
    }
  }

  /**
   * Get current rate limit metrics
   */
  getRateLimitMetrics() {
    return {
      encounters: this.rateLimitMetrics.encounters,
      totalDelayMs: this.rateLimitMetrics.totalDelayMs,
      averageDelayMs:
        this.rateLimitMetrics.encounters > 0
          ? this.rateLimitMetrics.totalDelayMs /
            this.rateLimitMetrics.encounters
          : 0,
    };
  }

  /**
   * Set up Discord client event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('ready', () => {
      logger.info('Discord client ready', {
        userId: this.client?.user?.id,
        username: this.client?.user?.username,
      });
    });

    this.client.on('error', (error) => {
      logger.error('Discord client error', { error });
    });

    this.client.on('warn', (warning) => {
      logger.warn('Discord client warning', { warning });
    });

    this.client.on('disconnect', () => {
      logger.warn('Discord client disconnected');
    });

    this.client.on('reconnecting', () => {
      logger.info('Discord client reconnecting');
    });

    this.client.on('resume', (replayed) => {
      logger.info('Discord client resumed', { replayedEvents: replayed });
    });
  }

  /**
   * Set up rate limit monitoring
   */
  private setupRateLimitMonitoring(): void {
    if (!this.client) return;

    this.client.rest.on('rateLimited', (info) => {
      this.rateLimitMetrics.encounters++;
      this.rateLimitMetrics.totalDelayMs += info.timeToReset;

      logger.warn('Discord rate limit encountered', {
        context: 'rate-limit-debug',
        timeout: info.timeToReset,
        limit: info.limit,
        method: info.method,
        url: info.url,
        route: info.route,
        global: info.global,
        rateLimitMetrics: {
          totalEncounters: this.rateLimitMetrics.encounters,
          totalDelayMs: this.rateLimitMetrics.totalDelayMs,
          averageDelayMs:
            this.rateLimitMetrics.totalDelayMs /
            this.rateLimitMetrics.encounters,
        },
      });
    });

    logger.info('Discord rate limit monitoring enabled');
  }
}

// Export the singleton instance
export const discordClientManager = DiscordClientManager.getInstance();
