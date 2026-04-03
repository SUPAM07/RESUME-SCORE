import { Router } from 'express';
import jobRoutes from './jobs.js';
import healthRoutes from './health.js';

const router = Router();
router.use('/health', healthRoutes);
router.use('/jobs', jobRoutes);
export default router;
