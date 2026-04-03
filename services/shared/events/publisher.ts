/**
 * @module services/shared/events/publisher
 *
 * Redis Streams event publisher for ResumeLM microservices.
 *
 * When ENABLE_EVENTS=false or REDIS_URL is absent the publisher falls back
 * to a no-op logger so local development works without Redis.
 *
 * Usage:
 * ```ts
 * import { createEventPublisher, EventTypes } from './publisher.js';
 *
 * const publisher = createEventPublisher();
 *
 * await publisher.publish({
 *   id: crypto.randomUUID(),
 *   type: EventTypes.RESUME_CREATED,
 *   source: 'resume-service',
 *   version: '1.0',
 *   timestamp: new Date().toISOString(),
 *   correlationId: req.headers['x-request-id'] as string,
 *   data: { resumeId, userId, resumeType: 'base' },
 * });
 * ```
 */

import { randomUUID } from 'node:crypto';
import type { DomainEvent, PublisherOptions } from './types.js';

const DEFAULT_STREAM_KEY = 'resumelm:events';
const DEFAULT_MAX_LENGTH = 10_000;

// ---------------------------------------------------------------------------
// Publisher interface
// ---------------------------------------------------------------------------

export interface EventPublisher {
  /** Publish a domain event to the Redis Stream. */
  publish(event: DomainEvent): Promise<void>;
  /** Gracefully disconnect from Redis. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// No-op publisher (dev / testing fallback)
// ---------------------------------------------------------------------------

class NoOpPublisher implements EventPublisher {
  async publish(event: DomainEvent): Promise<void> {
    console.info('[EventPublisher][no-op]', JSON.stringify({ type: event.type, id: event.id }));
  }

  async close(): Promise<void> {
    // Nothing to close
  }
}

// ---------------------------------------------------------------------------
// Redis Streams publisher
// ---------------------------------------------------------------------------

class RedisStreamsPublisher implements EventPublisher {
  private readonly redisUrl: string;
  private readonly streamKey: string;
  private readonly maxLength: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any | null = null;

  constructor(redisUrl: string, streamKey: string, maxLength: number) {
    this.redisUrl = redisUrl;
    this.streamKey = streamKey;
    this.maxLength = maxLength;
  }

  private async ensureConnected(): Promise<void> {
    if (this.client) return;
    const { createClient } = await import('redis');
    this.client = createClient({ url: this.redisUrl });
    this.client.on('error', (err: Error) => {
      console.error('[EventPublisher] Redis error', err.message);
    });
    await this.client.connect();
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.ensureConnected();
    // Serialize the full event envelope as a single field
    await this.client.xAdd(
      this.streamKey,
      '*',
      { payload: JSON.stringify(event) },
      { MAXLEN: { strategy: '~', threshold: this.maxLength } },
    );
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an event publisher.
 * Returns a Redis Streams publisher when ENABLE_EVENTS=true and REDIS_URL
 * is configured; otherwise returns a no-op (logging) publisher.
 */
export function createEventPublisher(opts: PublisherOptions = {}): EventPublisher {
  const enabled =
    opts.enabled ??
    (process.env['ENABLE_EVENTS'] ?? 'false').toLowerCase() === 'true';

  const redisUrl = opts.redisUrl ?? process.env['REDIS_URL'];

  if (!enabled || !redisUrl) {
    return new NoOpPublisher();
  }

  const streamKey = opts.streamKey ?? DEFAULT_STREAM_KEY;
  const maxLength = opts.maxStreamLength ?? DEFAULT_MAX_LENGTH;
  return new RedisStreamsPublisher(redisUrl, streamKey, maxLength);
}

// ---------------------------------------------------------------------------
// Helper — build a fully typed event envelope
// ---------------------------------------------------------------------------

export function buildEvent<T>(
  type: string,
  source: string,
  data: T,
  correlationId?: string,
): DomainEvent<T> {
  return {
    id: randomUUID(),
    type,
    source,
    version: '1.0',
    timestamp: new Date().toISOString(),
    correlationId,
    data,
  };
}

export { EventTypes } from './catalog.js';
export type { DomainEvent } from './types.js';
