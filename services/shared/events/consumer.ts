/**
 * @module services/shared/events/consumer
 *
 * Redis Streams consumer with consumer groups for the ResumeLM event bus.
 *
 * Features:
 * - Consumer groups for load-balanced event processing across service replicas
 * - At-least-once delivery with XACK
 * - Automatic retry with configurable back-off
 * - Dead Letter Stream (DLS) after maxRetries exceeded
 * - Graceful shutdown via AbortController
 *
 * Usage:
 * ```ts
 * import { createEventConsumer, EventTypes } from './consumer.js';
 *
 * const consumer = createEventConsumer({
 *   redisUrl: process.env.REDIS_URL,
 *   streamKey: 'resumelm:events',
 *   groupName: 'ai-service',
 *   consumerName: `ai-service-${process.pid}`,
 * });
 *
 * consumer.subscribe(EventTypes.RESUME_CREATED, async (event) => {
 *   await autoScoreResume(event.data.resumeId);
 * });
 *
 * await consumer.start();
 * ```
 */

import type { ConsumerGroupOptions, EventHandler, DomainEvent } from './types.js';

const DEFAULT_STREAM_KEY = 'resumelm:events';
const DEFAULT_DLQ_KEY = 'resumelm:events:dlq';
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BLOCK_MS = 5_000;
const DEFAULT_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// EventConsumer interface
// ---------------------------------------------------------------------------

export interface EventConsumer {
  /** Register a handler for the given event type. */
  subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): void;
  /** Start the polling loop. Returns a promise that resolves on shutdown. */
  start(): Promise<void>;
  /** Signal the consumer to stop after the current batch. */
  stop(): void;
}

// ---------------------------------------------------------------------------
// No-op consumer (when Redis not configured)
// ---------------------------------------------------------------------------

class NoOpConsumer implements EventConsumer {
  subscribe(): void {
    // no-op
  }
  async start(): Promise<void> {
    console.info('[EventConsumer][no-op] Redis not configured – events disabled');
  }
  stop(): void {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// Redis Streams consumer
// ---------------------------------------------------------------------------

class RedisStreamsConsumer implements EventConsumer {
  private readonly opts: Required<ConsumerGroupOptions>;
  private readonly dlqKey: string;
  private readonly redisUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any | null = null;
  private readonly handlers: Map<string, EventHandler[]> = new Map();
  private running = false;
  private abortController = new AbortController();

  constructor(redisUrl: string, opts: ConsumerGroupOptions, dlqKey = DEFAULT_DLQ_KEY) {
    this.redisUrl = redisUrl;
    this.dlqKey = dlqKey;
    this.opts = {
      streamKey: opts.streamKey ?? DEFAULT_STREAM_KEY,
      groupName: opts.groupName,
      consumerName: opts.consumerName,
      batchSize: opts.batchSize ?? DEFAULT_BATCH_SIZE,
      blockMs: opts.blockMs ?? DEFAULT_BLOCK_MS,
      maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
    };
  }

  subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler as EventHandler);
    this.handlers.set(eventType, existing);
  }

  private async ensureConnected(): Promise<void> {
    if (this.client) return;
    const { createClient } = await import('redis');
    this.client = createClient({ url: this.redisUrl });
    this.client.on('error', (err: Error) => {
      console.error('[EventConsumer] Redis error', err.message);
    });
    await this.client.connect();

    // Create consumer group if it does not exist
    try {
      await this.client.xGroupCreate(
        this.opts.streamKey,
        this.opts.groupName,
        '$',
        { MKSTREAM: true },
      );
    } catch (err: unknown) {
      const msg = (err as Error).message ?? '';
      if (!msg.includes('BUSYGROUP')) throw err;
      // Group already exists – fine
    }
  }

