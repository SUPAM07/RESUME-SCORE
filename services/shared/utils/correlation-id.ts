/**
 * @module @resume-lm/shared/utils/correlation-id
 *
 * Correlation ID utilities for request tracing across microservices.
 *
 * A correlation ID (also called a request ID or trace ID) is a UUID that is
 * generated at the edge (API Gateway or first service) and propagated through
 * every downstream service via the `X-Request-ID` HTTP header.  It is attached
 * to every log entry and span so that all activity related to a single user
 * request can be found in a single query.
 *
 * Usage:
 * ```ts
 * import {
 *   correlationIdMiddleware,
 *   getCorrelationId,
 *   withCorrelationId,
 * } from '@resume-lm/shared/utils/correlation-id';
 *
 * // Mount early in your Express app:
 * app.use(correlationIdMiddleware);
 *
 * // Read the current ID anywhere in the same async context:
 * const id = getCorrelationId();
 *
 * // Propagate when calling a downstream service:
 * fetch(url, { headers: withCorrelationId() });
 * ```
 */

import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Header name
// ---------------------------------------------------------------------------

/** The standard HTTP header used to carry the correlation ID. */
export const CORRELATION_ID_HEADER = 'x-request-id';

// ---------------------------------------------------------------------------
// AsyncLocalStorage context
// ---------------------------------------------------------------------------

/**
 * Per-request storage so that `getCorrelationId()` works anywhere in the
 * async call tree without passing the ID explicitly.
 */
const storage = new AsyncLocalStorage<string>();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that ensures every request has a correlation ID.
 *
 * - If the incoming request already carries an `X-Request-ID` header that
 *   header value is reused (so the ID propagated by the API Gateway is
 *   preserved).
 * - Otherwise a new UUIDv4 is generated.
 *
 * The ID is:
 *   1. Stored in `AsyncLocalStorage` so `getCorrelationId()` works throughout
 *      the request's async call chain.
 *   2. Written back to `res.setHeader('X-Request-ID', id)` so the caller
 *      receives the same ID.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const raw = req.headers[CORRELATION_ID_HEADER];
  // The header value is string | string[] | undefined in Express.
  // When forwarded by a proxy it may arrive as an array; use the first value.
  const incoming = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  const id = incoming.length > 0 ? incoming : randomUUID();

  res.setHeader(CORRELATION_ID_HEADER, id);

  storage.run(id, () => next());
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Return the correlation ID for the current async context, or `undefined`
 * when called outside of a request (e.g. during startup or background tasks).
 */
export function getCorrelationId(): string | undefined {
  return storage.getStore();
}

/**
 * Return a headers object containing the current correlation ID.
 * Useful when making outbound HTTP calls to downstream services.
 *
 * @example
 * ```ts
 * const response = await fetch(url, {
 *   headers: withCorrelationId({ 'Content-Type': 'application/json' }),
 * });
 * ```
 */
export function withCorrelationId(
  existingHeaders: Record<string, string> = {},
): Record<string, string> {
  const id = getCorrelationId();
  if (!id) return existingHeaders;
  return { ...existingHeaders, [CORRELATION_ID_HEADER]: id };
}

/**
 * Run `fn` within an async context that has `correlationId` set.
 * Useful for background jobs, workers, and unit tests.
 *
 * @example
 * ```ts
 * await runWithCorrelationId('my-job-id', async () => {
 *   logger.info('Processing job');   // will include correlationId
 * });
 * ```
 */
export function runWithCorrelationId<T>(
  correlationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(correlationId, fn);
}
