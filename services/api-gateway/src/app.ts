import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { createLogger } from '@resume-score/logger';
import { requestIdMiddleware } from './middleware/requestId.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { proxyRouter } from './routes/proxy.js';
import { config } from './config/index.js';

const logger = createLogger({ service: 'api-gateway' });

export function createApp() {
  const app = express();

  // ─── Security Middleware ────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }));

  app.use(cors({
    origin: config.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Trace-ID'],
  }));

  app.use(compression());

  // ─── Rate Limiting ──────────────────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: 60 * 1000,        // 1 minute
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.toString() ?? req.ip ?? 'unknown',
    skip: (req) => req.path === '/health',
  });

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    message: { error: 'AI rate limit exceeded. Please wait before making more requests.' },
  });

  app.use(limiter);
  app.use('/api/v1/ai', aiLimiter);

  // ─── Request Middleware ─────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);

  // Log incoming requests
  app.use((req, _res, next) => {
    logger.info({
      method: req.method,
      path: req.path,
      requestId: req.headers['x-request-id'],
      userAgent: req.headers['user-agent'],
    }, 'Incoming request');
    next();
  });

  // ─── Routes ─────────────────────────────────────────────────────────────────
  app.use('/health', healthRouter);

  // Protected routes — require valid JWT
  app.use('/api/v1', authMiddleware, proxyRouter);

  // ─── Error Handling ─────────────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
