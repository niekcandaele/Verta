/**
 * Discord Bot Service
 * Handles Discord bot events, interactions, and command registration
 */

import { Client, REST, Routes, SlashCommandBuilder, ChatInputCommandInteraction, Events, ThreadChannel, Message } from 'discord.js';
import { discordClientManager } from '../../adapters/discord/DiscordClientManager.js';
import { config } from '../../config/env.js';
import logger from '../../utils/logger.js';
import { TenantRepositoryImpl } from '../../repositories/tenant/index.js';
import { BotConfigRepository } from '../../repositories/BotConfigRepository.js';
import { addBotEventJob } from '../../queues/botEventQueue.js';
import { db } from '../../database/index.js';
import type { Platform } from '../../database/types.js';

export class DiscordBotService {
  private client: Client | null = null;
  private initialized = false;
  private commands: object[] = [];
  private threadTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private threadMessageBuffers: Map<string, string[]> = new Map();
  private botConfigRepo: BotConfigRepository;
  private configCache: Map<string, string[]> = new Map(); // tenantId -> monitored channels
  private lastConfigRefresh = 0;
  private readonly CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Initialize repositories
    this.botConfigRepo = new BotConfigRepository(db);

    // Define slash commands
    this.commands = [
      new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask Verta a question')
        .addStringOption(option =>
          option
            .setName('question')
            .setDescription('Your question')
            .setRequired(true)
        )
        .toJSON(),
      
      new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show Verta bot usage and tips')
        .toJSON()
    ];
  }

  /**
   * Initialize the Discord bot service
   * Sets up event handlers and registers slash commands
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('DiscordBotService already initialized, skipping');
      return;
    }

    try {
      // Get the Discord client from the manager
      this.client = discordClientManager.getClient();
      
      // Register slash commands
      await this.registerSlashCommands();
      
      // Set up event listeners
      this.setupEventListeners();
      
      logger.info('DiscordBotService initialized successfully');
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize DiscordBotService', { error });
      throw new Error('Failed to initialize Discord bot service');
    }
  }

  /**
   * Register slash commands with Discord
   */
  private async registerSlashCommands(): Promise<void> {
    if (!config.DISCORD_CLIENT_ID) {
      logger.warn('DISCORD_CLIENT_ID not set, skipping slash command registration');
      return;
    }

    try {
      logger.info(`Starting registration of ${this.commands.length} slash commands`);
      
      // Create REST instance
      const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);
      
      // Register commands globally
      const data = await rest.put(
        Routes.applicationCommands(config.DISCORD_CLIENT_ID),
        { body: this.commands }
      ) as object[];

      logger.info(`Successfully registered ${data.length} slash commands globally`);
    } catch (error) {
      logger.error('Failed to register slash commands', { error });
      throw new Error('Failed to register slash commands');
    }
  }

  /**
   * Set up Discord event listeners
   */
  private setupEventListeners(): void {
    if (!this.client) {
      throw new Error('Discord client not available');
    }

    // Handle slash command interactions
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      try {
        await this.handleInteraction(interaction);
      } catch (error) {
        logger.error('Error handling interaction', { error, commandName: interaction.commandName });
      }
    });

    // Handle thread creation
    this.client.on(Events.ThreadCreate, async (thread: ThreadChannel) => {
      try {
        await this.handleThreadCreate(thread);
      } catch (error) {
        logger.error('Error handling thread creation', { error, threadId: thread.id });
      }
    });

    // Handle messages in threads (for debounce logic)
    this.client.on(Events.MessageCreate, async (message: Message) => {
      try {
        if (message.channel.isThread() && this.threadTimers.has(message.channel.id)) {
          await this.handleThreadMessage(message);
        }
      } catch (error) {
        logger.error('Error handling thread message', { error, messageId: message.id });
      }
    });

    logger.info('Discord bot event listeners set up');
  }

  /**
   * Handle slash command interactions
   */
  private async handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
    // Always make responses public so support staff can see previous answers
    const isEphemeral = false;
    
    // Acknowledge the interaction immediately with appropriate visibility
    await interaction.deferReply({ ephemeral: isEphemeral });

    const { commandName, guildId, channelId, user } = interaction;
    
    // Log the interaction
    logger.info('Received slash command', {
      command: commandName,
      guildId,
      channelId,
      userId: user.id,
      username: user.username,
      isThread: interaction.channel?.isThread(),
      ephemeral: isEphemeral
    });

    // Look up tenant by Discord guild ID
    if (!guildId) {
      await interaction.editReply('This command can only be used in a server.');
      return;
    }

    const tenantRepository = new TenantRepositoryImpl(db);
    const tenant = await tenantRepository.findByPlatformId('discord' as Platform, guildId);
    if (!tenant) {
      await interaction.editReply('This server is not configured for Verta bot.');
      return;
    }

    // Handle different commands
    switch (commandName) {
      case 'ask':
        await this.handleAskCommand(interaction, tenant.id);
        break;
      case 'help':
        await this.handleHelpCommand(interaction);
        break;
      default:
        await interaction.editReply('Unknown command.');
    }
  }

  /**
   * Handle /ask command
   */
  private async handleAskCommand(interaction: ChatInputCommandInteraction, tenantId: string): Promise<void> {
    const question = interaction.options.getString('question', true);
    
    // Queue the bot event for processing
    try {
      const jobData: Parameters<typeof addBotEventJob>[0] = {
        type: 'slash_command',
        tenantId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        content: question,
        timestamp: new Date(),
        interaction: {
          token: interaction.token,
          id: interaction.id,
          applicationId: interaction.applicationId,
        }
      };

      // Add threadId if command is used in a thread
      if (interaction.channel?.isThread()) {
        jobData.threadId = interaction.channelId;
      }

      const jobId = await addBotEventJob(jobData);

      logger.info('Queued bot event for /ask command', { jobId, tenantId, question });
      
      // Respond to the user
      await interaction.editReply('🤔 Processing your question... I\'ll get back to you shortly!');
    } catch (error) {
      logger.error('Failed to queue bot event', { error });
      await interaction.editReply('Sorry, I encountered an error processing your question. Please try again later.');
    }
  }

  /**
   * Handle /help command
   */
  private async handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const helpMessage = `**Verta Bot Help** 🤖

I'm here to help answer your questions about this community!

**Available Commands:**
• \`/ask <question>\` - Ask me any question and I'll search through the community's knowledge to find the best answer
• \`/help\` - Show this help message

**Tips for better answers:**
• Be specific with your questions
• Include relevant context
• Use keywords related to what you're looking for

**How I work:**
I search through the community's message history, documentation, and knowledge base to provide accurate answers based on real discussions and verified information.`;

    await interaction.editReply(helpMessage);
  }

  /**
   * Check if the service is initialized and ready
   */
  isReady(): boolean {
    return this.initialized && this.client?.isReady() === true;
  }

  /**
   * Get monitored channels for a tenant with caching
   */
  private async getMonitoredChannels(tenantId: string): Promise<string[]> {
    const now = Date.now();

    // Check if we need to refresh the cache
    if (now - this.lastConfigRefresh > this.CONFIG_CACHE_TTL) {
      await this.refreshConfigCache();
    }

    // Return cached config or empty array if not found
    return this.configCache.get(tenantId) || [];
  }

  /**
   * Refresh the configuration cache from database
   */
  private async refreshConfigCache(): Promise<void> {
    try {
      // For now, we'll load all tenant configs to keep it simple
      // In a large system, we might want to load only for active guilds
      const tenantRepo = new TenantRepositoryImpl(db);
      const allTenants = await tenantRepo.findAll({
        page: 1,
        limit: 1000, // Assume we won't have more than 1000 tenants
      });

      // Clear existing cache
      this.configCache.clear();

      // Load bot config for each tenant
      for (const tenant of allTenants.data) {
        const botConfig = await this.botConfigRepo.findByTenantId(tenant.id);
        if (botConfig) {
          this.configCache.set(tenant.id, botConfig.monitored_channels);
        }
      }

      this.lastConfigRefresh = Date.now();
      logger.debug('Refreshed bot configuration cache', {
        tenantsWithConfig: this.configCache.size,
        totalTenants: allTenants.data.length,
      });
    } catch (error) {
      logger.error('Failed to refresh bot configuration cache', { error });
      // Don't throw error to avoid breaking the service - keep using cached data
    }
  }

  /**
   * Force refresh the configuration cache
   */
  async refreshConfig(): Promise<void> {
    await this.refreshConfigCache();
  }

  /**
   * Handle thread creation event
   */
  private async handleThreadCreate(thread: ThreadChannel): Promise<void> {
    if (!thread.parentId) {
      logger.debug('Thread has no parent channel', { threadId: thread.id });
      return;
    }

    // Look up tenant by Discord guild ID
    const guild = thread.guild;
    if (!guild) {
      logger.error('Thread has no guild', { threadId: thread.id });
      return;
    }

    const tenantRepository = new TenantRepositoryImpl(db);
    const tenant = await tenantRepository.findByPlatformId('discord' as Platform, guild.id);
    if (!tenant) {
      logger.debug('No tenant found for guild', { guildId: guild.id, threadId: thread.id });
      return;
    }

    // Get monitored channels for this tenant
    const monitoredChannels = await this.getMonitoredChannels(tenant.id);

    // Check if thread's parent channel is in monitored channels
    if (!monitoredChannels.includes(thread.parentId)) {
      logger.debug('Thread created in non-monitored channel', {
        threadId: thread.id,
        parentId: thread.parentId,
        tenantId: tenant.id,
        monitoredChannelsCount: monitoredChannels.length,
      });
      return;
    }

    logger.info('Thread detected in monitored channel', {
      threadId: thread.id,
      threadName: thread.name,
      parentId: thread.parentId,
      tenantId: tenant.id,
    });

    // Start debounce timer for this thread
    this.startDebounceTimer(thread);
  }

  /**
   * Handle messages in threads (for debounce logic)
   */
  private async handleThreadMessage(message: Message): Promise<void> {
    const threadId = message.channel.id;

    // Store message content for context
    if (!this.threadMessageBuffers.has(threadId)) {
      this.threadMessageBuffers.set(threadId, []);
    }

    const buffer = this.threadMessageBuffers.get(threadId)!;
    buffer.push(message.content);

    logger.debug('Thread message received, resetting timer', {
      threadId,
      messageCount: buffer.length,
    });

    // Reset the debounce timer
    const thread = message.channel as ThreadChannel;
    this.startDebounceTimer(thread);
  }

  /**
   * Start or reset the debounce timer for a thread
   */
  private startDebounceTimer(thread: ThreadChannel): void {
    const threadId = thread.id;

    // Clear existing timer if any
    if (this.threadTimers.has(threadId)) {
      clearTimeout(this.threadTimers.get(threadId)!);
      logger.debug('Cleared existing timer for thread', { threadId });
    }

    // Start new 10-second timer
    const timer = setTimeout(async () => {
      logger.info('Thread timer expired, processing thread', { threadId });

      try {
        await this.processThreadAfterDebounce(thread);
      } catch (error) {
        logger.error('Error processing thread after debounce', { error, threadId });
      } finally {
        // Cleanup
        this.threadTimers.delete(threadId);
        this.threadMessageBuffers.delete(threadId);
      }
    }, 10000); // 10 seconds

    this.threadTimers.set(threadId, timer);
    logger.debug('Started 10-second timer for thread', { threadId });
  }

  /**
   * Process thread after debounce timer expires
   */
  private async processThreadAfterDebounce(thread: ThreadChannel): Promise<void> {
    // Look up tenant
    const guild = thread.guild;
    if (!guild) {
      logger.error('Thread has no guild', { threadId: thread.id });
      return;
    }

    const tenantRepository = new TenantRepositoryImpl(db);
    const tenant = await tenantRepository.findByPlatformId('discord' as Platform, guild.id);
    if (!tenant) {
      logger.warn('No tenant found for guild', { guildId: guild.id });
      return;
    }

    // Fetch thread messages for context
    const messages = await this.fetchThreadMessages(thread);

    // Prepare context
    const context = messages.map(msg => ({
      id: msg.id,
      content: msg.content,
      authorId: msg.author.id,
      authorUsername: msg.author.username,
      timestamp: msg.createdAt.toISOString(),
    }));

    // Queue the bot event
    const jobId = await addBotEventJob({
      type: 'thread_create',
      tenantId: tenant.id,
      channelId: thread.id,
      threadId: thread.id,
      userId: thread.ownerId || 'system',
      content: `Thread: ${thread.name}`,
      context,
      timestamp: new Date(),
    });

    logger.info('Queued thread event for processing', {
      jobId,
      threadId: thread.id,
      contextMessages: context.length,
    });
  }

  /**
   * Fetch messages from a thread
   */
  private async fetchThreadMessages(thread: ThreadChannel): Promise<Message[]> {
    try {
      // Fetch last 50 messages from the thread
      const messages = await thread.messages.fetch({ limit: 50 });

      // Convert to array and reverse to get chronological order
      const messageArray = Array.from(messages.values()).reverse();

      logger.debug('Fetched thread messages', {
        threadId: thread.id,
        messageCount: messageArray.length,
      });

      return messageArray;
    } catch (error) {
      logger.error('Failed to fetch thread messages', { error, threadId: thread.id });
      return [];
    }
  }

  /**
   * Cleanup the service
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Cleaning up DiscordBotService');

    // Clear all active timers
    for (const [threadId, timer] of this.threadTimers) {
      clearTimeout(timer);
      logger.debug('Cleared timer for thread', { threadId });
    }
    this.threadTimers.clear();
    this.threadMessageBuffers.clear();

    this.initialized = false;
    this.client = null;
    logger.info('DiscordBotService cleaned up successfully');
  }
}

// Export a singleton instance
export const discordBotService = new DiscordBotService();