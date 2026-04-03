/**
 * @module middleware/errorHandler
 * Global Express error-handling middleware.
 * Converts AppError subclasses to structured JSON responses and logs
 * unexpected errors as critical.
 */

import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';
  const reqLogger = logger.withRequestId(requestId);

  if (err instanceof AppError) {
    if (!err.isOperational) {
      reqLogger.error('Unexpected application error', {
        name: err.name,
        code: err.code,
        message: err.message,
        stack: err.stack,
      });
    } else {
      reqLogger.warn('Operational error', {
        name: err.name,
        code: err.code,
        statusCode: err.statusCode,
        message: err.message,
      });
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        ...(err.details && { details: err.details }),
      },
      requestId,
    });
    return;
  }

  // Unknown / programmer error
  reqLogger.error('Unhandled error', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      statusCode: 500,
    },
    requestId,
  });
}
