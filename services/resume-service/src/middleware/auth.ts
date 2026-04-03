/**
 * @module middleware/auth
 * JWT verification middleware — reads Bearer token, validates against the
 * Supabase JWT secret, and attaches decoded claims to `req.user`.
 */

import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('auth');

export interface JwtClaims {
  sub: string;
  email: string;
  subscription_plan?: 'free' | 'pro';
  iat: number;
  exp: number;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface AuthenticatedRequest extends Request {
  user: JwtClaims;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    next(new AuthenticationError('Missing or malformed Authorization header'));
    return;
  }

  try {
    const claims = jwt.verify(token, config.supabase.jwtSecret) as JwtClaims;
    (req as AuthenticatedRequest).user = claims;
    logger.debug('JWT verified', { userId: claims.sub });
    next();
  } catch (err) {
    const message = err instanceof jwt.TokenExpiredError
      ? 'Token has expired'
      : 'Invalid token';
    next(new AuthenticationError(message));
  }
}

export function requirePro(req: Request, _res: Response, next: NextFunction): void {
  const { user } = req as AuthenticatedRequest;
  if (!user) {
    next(new AuthenticationError('Authentication required'));
    return;
  }
  if (user.subscription_plan !== 'pro') {
    next(new AuthorizationError('This feature requires a Pro subscription'));
    return;
  }
  next();
}
