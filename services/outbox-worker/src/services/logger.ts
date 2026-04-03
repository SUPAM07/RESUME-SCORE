/**
 * @module outbox-worker/services/logger
 *
 * Structured logger for the outbox worker.
 */

import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'outbox-worker' },
  transports: [new winston.transports.Console()],
});
