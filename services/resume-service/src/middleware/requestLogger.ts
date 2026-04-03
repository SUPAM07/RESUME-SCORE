/**
 * @module middleware/requestLogger
 * HTTP request / response logging middleware using Winston.
 * Attaches a per-request UUID to every log entry produced during the request.
 */

import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      startTime: [number, number];
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  req.startTime = process.hrtime();

  res.setHeader('X-Request-ID', req.requestId);

  const reqLogger = logger.withRequestId(req.requestId);

  reqLogger.http('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.on('finish', () => {
    const [sec, ns] = process.hrtime(req.startTime);
    const ms = (sec * 1e3 + ns / 1e6).toFixed(2);

    reqLogger.http('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: ms,
    });
  });

  next();
}
