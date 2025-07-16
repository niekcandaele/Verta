import { z } from 'zod';
import winston from 'winston';

// Environment configuration schema with Zod validation
export const ConfigSchema = z.object({
  ADMIN_API_KEY: z.string().min(1, 'ADMIN_API_KEY is required'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(25000),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug', 'verbose'])
    .default('info'),
  // Redis configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  // Discord configuration
  DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
});

export type Config = z.infer<typeof ConfigSchema>;

// Create a temporary logger for config loading phase
const configLogger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.json(),
    }),
  ],
});

// Load and validate environment configuration
export function loadConfig(): Config {
  try {
    return ConfigSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      configLogger.error('Environment configuration validation failed', {
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      throw new Error('Environment configuration validation failed');
    }
    throw error;
  }
}

// Export the validated configuration
export const config = loadConfig();
