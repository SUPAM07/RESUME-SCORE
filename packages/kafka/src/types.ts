export interface EventEnvelope<T = unknown> {
  /** Unique event ID (UUID v4) */
  eventId: string;
  /** The type of event, e.g. "user.created" */
  eventType: string;
  /** Aggregate root ID (e.g. userId, resumeId) */
  aggregateId: string;
  /** Aggregate type (e.g. "User", "Resume") */
  aggregateType: string;
  /** ISO 8601 timestamp */
  occurredAt: string;
  /** Schema version for this event */
  version: number;
  /** The event payload */
  data: T;
  /** Optional: trace ID for distributed tracing */
  traceId?: string;
  /** Optional: correlation ID linking related events */
  correlationId?: string;
  /** Service that produced this event */
  producerService: string;
  /** Schema registry ID (optional) */
  schemaId?: string;
}

export interface DeadLetterEvent<T = unknown> extends EventEnvelope<T> {
  originalTopic: string;
  failureReason: string;
  failedAt: string;
  retryCount: number;
}
