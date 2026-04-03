// ─── Error Codes ─────────────────────────────────────────────────────────────

export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED: 'AUTH_001',
  FORBIDDEN: 'AUTH_002',
  TOKEN_EXPIRED: 'AUTH_003',
  INVALID_TOKEN: 'AUTH_004',

  // Validation
  VALIDATION_ERROR: 'VAL_001',
  MISSING_REQUIRED_FIELD: 'VAL_002',
  INVALID_FORMAT: 'VAL_003',

  // Resources
  NOT_FOUND: 'RES_001',
  ALREADY_EXISTS: 'RES_002',
  CONFLICT: 'RES_003',

  // AI Service
  AI_SERVICE_UNAVAILABLE: 'AI_001',
  AI_QUOTA_EXCEEDED: 'AI_002',
  AI_PARSING_FAILED: 'AI_003',
  AI_ANALYSIS_FAILED: 'AI_004',

  // File
  FILE_TOO_LARGE: 'FILE_001',
  UNSUPPORTED_FILE_TYPE: 'FILE_002',
  FILE_UPLOAD_FAILED: 'FILE_003',

  // System
  INTERNAL_SERVER_ERROR: 'SYS_001',
  SERVICE_UNAVAILABLE: 'SYS_002',
  RATE_LIMIT_EXCEEDED: 'SYS_003',
  TIMEOUT: 'SYS_004',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ─── Status Codes ─────────────────────────────────────────────────────────────

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

// ─── App Error Class ─────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.INTERNAL_SERVER_ERROR,
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return { name: this.name, message: this.message, code: this.code };
  }
}

// ─── Utility Functions ────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>;
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((k) => delete result[k]);
  return result as Omit<T, K>;
}

export function chunk<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size),
  );
}

export function isNonEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000,
): Promise<T> {
  return fn().catch(async (err) => {
    if (maxAttempts <= 1) throw err;
    await sleep(delayMs);
    return retry(fn, maxAttempts - 1, delayMs * 2);
  });
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

export const FEATURE_FLAGS = {
  AI_ENHANCED_SCORING: process.env['FEATURE_AI_ENHANCED_SCORING'] === 'true',
  VECTOR_SEARCH: process.env['FEATURE_VECTOR_SEARCH'] === 'true',
  REAL_TIME_NOTIFICATIONS: process.env['FEATURE_REAL_TIME_NOTIFICATIONS'] === 'true',
  ADMIN_DASHBOARD: process.env['FEATURE_ADMIN_DASHBOARD'] === 'true',
} as const;

// ─── File Limits ─────────────────────────────────────────────────────────────

export const FILE_LIMITS = {
  RESUME_MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  ALLOWED_MIME_TYPES: ['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'],
} as const;
