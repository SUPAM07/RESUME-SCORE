import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { createLogger } from '@resume-score/logger';

const logger = createLogger({ service: 'api-gateway' });

export interface JWTPayload {
  sub: string;  // userId
  email: string;
  role: string;
  iat: number;
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

// Public routes that skip JWT verification
const PUBLIC_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/forgot-password',
];

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip public routes
  if (PUBLIC_PATHS.some((path) => req.path.startsWith(path))) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_001', message: 'Authorization header missing or malformed' },
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;
    req.user = payload;
    logger.debug({ userId: payload.sub, path: req.path }, 'Auth verified');
    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_003', message: 'Token has expired' },
      });
    }
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_004', message: 'Invalid token' },
    });
  }
}
