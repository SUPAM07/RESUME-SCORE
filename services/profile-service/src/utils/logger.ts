/**
 * @module profile-service/utils/logger
 */

import winston from 'winston';
import { config } from '../config/index.js';

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'profile-service' },
  transports: [new winston.transports.Console()],
});
