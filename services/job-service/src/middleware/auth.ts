import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AuthenticationError } from '../utils/errors.js';

export interface JwtClaims { sub: string; email: string; role?: string; iat: number; exp: number; }
export interface AuthRequest extends Request { user?: JwtClaims; }

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) { next(new AuthenticationError()); return; }
  const token = header.slice(7).trim();
  try {
    const claims = jwt.verify(token, config.supabase.jwtSecret) as JwtClaims;
    (req as AuthRequest).user = claims;
    next();
  } catch {
    next(new AuthenticationError('Invalid or expired token'));
  }
}
