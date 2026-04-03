/**
 * @module outbox-worker/publishers/eventPublisher
 *
 * Publishes domain events from the outbox to Redis Streams.
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from '../services/logger.js';

const STREAM_KEY = process.env['REDIS_STREAM_KEY'] ?? 'resumelm:events';
const MAX_STREAM_LENGTH = 10_000;

let redisClient: RedisClientType | null = null;

async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient) return redisClient;
  const url = process.env['REDIS_URL'];
  if (!url) throw new Error('REDIS_URL environment variable is required');

  redisClient = createClient({ url }) as RedisClientType;
  redisClient.on('error', (err: Error) => {
    logger.error('Redis client error', { error: err.message });
  });
  await redisClient.connect();
  logger.info('Connected to Redis', { url: url.replace(/:\/\/.*@/, '://*@') });
  return redisClient;
}

/**
 * Publish a domain event payload to Redis Streams.
 * The payload is the full serialised DomainEvent envelope.
 */
export async function publishToStream(payload: Record<string, unknown>): Promise<void> {
  const client = await getRedisClient();
  await client.xAdd(
    STREAM_KEY,
    '*',
    { payload: JSON.stringify(payload) },
    { MAXLEN: { strategy: '~', threshold: MAX_STREAM_LENGTH } },
  );
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
