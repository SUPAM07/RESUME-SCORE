import { Router, Request, Response } from 'express';
import { checkDbConnection } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';

const router = Router();

/** GET /health – liveness + readiness probe */
router.get('/', async (_req: Request, res: Response) => {
  const start = Date.now();
  let dbStatus: 'ok' | 'error' = 'ok';

  try {
    await checkDbConnection();
  } catch (err) {
    dbStatus = 'error';
    logger.warn('Health check: DB connection failed', { error: (err as Error).message });
  }

  const status = dbStatus === 'ok' ? 200 : 503;
  res.status(status).json({
    success: status === 200,
    status: status === 200 ? 'healthy' : 'degraded',
    service: 'resume-service',
    version: process.env.npm_package_version ?? '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTimeMs: Date.now() - start,
    checks: {
      database: dbStatus,
    },
  });
});

export default router;
