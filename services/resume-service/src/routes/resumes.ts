import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  listResumes,
  createResume,
  getResumeById,
  updateResume,
  deleteResume,
  duplicateResume,
} from '../services/resumeService.js';
import { generatePdf } from '../services/pdfService.js';
import { ValidationError } from '../utils/errors.js';
import type { CreateResumeBody, UpdateResumeBody } from '../models/resume.js';

const router = Router();

// All resume routes require authentication
router.use(requireAuth);

/** GET /resumes – list resumes for authenticated user */
router.get('/', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const page = parseInt(req.query['page'] as string ?? '1', 10);
    const limit = Math.min(parseInt(req.query['limit'] as string ?? '20', 10), 100);
    const isBase = req.query['is_base'] !== undefined
      ? req.query['is_base'] === 'true'
      : undefined;

    const result = await listResumes({ userId: authReq.user.sub, page, limit, isBaseResume: isBase });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}) as (req: Request, res: Response, next: NextFunction) => void);

/** POST /resumes – create a new tailored resume */
router.post('/', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as CreateResumeBody;
    if (!body.name || !body.target_role) {
      throw new ValidationError('name and target_role are required');
    }
    const resume = await createResume(authReq.user.sub, { ...body, is_base_resume: false });
    res.status(201).json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
}) as (req: Request, res: Response, next: NextFunction) => void);

/** POST /resumes/base – create a new base resume */
router.post('/base', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as CreateResumeBody;
    if (!body.name) {
      throw new ValidationError('name is required');
    }
    const resume = await createResume(authReq.user.sub, { ...body, is_base_resume: true });
    res.status(201).json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
}) as (req: Request, res: Response, next: NextFunction) => void);

/** GET /resumes/:id – get resume by ID */
router.get('/:id', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const resume = await getResumeById(req.params['id'] as string, authReq.user.sub);
    res.json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
}) as (req: Request, res: Response, next: NextFunction) => void);

/** PUT /resumes/:id – update resume */
router.put('/:id', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as UpdateResumeBody;
    const resume = await updateResume(req.params['id'] as string, authReq.user.sub, body);
    res.json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
}) as (req: Request, res: Response, next: NextFunction) => void);

/** DELETE /resumes/:id – delete resume */
router.delete('/:id', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    await deleteResume(req.params['id'] as string, authReq.user.sub);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}) as (req: Request, res: Response, next: NextFunction) => void);

/** POST /resumes/:id/duplicate – duplicate a resume */
router.post('/:id/duplicate', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const resume = await duplicateResume(req.params['id'] as string, authReq.user.sub);
    res.status(201).json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
}) as (req: Request, res: Response, next: NextFunction) => void);

/** GET /resumes/:id/pdf – export resume as PDF */
router.get('/:id/pdf', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const resume = await getResumeById(req.params['id'] as string, authReq.user.sub);
    const pdfBuffer = await generatePdf(resume);

    const filename = `${resume.name.replace(/[^a-z0-9]/gi, '_')}_resume.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}) as (req: Request, res: Response, next: NextFunction) => void);

export default router;
