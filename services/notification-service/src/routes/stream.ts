/**
 * @module notification-service/routes/stream
 *
 * GET /stream/:userId – SSE endpoint.
 * Clients subscribe here to receive real-time notifications via
 * Server-Sent Events.
 *
 * Authentication: Bearer JWT required.
 * Users may only subscribe to their own notification stream.
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { addConnection, removeConnection, totalConnections } from '../channels/sse.js';
import { logger } from '../utils/logger.js';

const router = Router();

interface JwtClaims {
  sub: string;
}

/** GET /stream – SSE endpoint for the authenticated user */
router.get('/', (req: Request, res: Response): void => {
  // Validate JWT (from Authorization header or query param for browser EventSource)
  const header = req.headers.authorization ?? '';
  const queryToken = req.query['token'] as string | undefined;
  const raw = header.startsWith('Bearer ') ? header.slice(7) : (queryToken ?? '');

  if (!raw) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  let claims: JwtClaims;
  try {
    claims = jwt.verify(raw, config.supabase.jwtSecret) as JwtClaims;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const userId = claims.sub;
  const conn = addConnection(userId, res);

  logger.info('SSE client connected', { userId, total: totalConnections() });

  req.on('close', () => {
    removeConnection(conn);
    logger.info('SSE client disconnected', { userId, total: totalConnections() });
  });
});

export default router;
