/**
 * @module profile-service/middleware/auth
 * JWT verification middleware for the profile service.
 */

import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface JwtClaims {
  sub: string;
  email: string;
  subscription_plan?: 'free' | 'pro';
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user: JwtClaims;
  requestId?: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing Authorization header' });
    return;
  }
  const token = header.slice(7).trim();
  try {
    const claims = jwt.verify(token, config.supabase.jwtSecret) as JwtClaims;
    (req as AuthenticatedRequest).user = claims;
    (req as AuthenticatedRequest).requestId =
      req.headers['x-request-id'] as string | undefined;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
