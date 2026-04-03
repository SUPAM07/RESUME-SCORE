/**
 * @module billing-service/server
 */

import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import webhookRouter from './routes/webhooks.js';
import subscriptionRouter from './routes/subscriptions.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(compression());

// Raw body capture for Stripe signature verification (webhooks router)
// Must be registered before express.json() for the /webhooks path
app.use(
  '/api/v1/webhooks',
  express.raw({ type: 'application/json' }),
  (req: Request & { rawBody?: Buffer }, _res, next) => {
    req.rawBody = req.body as Buffer;
    next();
  },
);

// JSON body parsing for all other routes
app.use(express.json({ limit: '2mb' }));

app.use('/api/v1/webhooks', webhookRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'billing-service' });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  logger.info('Billing Service listening', { port: config.port, env: config.nodeEnv });
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received – shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
