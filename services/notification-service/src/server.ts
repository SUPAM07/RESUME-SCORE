/**
 * @module notification-service/server
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import streamRouter from './routes/stream.js';
import { startEventConsumer, stopEventConsumer } from './consumers/eventConsumer.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.use('/api/v1/notifications/stream', streamRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Start the Redis Streams consumer in the background
startEventConsumer().catch((err) => {
  logger.error('Failed to start event consumer', { error: (err as Error).message });
});

const server = app.listen(config.port, () => {
  logger.info('Notification Service listening', { port: config.port, env: config.nodeEnv });
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} received – shutting down`);
  await stopEventConsumer();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
