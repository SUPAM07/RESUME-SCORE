/**
 * @module profile-service/server
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import profileRouter from './routes/profiles.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '4mb' }));
app.use(compression());

app.use('/api/v1/profiles', profileRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'profile-service' });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  logger.info('Profile Service listening', { port: config.port, env: config.nodeEnv });
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received – shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
