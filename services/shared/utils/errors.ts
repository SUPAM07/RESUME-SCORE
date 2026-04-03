/**
 * @module @resume-lm/shared/utils/errors
 *
 * Common application error classes and an Express error-handling middleware.
 *
 * All domain errors extend `AppError`, which carries:
 * - `statusCode` — the HTTP status to return
 * - `code`       — a machine-readable identifier safe for clients to switch on
 * - `isOperational` — distinguishes expected failures from programmer bugs
 *
 * Usage:
 * ```ts
 * import { NotFoundError, errorHandler } from '@resume-lm/shared/utils/errors';
 *
 * // Inside a handler:
 * throw new NotFoundError('Resume', resumeId);
 *
 * // At the end of your Express app:
 * app.use(errorHandler);
 * ```
 */

import type { NextFunction, Request, Response } from 'express';
import type { ApiError, ApiResponse } from '../contracts/api.js';
import { createLogger } from './logger.js';

const logger = createLogger('error-handler');

// ---------------------------------------------------------------------------
// Error codes (machine-readable strings sent to API clients)
// ---------------------------------------------------------------------------

export const ErrorCode = {
  // 4xx
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  // 5xx
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ---------------------------------------------------------------------------
// Base error class
// ---------------------------------------------------------------------------

/**
 * Base class for all ResumeLM application errors.
 *
 * Set `isOperational = false` for programmer errors (bugs) that should trigger
 * an alert / process restart, and `true` for expected failures that the client
 * can recover from (invalid input, not found, etc.).
 */
export class AppError extends Error {
  /** HTTP status code */
  readonly statusCode: number;
  /** Machine-readable error code */
  readonly code: ErrorCode;
  /**
   * `true`  → expected, recoverable failure (bad input, not found…)
   * `false` → unexpected bug that should alert on-call
   */
  readonly isOperational: boolean;
  /** Optional field-level validation details */
  readonly details?: Record<string, string[]> | undefined;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    isOperational = true,
    details?: Record<string, string[]> | undefined,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    // Maintains a proper prototype chain in transpiled output
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  /** Serialise to the `ApiError` contract shape */
  toApiError(): ApiError {
    const error: ApiError = {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
    if (this.details !== undefined) {
      error.details = this.details;
    }
    return error;
  }
}

// ---------------------------------------------------------------------------
// 4xx errors
// ---------------------------------------------------------------------------

/**
 * 400 Bad Request — the client sent a syntactically invalid request.
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request.', details?: Record<string, string[]>) {
    super(message, 400, ErrorCode.BAD_REQUEST, true, details);
  }
}

/**
 * 400 Validation Error — the request body failed schema / business-rule
 * validation.  Include `details` for field-level feedback.
 *
 * @example
 * ```ts
 * throw new ValidationError('Invalid resume data', {
 *   name: ['Must be at least 1 character'],
 *   email: ['Invalid e-mail address'],
 * });
 * ```
 */
export class ValidationError extends AppError {
  constructor(
    message = 'Validation failed.',
    details?: Record<string, string[]>,
  ) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, true, details);
  }
}

/**
 * 401 Authentication Error — no valid credentials were supplied.
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 401, ErrorCode.AUTHENTICATION_ERROR);
  }
}

/**
 * 403 Authorization Error — credentials are valid but insufficient.
 */
export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 403, ErrorCode.AUTHORIZATION_ERROR);
  }
}

/**
 * 404 Not Found — the requested resource does not exist (or is invisible to
 * the caller due to RLS policies).
 *
 * @example
 * ```ts
 * throw new NotFoundError('Resume', resumeId);
 * // message: "Resume with id 'abc-123' was not found."
 * ```
 */
export class NotFoundError extends AppError {
  constructor(resourceType: string, id?: string) {
    const idPart = id ? ` with id '${id}'` : '';
    super(`${resourceType}${idPart} was not found.`, 404, ErrorCode.NOT_FOUND);
  }
}

/**
 * 409 Conflict — the request could not be completed because of a state
 * conflict, e.g. a duplicate record.
 */
export class ConflictError extends AppError {
  constructor(message = 'A conflict occurred. The resource may already exist.') {
    super(message, 409, ErrorCode.CONFLICT);
  }
}

