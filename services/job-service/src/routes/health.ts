import { Router, Request, Response } from 'express';
import { checkDbConnection } from '../utils/supabase.js';

const router = Router();
router.get('/', async (_req: Request, res: Response) => {
  let dbStatus: 'ok' | 'error' = 'ok';
  try { await checkDbConnection(); } catch { dbStatus = 'error'; }
  const status = dbStatus === 'ok' ? 200 : 503;
  res.status(status).json({
    success: status === 200, service: 'job-service',
    timestamp: new Date().toISOString(), checks: { database: dbStatus },
  });
});
export default router;
