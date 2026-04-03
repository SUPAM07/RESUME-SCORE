import { Router } from 'express';
import resumeRoutes from './resumes.js';
import healthRoutes from './health.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/resumes', resumeRoutes);

export default router;
