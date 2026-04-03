/**
 * @module @resume-lm/shared/utils/logger
 *
 * Structured logging utility built on Winston.
 *
 * Features:
 * - JSON output in production, pretty-printed in development
 * - Per-service child loggers with a `service` meta field
 * - Request-ID propagation via `withRequestId`
 * - Automatic redaction of sensitive fields
 *
 * Usage:
 * ```ts
 * import { createLogger } from '@resume-lm/shared/utils/logger';
 *
 * const logger = createLogger('resume-service');
 * logger.info('Resume created', { resumeId: '...', userId: '...' });
 *
 * // Inside an Express handler — attach a request-scoped child logger
 * const reqLogger = logger.withRequestId(req.headers['x-request-id']);
 * reqLogger.warn('Suspicious input', { field: 'job_url' });
 * ```
 */

import winston from 'winston';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Log-level labels supported by the logger */
export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug';

/** Arbitrary structured metadata attached to a log entry */
export type LogMeta = Record<string, unknown>;

/**
 * Extended Winston logger with ResumeLM-specific helpers.
 */
export interface ServiceLogger {
  error(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  http(message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
  /**
   * Create a child logger that automatically attaches `requestId` to every
   * log entry produced within the scope of a single HTTP request.
   */
  withRequestId(requestId?: string | string[]): ServiceLogger;
  /**
   * Create a child logger with additional default metadata fields.
   */
  child(meta: LogMeta): ServiceLogger;
}

// ---------------------------------------------------------------------------
// Sensitive-field redaction
// ---------------------------------------------------------------------------

/**
 * Top-level keys whose values are replaced with `[REDACTED]` before the log
 * entry is serialised.  Nested objects are not deep-scanned for performance.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'key',
  'secret',
  'stripe_secret_key',
  'supabase_service_role_key',
  'authorization',
]);

/**
 * Winston format that redacts known-sensitive top-level metadata keys.
 */
const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (SENSITIVE_KEYS.has(key)) {
      (info as Record<string, unknown>)[key] = '[REDACTED]';
    }
  }
  return info;
});

// ---------------------------------------------------------------------------
// Format configuration
// ---------------------------------------------------------------------------

const isDevelopment = process.env['NODE_ENV'] !== 'production';

/** Human-readable console format used in development */
const devFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service, requestId, ...meta }) => {
    const svc = service ? `[${service}]` : '';
    const rid = requestId ? ` rid=${requestId}` : '';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}${svc}${rid}: ${message}${metaStr}`;
  }),
);

/** Machine-readable JSON format used in production / CI */
const prodFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// ---------------------------------------------------------------------------
// Root logger factory
// ---------------------------------------------------------------------------

/**
 * Determine the effective log level from the environment.
 * Falls back to `'info'` in production and `'debug'` elsewhere.
 */
function resolveLogLevel(): LogLevel {
  const envLevel = process.env['LOG_LEVEL'];
  const valid: LogLevel[] = ['error', 'warn', 'info', 'http', 'debug'];
  if (envLevel && valid.includes(envLevel as LogLevel)) {
    return envLevel as LogLevel;
  }
  return isDevelopment ? 'debug' : 'info';
}

/** Singleton root Winston logger shared across all child loggers */
const rootLogger = winston.createLogger({
  level: resolveLogLevel(),
  format: isDevelopment ? devFormat : prodFormat,
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

// ---------------------------------------------------------------------------
// ServiceLogger wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a Winston `Logger` (or child logger) in the `ServiceLogger` interface,
 * adding the `withRequestId` and `child` convenience helpers.
 */
function wrapLogger(inner: winston.Logger): ServiceLogger {
  return {
    error: (msg, meta) => inner.error(msg, meta),
    warn: (msg, meta) => inner.warn(msg, meta),
    info: (msg, meta) => inner.info(msg, meta),
    http: (msg, meta) => inner.http(msg, meta),
    debug: (msg, meta) => inner.debug(msg, meta),

    withRequestId(requestId) {
      const rid = Array.isArray(requestId) ? requestId[0] : requestId;
      return wrapLogger(inner.child({ requestId: rid ?? 'unknown' }));
    },

    child(meta) {
      return wrapLogger(inner.child(meta));
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a named service logger.
 *
 * @param serviceName  Short identifier for the service, e.g. `"resume-service"`.
 *                     Included in every log entry as the `service` field.
 * @returns A `ServiceLogger` scoped to the given service name.
 *
 * @example
 * ```ts
 * const logger = createLogger('ai-service');
 * logger.info('Model request started', { model: 'claude-3-5-sonnet-20241022' });
 * ```
 */
export function createLogger(serviceName: string): ServiceLogger {
  return wrapLogger(rootLogger.child({ service: serviceName }));
}

/**
 * Express request-logging middleware.
 * Logs method, URL, status code and response time at the `http` level.
 *
 * @param logger  A `ServiceLogger` (typically the service root logger).
 *
 * @example
 * ```ts
 * app.use(requestLogger(logger));
 * ```
 */
export function requestLogger(
  logger: ServiceLogger,
): (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => void {
  return (req, res, next) => {
    const start = Date.now();
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();

    // Attach a request-scoped logger for use in downstream handlers
    (req as unknown as Record<string, unknown>)['logger'] = logger.withRequestId(requestId);

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.http(`${req.method} ${req.url}`, {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        durationMs: duration,
        requestId,
        userAgent: req.headers['user-agent'],
      });
    });

    next();
  };
}

/** Re-export the root logger for cases where a service logger is overkill */
export const rootServiceLogger = wrapLogger(rootLogger);
