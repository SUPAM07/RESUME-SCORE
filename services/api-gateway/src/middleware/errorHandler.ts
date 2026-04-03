import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@resume-score/logger';
import { AppError } from '@resume-score/common';

const logger = createLogger({ service: 'api-gateway' });

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  const requestId = req.headers['x-request-id'] as string | undefined;

  if (err instanceof AppError) {
    logger.warn({ err, requestId, path: req.path }, 'Operational error');
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
      meta: { requestId },
    });
  }

  logger.error({ err, requestId, path: req.path }, 'Unhandled error');
  return res.status(500).json({
    success: false,
    error: { code: 'SYS_001', message: 'Internal server error' },
    meta: { requestId },
  });
}
