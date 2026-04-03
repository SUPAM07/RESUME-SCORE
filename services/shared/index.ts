/**
 * @module @resume-lm/shared
 *
 * Barrel export for the shared package.
 * Import individual sub-paths (e.g. `@resume-lm/shared/types`) for
 * tree-shaking, or use this root export for convenience.
 */

export * from './types/index.js';
export * from './contracts/api.js';
export * from './middleware/auth.js';
export * from './middleware/resilience.js';
export * from './utils/correlation-id.js';
export * from './utils/errors.js';
export * from './utils/logger.js';
