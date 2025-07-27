import { config } from './env.js';
import type { RedisOptions } from 'bullmq';

export const redisConfig: RedisOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export function getRedisConnection(): RedisOptions {
  return redisConfig;
}
