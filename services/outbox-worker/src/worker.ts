/**
 * @module outbox-worker/worker
 *
 * Transactional Outbox polling worker.
 *
 * Reads unpublished records from the `outbox` table in Supabase,
 * publishes each event to Redis Streams, then marks the record as
 * published.  Events that fail to publish after MAX_RETRIES are left
 * with an error message so they can be investigated and replayed.
 *
 * Environment variables:
 *   SUPABASE_URL              – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Service role key (bypasses RLS)
 *   REDIS_URL                 – Redis connection string
 *   REDIS_STREAM_KEY          – Stream key (default: resumelm:events)
 *   POLL_INTERVAL_MS          – Polling interval (default: 2000)
 *   BATCH_SIZE                – Records per poll cycle (default: 50)
 *   MAX_RETRIES               – Max publish retries per record (default: 5)
 */

import {
  fetchUnpublished,
  markPublished,
  markFailed,
} from './services/outboxService.js';
import { publishToStream, closeRedisConnection } from './publishers/eventPublisher.js';
import { logger } from './services/logger.js';

const POLL_INTERVAL_MS = parseInt(process.env['POLL_INTERVAL_MS'] ?? '2000', 10);
const BATCH_SIZE = parseInt(process.env['BATCH_SIZE'] ?? '50', 10);
const MAX_RETRIES = parseInt(process.env['MAX_RETRIES'] ?? '5', 10);

let running = true;

// ── Graceful shutdown ──────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received – shutting down outbox worker`);
  running = false;
  await closeRedisConnection();
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

// ── Main polling loop ──────────────────────────────────────────────────────

async function pollOnce(): Promise<void> {
  const records = await fetchUnpublished(BATCH_SIZE);
  if (records.length === 0) return;

  logger.info('Processing outbox batch', { count: records.length });

  for (const record of records) {
    if (record.retry_count >= MAX_RETRIES) {
      logger.warn('Outbox record exceeded max retries – skipping', {
        id: record.id,
        eventType: record.event_type,
        retryCount: record.retry_count,
      });
      continue;
    }

    try {
      await publishToStream(record.payload);
      await markPublished(record.id);
      logger.debug('Published outbox event', {
        id: record.id,
        eventType: record.event_type,
      });
    } catch (err) {
      const message = (err as Error).message;
      logger.error('Failed to publish outbox event', {
        id: record.id,
        eventType: record.event_type,
        error: message,
      });
      await markFailed(record.id, message);
    }
  }
}

async function run(): Promise<void> {
  logger.info('Outbox worker started', {
    pollIntervalMs: POLL_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    maxRetries: MAX_RETRIES,
  });

  while (running) {
    try {
      await pollOnce();
    } catch (err) {
      logger.error('Outbox poll cycle error', { error: (err as Error).message });
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

run().catch((err) => {
  logger.error('Fatal outbox worker error', { error: (err as Error).message });
  process.exit(1);
});