/**
 * 422 Unprocessable Entity — the request is well-formed but semantically
 * invalid (e.g. referential integrity violation).
 */
export class UnprocessableEntityError extends AppError {
  constructor(
    message = 'The request could not be processed.',
    details?: Record<string, string[]>,
  ) {
    super(message, 422, ErrorCode.UNPROCESSABLE_ENTITY, true, details);
  }
}

/**
 * 429 Rate Limited — the caller has exceeded the allowed request rate.
 */
export class RateLimitError extends AppError {
  /** Unix epoch seconds — when the caller may retry */
  readonly retryAfter?: number | undefined;

  constructor(message = 'Too many requests. Please slow down.', retryAfter?: number | undefined) {
    super(message, 429, ErrorCode.RATE_LIMITED);
    this.retryAfter = retryAfter;
  }
}

// ---------------------------------------------------------------------------
// 5xx errors
// ---------------------------------------------------------------------------

/**
 * 500 Internal Server Error — an unexpected programmer error.
 * `isOperational` is `false` to trigger alerting.
 */
export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred.', cause?: unknown) {
    super(message, 500, ErrorCode.INTERNAL_ERROR, false);
    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * 502 Upstream Error — a downstream service returned an unexpected response.
 */
export class UpstreamError extends AppError {
  constructor(
    upstreamService: string,
    message = 'Upstream service returned an error.',
  ) {
    super(`[${upstreamService}] ${message}`, 502, ErrorCode.UPSTREAM_ERROR, false);
  }
}

/**
 * 503 Service Unavailable — a required dependency (DB, cache, AI provider)
 * is temporarily unreachable.
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable. Please try again later.') {
    super(message, 503, ErrorCode.SERVICE_UNAVAILABLE, true);
  }
}

/**
 * 500 Database Error — a Supabase / PostgreSQL operation failed unexpectedly.
 */
export class DatabaseError extends AppError {
  constructor(operation: string, cause?: unknown) {
    super(
      `Database operation '${operation}' failed.`,
      500,
      ErrorCode.DATABASE_ERROR,
      false,
    );
    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Express error-handling middleware
// ---------------------------------------------------------------------------

/**
 * Central Express error handler.
 *
 * Register this **last** in your Express app, after all routes and middleware:
 * ```ts
 * app.use(errorHandler);
 * ```
 *
 * Behaviour:
 * - Operational `AppError` → structured JSON response + `warn` log
 * - Non-operational / unknown errors → generic 500 + `error` log with stack
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId =
    (req.headers['x-request-id'] as string | undefined) ?? 'unknown';

  if (err instanceof AppError) {
    if (err.isOperational) {
      logger.warn(err.message, {
        code: err.code,
        statusCode: err.statusCode,
        requestId,
        path: req.path,
        method: req.method,
      });
    } else {
      logger.error(err.message, {
        code: err.code,
        statusCode: err.statusCode,
        requestId,
        path: req.path,
        method: req.method,
        stack: err.stack,
      });
    }

    // Attach Retry-After header for rate-limit errors
    if (err instanceof RateLimitError && err.retryAfter !== undefined) {
      res.setHeader('Retry-After', String(err.retryAfter));
    }

    const body: ApiResponse<never> = {
      success: false,
      error: err.toApiError(),
      requestId,
    };

    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown / non-operational error
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error('Unhandled error', {
    message,
    stack,
    requestId,
    path: req.path,
    method: req.method,
  });

  const body: ApiResponse<never> = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
      statusCode: 500,
    },
    requestId,
  };

  res.status(500).json(body);
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Type-guard — returns `true` when `value` is an `AppError` instance.
 */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Wrap an unknown caught value in an `AppError`.
 *
 * @example
 * ```ts
 * try {
 *   await db.insert(resume);
 * } catch (err) {
 *   throw toAppError(err, 'Failed to insert resume');
 * }
 * ```
 */
export function toAppError(err: unknown, fallbackMessage?: string): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    return new InternalError(fallbackMessage ?? err.message, err);
  }
  return new InternalError(fallbackMessage ?? String(err));
}
