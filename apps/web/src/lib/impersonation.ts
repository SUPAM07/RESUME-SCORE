import { createHmac, timingSafeEqual } from 'node:crypto';

export const IMPERSONATION_STATE_COOKIE_NAME = 'impersonation_state';
export const IMPERSONATION_STATE_MAX_AGE_SECONDS = 60 * 60;

interface ImpersonationStatePayload {
  adminUserId: string;
  impersonatedUserId: string;
  issuedAt: number;
  expiresAt: number;
}

interface CreateImpersonationStateInput {
  adminUserId: string;
  impersonatedUserId: string;
  maxAgeSeconds?: number;
}

function getImpersonationSecret(): string {
  const configuredSecret = process.env.IMPERSONATION_COOKIE_SECRET;
  if (configuredSecret?.length) return configuredSecret;

  const fallbackSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fallbackSecret?.length) return fallbackSecret;

  throw new Error('Missing impersonation cookie secret');
}

function signPayload(payload: string): string {
  return createHmac('sha256', getImpersonationSecret())
    .update(payload)
    .digest('base64url');
}

function hasValidSignature(payload: string, signature: string): boolean {
  try {
    const expectedSignature = signPayload(payload);
    const expected = Buffer.from(expectedSignature, 'utf8');
    const actual = Buffer.from(signature, 'utf8');

    if (expected.length !== actual.length) return false;

    return timingSafeEqual(expected, actual);
  } catch (err) {
    console.error('Error validating signature:', err);
    return false;
  }
}

export function createImpersonationStateCookieValue({
  adminUserId,
  impersonatedUserId,
  maxAgeSeconds = IMPERSONATION_STATE_MAX_AGE_SECONDS,
}: CreateImpersonationStateInput): string {
  // Validate inputs
  if (!adminUserId || typeof adminUserId !== 'string') {
    throw new Error('Invalid adminUserId');
  }
  if (!impersonatedUserId || typeof impersonatedUserId !== 'string') {
    throw new Error('Invalid impersonatedUserId');
  }

  const now = Date.now();
  const payload: ImpersonationStatePayload = {
    adminUserId,
    impersonatedUserId,
    issuedAt: now,
    expiresAt: now + maxAgeSeconds * 1000,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const signature = signPayload(payloadBase64);

  return `${payloadBase64}.${signature}`;
}

export function parseImpersonationStateCookieValue(
  cookieValue?: string | null
): ImpersonationStatePayload | null {
  if (!cookieValue || typeof cookieValue !== 'string') {
    return null;
  }

  const parts = cookieValue.split('.');
  if (parts.length !== 2) {
    console.warn('Invalid impersonation cookie format: expected 2 parts, got', parts.length);
    return null;
  }

  const [payloadBase64, signature] = parts;
  
  if (!payloadBase64 || !signature) {
    return null;
  }

  // Validate signature
  try {
    if (!hasValidSignature(payloadBase64, signature)) {
      console.warn('Invalid impersonation cookie signature');
      return null;
    }
  } catch (err) {
    console.error('Error validating impersonation cookie signature:', err);
    return null;
  }

  // Parse and validate payload
  try {
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as unknown as ImpersonationStatePayload;

    // Validate payload structure
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('Payload is not an object');
    }

    const { adminUserId, impersonatedUserId, issuedAt, expiresAt } = payload as Record<string, unknown>;

    // Type and value validation
    if (typeof adminUserId !== 'string' || adminUserId.length === 0) {
      throw new Error('Invalid adminUserId: must be non-empty string');
    }
    if (typeof impersonatedUserId !== 'string' || impersonatedUserId.length === 0) {
      throw new Error('Invalid impersonatedUserId: must be non-empty string');
    }
    if (typeof issuedAt !== 'number' || issuedAt <= 0) {
      throw new Error('Invalid issuedAt: must be positive number');
    }
    if (typeof expiresAt !== 'number' || expiresAt <= 0) {
      throw new Error('Invalid expiresAt: must be positive number');
    }

    // Check expiration
    if (expiresAt <= Date.now()) {
      console.warn('Impersonation cookie has expired');
      return null;
    }

    return { adminUserId, impersonatedUserId, issuedAt, expiresAt };
  } catch (err) {
    console.error('Error parsing impersonation cookie:', err instanceof Error ? err.message : String(err));
    return null;
  }
}