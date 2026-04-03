import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { logger } from './utils/logger.js';
import { randomUUID } from 'node:crypto';

// Metrics middleware — gracefully degraded when shared observability unavailable
let metricsMiddleware: ((req: express.Request, res: express.Response, next: express.NextFunction) => void) | null = null;
let metricsRouteHandler: ((req: express.Request, res: express.Response) => void) | null = null;

try {
  const { createMetricsMiddleware, metricsHandler } = await import(
    // @ts-expect-error — optional peer dependency
    '@resume-lm/shared/observability/metrics'
  );
  metricsMiddleware = createMetricsMiddleware('job-service');
  metricsRouteHandler = (req: express.Request, res: express.Response) =>
    metricsHandler(req, res, () => {}, 'job-service');
} catch {
  // Observability packages optional
}

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(compression());

  // ── Correlation ID middleware ──────────────────────────────────────────────
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const raw = req.headers['x-request-id'];
    const requestId = (Array.isArray(raw) ? raw[0] : raw)?.trim() || randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // ── Request logging ────────────────────────────────────────────────────────
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] as string;
    res.on('finish', () => {
      logger.http(`${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        requestId,
      });
    });
    next();
  });

  // ── Prometheus metrics middleware ──────────────────────────────────────────
  if (metricsMiddleware) {
    app.use(metricsMiddleware);
  }

  // ── Prometheus metrics endpoint (scraped by Prometheus) ───────────────────
  if (metricsRouteHandler) {
    app.get('/metrics', metricsRouteHandler);
  }

  app.use('/api/v1', routes);
  app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
