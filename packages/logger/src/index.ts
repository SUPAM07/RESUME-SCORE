import pino, { Logger, LoggerOptions } from 'pino';
import { randomUUID } from 'crypto';

// ─── Logger Configuration ────────────────────────────────────────────────────

const isDevelopment = process.env['NODE_ENV'] !== 'production';

const baseOptions: LoggerOptions = {
  level: process.env['LOG_LEVEL'] ?? (isDevelopment ? 'debug' : 'info'),
  base: {
    service: process.env['SERVICE_NAME'] ?? 'unknown',
    env: process.env['NODE_ENV'] ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label.toUpperCase() };
    },
  },
};

const transports = isDevelopment
  ? pino.transport({ target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } })
  : undefined;

// ─── Root Logger ─────────────────────────────────────────────────────────────

const rootLogger: Logger = transports
  ? pino(baseOptions, transports)
  : pino(baseOptions);

// ─── Context-aware Child Logger ──────────────────────────────────────────────

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  traceId?: string;
  userId?: string;
  service?: string;
  [key: string]: unknown;
}

export function createLogger(context: LogContext = {}): Logger {
  return rootLogger.child({
    requestId: context.requestId ?? randomUUID(),
    ...context,
  });
}

export function withRequestId(requestId: string): Logger {
  return rootLogger.child({ requestId });
}

export function withCorrelation(correlationId: string, traceId?: string): Logger {
  return rootLogger.child({ correlationId, traceId });
}

// ─── Default export ───────────────────────────────────────────────────────────

export const logger = rootLogger;
export default rootLogger;