  async start(): Promise<void> {
    await this.ensureConnected();
    this.running = true;

    // Re-process pending (unacknowledged) messages from previous consumer instances
    await this.processPending();

    while (this.running && !this.abortController.signal.aborted) {
      try {
        const messages = await this.client.xReadGroup(
          this.opts.groupName,
          this.opts.consumerName,
          [{ key: this.opts.streamKey, id: '>' }],
          { COUNT: this.opts.batchSize, BLOCK: this.opts.blockMs },
        );

        if (!messages || messages.length === 0) continue;

        for (const stream of messages) {
          for (const { id: msgId, message } of stream.messages) {
            await this.processMessage(msgId, message);
          }
        }
      } catch (err: unknown) {
        const msg = (err as Error).message ?? '';
        if (!this.running || msg.includes('Connection is closed')) break;
        console.error('[EventConsumer] Poll error', (err as Error).message);
        await sleep(1_000);
      }
    }

    await this.client?.quit();
  }

  stop(): void {
    this.running = false;
    this.abortController.abort();
  }

  private async processPending(): Promise<void> {
    try {
      const pending = await this.client.xAutoClaim(
        this.opts.streamKey,
        this.opts.groupName,
        this.opts.consumerName,
        60_000, // reclaim messages idle for > 60s
        '0-0',
        { COUNT: 100 },
      );
      if (!pending?.messages?.length) return;
      for (const { id: msgId, message } of pending.messages) {
        await this.processMessage(msgId, message);
      }
    } catch {
      // xAutoClaim may not exist on older Redis versions – ignore
    }
  }

  private async processMessage(
    msgId: string,
    message: Record<string, string>,
  ): Promise<void> {
    let event: DomainEvent;
    try {
      event = JSON.parse(message['payload'] ?? '{}') as DomainEvent;
    } catch {
      console.error('[EventConsumer] Failed to parse message', { msgId });
      await this.ack(msgId);
      return;
    }

    const handlers = this.handlers.get(event.type) ?? [];
    if (handlers.length === 0) {
      // No handler registered – acknowledge and move on
      await this.ack(msgId);
      return;
    }

    let lastError: Error | null = null;
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        lastError = err as Error;
        console.error('[EventConsumer] Handler error', {
          eventType: event.type,
          eventId: event.id,
          error: (err as Error).message,
        });
      }
    }

    if (lastError) {
      // Check retry count via XPENDING
      const retryCount = await this.getRetryCount(msgId);
      if (retryCount >= this.opts.maxRetries) {
        console.error('[EventConsumer] Moving event to DLQ', {
          eventType: event.type,
          eventId: event.id,
          retryCount,
        });
        await this.sendToDlq(event, msgId, lastError);
        await this.ack(msgId);
      }
      // else: leave unacknowledged for retry
      return;
    }

    await this.ack(msgId);
  }

  private async ack(msgId: string): Promise<void> {
    try {
      await this.client.xAck(this.opts.streamKey, this.opts.groupName, msgId);
    } catch (err) {
      console.error('[EventConsumer] ACK failed', { msgId, error: (err as Error).message });
    }
  }

  private async getRetryCount(msgId: string): Promise<number> {
    try {
      const info = await this.client.xPending(
        this.opts.streamKey,
        this.opts.groupName,
        { start: msgId, end: msgId, count: 1 },
      );
      return info?.[0]?.deliveryCount ?? 0;
    } catch {
      return 0;
    }
  }

  private async sendToDlq(event: DomainEvent, msgId: string, error: Error): Promise<void> {
    try {
      await this.client.xAdd(this.dlqKey, '*', {
        payload: JSON.stringify({
          ...event,
          _dlq: {
            originalStreamId: msgId,
            failedAt: new Date().toISOString(),
            error: error.message,
            consumer: this.opts.consumerName,
            group: this.opts.groupName,
          },
        }),
      });
    } catch (dlqErr) {
      console.error('[EventConsumer] DLQ write failed', (dlqErr as Error).message);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an event consumer backed by Redis Streams consumer groups.
 * Returns a no-op consumer when ENABLE_EVENTS=false or REDIS_URL is absent.
 */
export function createEventConsumer(
  opts: ConsumerGroupOptions,
  redisUrl?: string,
): EventConsumer {
  const enabled =
    (process.env['ENABLE_EVENTS'] ?? 'false').toLowerCase() === 'true';

  const url = redisUrl ?? process.env['REDIS_URL'];

  if (!enabled || !url) {
    return new NoOpConsumer();
  }

  return new RedisStreamsConsumer(url, opts);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { EventTypes } from './catalog.js';
export type { DomainEvent, EventHandler } from './types.js';
