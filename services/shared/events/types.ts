/**
 * @module services/shared/events/types
 *
 * Core DomainEvent<T> interface and supporting types for the
 * Redis Streams event bus.
 */

// ---------------------------------------------------------------------------
// Domain event envelope
// ---------------------------------------------------------------------------

export interface DomainEvent<T = unknown> {
  /** Globally unique event identifier (UUIDv4). */
  id: string;
  /** Dot-namespaced event type, e.g. "resume.created". */
  type: string;
  /** Originating service name, e.g. "resume-service". */
  source: string;
  /** Schema version string, e.g. "1.0". */
  version: string;
  /** ISO-8601 UTC timestamp when the event was produced. */
  timestamp: string;
  /**
   * Correlation ID carried forward from the inbound HTTP request.
   * Used to correlate events across services in distributed traces.
   */
  correlationId?: string;
  /** Event-specific payload. */
  data: T;
}

// ---------------------------------------------------------------------------
// Handler types
// ---------------------------------------------------------------------------

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void>;

export interface EventHandlerMap {
  [eventType: string]: EventHandler[];
}

// ---------------------------------------------------------------------------
// Consumer group configuration
// ---------------------------------------------------------------------------

export interface ConsumerGroupOptions {
  /** Redis Streams key, e.g. "resumelm:events". */
  streamKey: string;
  /** Consumer group name, e.g. "ai-service". */
  groupName: string;
  /** Consumer instance name, e.g. "ai-service-1". */
  consumerName: string;
  /** Maximum number of events fetched per poll. Default: 10. */
  batchSize?: number;
  /** Milliseconds to block waiting for new events. Default: 5000. */
  blockMs?: number;
  /** Maximum retries before sending to DLQ. Default: 3. */
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// Publisher options
// ---------------------------------------------------------------------------

export interface PublisherOptions {
  /** Redis URL, e.g. "redis://localhost:6379". */
  redisUrl?: string;
  /** Redis Streams key. Default: "resumelm:events". */
  streamKey?: string;
  /** Maximum stream length (approximate). Default: 10000. */
  maxStreamLength?: number;
  /** Enable/disable publishing. Reads ENABLE_EVENTS env var. */
  enabled?: boolean;
}
