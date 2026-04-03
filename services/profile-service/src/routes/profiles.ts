/**
 * @module profile-service/routes/profiles
 */

import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import * as profileService from '../services/profileService.js';
import { publishProfileUpdated } from '../events/profilePublisher.js';

const router = Router();

router.use(requireAuth);

/** GET /profiles/me – get the authenticated user's profile */
router.get('/me', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await profileService.getProfile(req.user.sub);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

/** PUT /profiles/me – create or update the authenticated user's profile */
router.put('/me', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await profileService.upsertProfile(req.user.sub, req.body);
    const updatedFields = Object.keys(req.body);
    await publishProfileUpdated(req.user.sub, updatedFields, req.requestId);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
});

/** DELETE /profiles/me – delete the authenticated user's profile */
router.delete('/me', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await profileService.deleteProfile(req.user.sub);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
