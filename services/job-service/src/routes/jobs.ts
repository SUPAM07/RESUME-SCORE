import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { jobService } from '../services/jobService.js';
import { ValidationError } from '../utils/errors.js';
import type { CreateJobDto, UpdateJobDto } from '../models/job.ts';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt((req.query['page'] as string) ?? '1', 10);
    const limit = Math.min(parseInt((req.query['limit'] as string) ?? '20', 10), 100);
    const isActive = req.query['is_active'] !== undefined ? req.query['is_active'] === 'true' : undefined;
    const result = await jobService.list(req.user!.sub, { page, limit, isActive });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as CreateJobDto;
    if (!body.position_title) throw new ValidationError('position_title is required');
    const job = await jobService.create(req.user!.sub, body);
    res.status(201).json({ success: true, data: job });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const job = await jobService.getById(req.user!.sub, req.params['id']!);
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const job = await jobService.update(req.user!.sub, req.params['id']!, req.body as UpdateJobDto);
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await jobService.delete(req.user!.sub, req.params['id']!);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
