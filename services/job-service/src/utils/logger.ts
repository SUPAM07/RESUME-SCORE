import winston from 'winston';
import { config } from '../config/index.js';

const fmt = config.nodeEnv === 'production'
  ? winston.format.combine(winston.format.timestamp(), winston.format.json())
  : winston.format.combine(winston.format.timestamp(), winston.format.colorize(), winston.format.simple());

export const logger = winston.createLogger({
  level: config.logging.level,
  format: fmt,
  defaultMeta: { service: 'job-service' },
  transports: [new winston.transports.Console()],
});

export const createLogger = (module: string) => logger.child({ module });
