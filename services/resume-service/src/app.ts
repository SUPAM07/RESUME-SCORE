import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

// Metrics middleware — gracefully degraded when prometheus_client unavailable
let metricsMiddleware: ((req: express.Request, res: express.Response, next: express.NextFunction) => void) | null = null;
let metricsRouteHandler: ((req: express.Request, res: express.Response) => void) | null = null;

try {
  const { createMetricsMiddleware, metricsHandler } = await import(
    // @ts-expect-error — optional peer dependency
    '@resume-lm/shared/observability/metrics'
  );
  metricsMiddleware = createMetricsMiddleware('resume-service');
  metricsRouteHandler = (req: express.Request, res: express.Response) =>
    metricsHandler(req, res, () => {}, 'resume-service');
} catch {
  // Observability packages optional
}

export function createApp(): Application {
  const app = express();

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    })
  );

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Compression ────────────────────────────────────────────────────────────
  app.use(compression());

  // ── Request logging ────────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Prometheus metrics middleware ──────────────────────────────────────────
  if (metricsMiddleware) {
    app.use(metricsMiddleware);
  }

  // ── Prometheus metrics endpoint (scraped by Prometheus) ───────────────────
  if (metricsRouteHandler) {
    app.get('/metrics', metricsRouteHandler);
  }

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/api/v1', routes);

  // ── 404 handler ────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  // ── Global error handler (must be last) ────────────────────────────────────
  app.use(errorHandler);

  logger.info('Express application initialized', {
    nodeEnv: config.nodeEnv,
    corsOrigins: config.corsOrigins,
  });

  return app;
}
