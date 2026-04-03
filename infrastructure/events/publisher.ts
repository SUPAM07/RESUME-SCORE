/**
 * @module infrastructure/events/publisher
 *
 * Event publisher abstraction for ResumeLM microservices.
 *
 * In development / when ENABLE_EVENTS=false the publisher is a no-op logger.
 * In production, events are published to RabbitMQ via the AMQP protocol.
 *
 * Usage:
 * ```ts
 * import { createEventPublisher, EventTypes } from './publisher';
 *
 * const publisher = createEventPublisher({
 *   brokerUrl: process.env.MESSAGE_BROKER_URL,
 *   exchangeName: 'resumelm.events',
 * });
 *
 * await publisher.publish({
 *   id: crypto.randomUUID(),
 *   type: EventTypes.RESUME_CREATED,
 *   source: 'resume-service',
 *   version: '1.0',
 *   timestamp: new Date().toISOString(),
 *   correlationId: req.requestId,
 *   data: { resumeId, userId, resumeType: 'base' },
 * });
 * ```
 */

import { randomUUID } from 'node:crypto';
import type { DomainEvent, EventEnvelope } from './schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublisherOptions {
  /** AMQP broker URL, e.g. amqp://user:pass@rabbitmq:5672/vhost */
  brokerUrl?: string;
  /** Exchange name (topic exchange). Default: resumelm.events */
  exchangeName?: string;
  /** Enable/disable publishing. Default: true (reads ENABLE_EVENTS env var) */
  enabled?: boolean;
}

export interface EventPublisher {
  /**
   * Publish a domain event.  Routing key = event.type.
   * The caller is responsible for setting `id`, `timestamp`, and `correlationId`.
   */
  publish(event: DomainEvent | EventEnvelope): Promise<void>;
  /** Gracefully disconnect from the broker. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// No-op publisher (dev / testing fallback)
// ---------------------------------------------------------------------------

class NoOpPublisher implements EventPublisher {
  async publish(event: EventEnvelope): Promise<void> {
    // Log the event so it is observable in development without a broker
    console.info('[EventPublisher][no-op]', JSON.stringify({ type: event.type, id: event.id }));
  }

  async close(): Promise<void> {
    // Nothing to close
  }
}

// ---------------------------------------------------------------------------
// AMQP publisher
// ---------------------------------------------------------------------------

class AmqpPublisher implements EventPublisher {
  private readonly brokerUrl: string;
  private readonly exchangeName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any | null = null;

  constructor(brokerUrl: string, exchangeName: string) {
    this.brokerUrl = brokerUrl;
    this.exchangeName = exchangeName;
  }

  private async ensureConnected(): Promise<void> {
    if (this.channel) return;

    // Dynamic import so the package is optional at runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const amqplib = await import('amqplib');
    this.connection = await amqplib.connect(this.brokerUrl);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(this.exchangeName, 'topic', {
      durable: true,
    });
  }

  async publish(event: EventEnvelope): Promise<void> {
    await this.ensureConnected();
    const content = Buffer.from(JSON.stringify(event));
    this.channel.publish(this.exchangeName, event.type, content, {
      persistent: true,
      messageId: event.id,
      timestamp: Date.now(),
      contentType: 'application/json',
      headers: {
        'x-correlation-id': event.correlationId ?? '',
        'x-event-version': event.version,
      },
    });
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
    this.channel = null;
    this.connection = null;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an event publisher.
 * Returns an AMQP publisher when ENABLE_EVENTS=true and MESSAGE_BROKER_URL
 * is configured; otherwise returns a no-op (logging) publisher.
 */
export function createEventPublisher(opts: PublisherOptions = {}): EventPublisher {
  const enabled =
    opts.enabled ??
    (process.env['ENABLE_EVENTS'] ?? 'false').toLowerCase() === 'true';

  const brokerUrl =
    opts.brokerUrl ?? process.env['MESSAGE_BROKER_URL'];

  if (!enabled || !brokerUrl) {
    return new NoOpPublisher();
  }

  const exchangeName = opts.exchangeName ?? 'resumelm.events';
  return new AmqpPublisher(brokerUrl, exchangeName);
}

// ---------------------------------------------------------------------------
// Helper — build a fully typed event envelope
// ---------------------------------------------------------------------------

export function buildEvent<T>(
  type: string,
  source: string,
  data: T,
  correlationId?: string,
): EventEnvelope<T> {
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

export { EventTypes } from './schemas.js';
export type { DomainEvent, EventEnvelope } from './schemas.js';
