/**
 * @module @resume-lm/shared/middleware/auth
 *
 * Shared JWT-verification middleware for Express-based microservices.
 *
 * Usage:
 * ```ts
 * import { requireAuth, requirePro } from '@resume-lm/shared/middleware/auth';
 *
 * router.get('/resumes', requireAuth, requirePro, handler);
 * ```
 *
 * The middleware:
 * 1. Reads the Bearer token from the `Authorization` header.
 * 2. Verifies the signature and expiry using the shared SUPABASE_JWT_SECRET.
 * 3. Attaches decoded claims to `req.user` for downstream handlers.
 * 4. Optionally verifies the user's subscription plan (requirePro).
 */

import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('auth-middleware');

// ---------------------------------------------------------------------------
// Type augmentation
// ---------------------------------------------------------------------------

/** Claims decoded from a Supabase-issued JWT */
export interface JwtClaims {
  /** Supabase user UUID — maps to `auth.users.id` */
  sub: string;
  /** User's email address */
  email: string;
  /** Subscription plan stored as a custom claim */
  subscription_plan?: 'free' | 'pro';
  /** JWT issued-at (Unix epoch seconds) */
  iat: number;
  /** JWT expiry (Unix epoch seconds) */
  exp: number;
  /** Supabase role, e.g. "authenticated" */
  role?: string;
  /** Supabase app_metadata blob */
  app_metadata?: Record<string, unknown>;
  /** Supabase user_metadata blob */
  user_metadata?: Record<string, unknown>;
}

/** Extended Express `Request` with populated user claims */
export interface AuthenticatedRequest extends Request {
  user: JwtClaims;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BEARER_PREFIX = 'Bearer ';

/**
 * Extract the raw JWT string from the `Authorization` header.
 * Returns `null` when the header is absent or malformed.
 */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Return the JWT secret from the environment, throwing a startup-time error
 * if it is not configured.
 */
function getJwtSecret(): string {
  const secret = process.env['SUPABASE_JWT_SECRET'];
  if (!secret) {
    throw new Error(
      'SUPABASE_JWT_SECRET environment variable is not set. ' +
        'Services cannot verify auth tokens without it.',
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * `requireAuth` — Express middleware that verifies the JWT in the
 * `Authorization: Bearer <token>` header.
 *
 * On success: populates `req.user` with the decoded claims and calls `next()`.
 * On failure: calls `next(AuthenticationError)`.
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return next(
        new AuthenticationError(
          'Missing or malformed Authorization header. ' +
            'Expected: Authorization: Bearer <jwt>',
        ),
      );
    }

    const secret = getJwtSecret();
    const claims = jwt.verify(token, secret) as JwtClaims;

    (req as AuthenticatedRequest).user = claims;

    logger.debug('Token verified', {
      userId: claims.sub,
      email: claims.email,
      exp: new Date(claims.exp * 1000).toISOString(),
    });

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AuthenticationError('Token has expired.'));
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return next(new AuthenticationError(`Invalid token: ${err.message}`));
    }
    // Re-throw unexpected errors (e.g. missing env var)
    next(err);
  }
}

/**
 * `requirePro` — Express middleware that asserts the authenticated user has
 * an active `pro` subscription.
 *
 * **Must** be used AFTER `requireAuth` in the middleware chain.
 */
export function requirePro(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    return next(
      new AuthenticationError(
        'requirePro must be used after requireAuth in the middleware chain.',
      ),
    );
  }

  if (user.subscription_plan !== 'pro') {
    return next(
      new AuthorizationError(
        'This feature requires a Pro subscription. ' +
          'Please upgrade your plan to access it.',
      ),
    );
  }

  next();
}

/**
 * `optionalAuth` — Like `requireAuth` but does NOT reject unauthenticated
 * requests.  If a valid token is present it populates `req.user`; otherwise
 * the handler receives an unauthenticated request.
 *
 * Useful for endpoints that behave differently for authenticated vs anonymous
 * callers.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = extractBearerToken(req);
    if (!token) return next();

    const secret = getJwtSecret();
    const claims = jwt.verify(token, secret) as JwtClaims;
    (req as AuthenticatedRequest).user = claims;
  } catch {
    // Ignore invalid tokens for optional auth
  }
  next();
}

/**
 * `requireAdmin` — Express middleware that asserts the authenticated user has
 * the `is_admin` flag set in their `app_metadata`.
 *
 * **Must** be used AFTER `requireAuth` in the middleware chain.
 */
export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    return next(
      new AuthenticationError(
        'requireAdmin must be used after requireAuth in the middleware chain.',
      ),
    );
  }

  const isAdmin = user.app_metadata?.['is_admin'] === true;
  if (!isAdmin) {
    return next(
      new AuthorizationError('Administrator privileges are required.'),
    );
  }

  next();
}
