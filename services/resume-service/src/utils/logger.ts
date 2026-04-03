/**
 * @module utils/logger
 * Structured Winston logger for the resume-service.
 */

import winston from 'winston';

const { combine, timestamp, json, colorize, simple } = winston.format;

const SERVICE_NAME = 'resume-service';

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'accessToken', 'refreshToken',
  'apiKey', 'key', 'secret', 'authorization',
]);

const redactSensitive = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (SENSITIVE_KEYS.has(key)) {
      (info as Record<string, unknown>)[key] = '[REDACTED]';
    }
  }
  return info;
});

function buildWinstonLogger(level: string): winston.Logger {
  const isProduction = process.env['NODE_ENV'] === 'production';

  return winston.createLogger({
    level,
    defaultMeta: { service: SERVICE_NAME },
    format: isProduction
      ? combine(redactSensitive(), timestamp(), json())
      : combine(redactSensitive(), timestamp(), colorize(), simple()),
    transports: [new winston.transports.Console()],
  });
}

export interface ServiceLogger {
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  http(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  withRequestId(requestId?: string | string[]): ServiceLogger;
  child(meta: Record<string, unknown>): ServiceLogger;
}

function wrapLogger(winstonLogger: winston.Logger): ServiceLogger {
  return {
    error: (msg, meta) => winstonLogger.error(msg, meta),
    warn: (msg, meta) => winstonLogger.warn(msg, meta),
    info: (msg, meta) => winstonLogger.info(msg, meta),
    http: (msg, meta) => winstonLogger.http(msg, meta),
    debug: (msg, meta) => winstonLogger.debug(msg, meta),
    withRequestId: (requestId) =>
      wrapLogger(winstonLogger.child({ requestId: Array.isArray(requestId) ? requestId[0] : requestId })),
    child: (meta) => wrapLogger(winstonLogger.child(meta)),
  };
}

export function createLogger(context?: string): ServiceLogger {
  const level = process.env['LOG_LEVEL'] ?? 'info';
  const base = buildWinstonLogger(level);
  return wrapLogger(context ? base.child({ context }) : base);
}

export const logger = createLogger();
