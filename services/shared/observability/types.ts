/**
 * @module @resume-lm/shared/observability/types
 *
 * Shared TypeScript types for the ResumeLM observability layer.
 * These types are used by the logger, tracer, metrics, and
 * correlation-id utilities.
 */

// ---------------------------------------------------------------------------
// Logging types
// ---------------------------------------------------------------------------

/** Supported log-level strings */
export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug';

/** Arbitrary structured metadata attached to a log entry */
export type LogMeta = Record<string, unknown>;

/** A structured log entry as emitted in JSON format */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Tracing types
// ---------------------------------------------------------------------------

/** Options passed to `initTracing` */
export interface TracingOptions {
  /** Short service identifier, e.g. `"resume-service"` */
  serviceName: string;
  /** Semantic version of the service (default: `"1.0.0"`) */
  serviceVersion?: string;
  /**
   * OTLP collector endpoint.
   * Defaults to `OTEL_EXPORTER_OTLP_ENDPOINT` env var or `http://jaeger:4318`.
   */
  otlpEndpoint?: string;
}

// ---------------------------------------------------------------------------
// Metrics types
// ---------------------------------------------------------------------------

/** Label set used to record an HTTP request metric */
export interface HttpRequestLabels {
  service: string;
  method: string;
  route: string;
  status_code: string;
}

/** Label set used to record an HTTP request duration histogram */
export interface HttpDurationLabels {
  service: string;
  method: string;
  route: string;
}

// ---------------------------------------------------------------------------
// Correlation ID types
// ---------------------------------------------------------------------------

/** The canonical HTTP header name used for correlation IDs */
export type CorrelationIdHeader = 'x-request-id';

/** Result of `withCorrelationId()` — a headers map ready for outbound fetch calls */
export type OutboundHeaders = Record<string, string>;
