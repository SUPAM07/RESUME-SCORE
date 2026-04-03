import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest as AuthRequest } from '../middleware/auth.js';
import { resumeService } from '../services/resumeService.js';
import { pdfService } from '../services/pdfService.js';
import { ValidationError } from '../utils/errors.js';
import { CreateResumeDto, UpdateResumeDto } from '../models/resume.js';

const router = Router();

// All resume routes require authentication
router.use(requireAuth);

/** GET /resumes – list resumes for authenticated user */
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query['page'] as string ?? '1', 10);
    const limit = Math.min(parseInt(req.query['limit'] as string ?? '20', 10), 100);
    const isBase = req.query['is_base'] !== undefined
      ? req.query['is_base'] === 'true'
      : undefined;

    const result = await resumeService.list(req.user!.sub, { page, limit, isBase });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/** POST /resumes – create a new tailored resume */
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as CreateResumeDto;
    if (!body.name || !body.target_role) {
      throw new ValidationError('name and target_role are required');
    }
    const resume = await resumeService.create(req.user!.sub, { ...body, is_base_resume: false });
    res.status(201).json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
});

/** POST /resumes/base – create a new base resume */
router.post('/base', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as CreateResumeDto;
    if (!body.name) {
      throw new ValidationError('name is required');
    }
    const resume = await resumeService.create(req.user!.sub, { ...body, is_base_resume: true });
    res.status(201).json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
});

/** GET /resumes/:id – get resume by ID */
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const resume = await resumeService.getById(req.user!.sub, req.params['id']!);
    res.json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
});

/** PUT /resumes/:id – update resume */
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as UpdateResumeDto;
    const resume = await resumeService.update(req.user!.sub, req.params['id']!, body);
    res.json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
});

/** DELETE /resumes/:id – delete resume */
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await resumeService.delete(req.user!.sub, req.params['id']!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** POST /resumes/:id/duplicate – duplicate a resume */
router.post('/:id/duplicate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const resume = await resumeService.duplicate(req.user!.sub, req.params['id']!);
    res.status(201).json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
});

/** GET /resumes/:id/pdf – export resume as PDF */
router.get('/:id/pdf', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const resume = await resumeService.getById(req.user!.sub, req.params['id']!);
    const pdfBuffer = await pdfService.generatePdf(resume);

    const filename = `${resume.name.replace(/[^a-z0-9]/gi, '_')}_resume.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

export default router;
