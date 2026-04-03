/**
 * @module @resume-lm/shared/middleware/resilience
 *
 * Resilience patterns for inter-service HTTP calls:
 *   - Circuit Breaker   — stops calling a failing downstream after a threshold
 *   - Retry with jitter — retries transient failures with exponential back-off
 *   - Timeout           — enforces a per-call deadline
 *
 * Usage:
 * ```ts
 * import { CircuitBreaker, withRetry, withTimeout } from
 *   '@resume-lm/shared/middleware/resilience';
 *
 * const cb = new CircuitBreaker('ai-service', { failureThreshold: 5 });
 *
 * async function callAIService(payload: unknown) {
 *   return cb.fire(() =>
 *     withRetry(() =>
 *       withTimeout(fetch('http://ai-service:8002/api/ai/score', {
 *         method: 'POST', body: JSON.stringify(payload),
 *       }), 10_000),
 *     { maxAttempts: 3 })
 *   );
 * }
 * ```
 */

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before tripping the circuit (default: 5) */
  failureThreshold?: number;
  /** Milliseconds to wait in OPEN state before trying again (default: 30_000) */
  resetTimeoutMs?: number;
  /** Number of successful calls in HALF_OPEN state needed to close (default: 2) */
  successThreshold?: number;
}

/**
 * A minimal circuit-breaker implementation.
 *
 * States:
 *   CLOSED    – normal operation; failures counted.
 *   OPEN      – calls rejected immediately; reset timer running.
 *   HALF_OPEN – one probe allowed; success → CLOSED, failure → OPEN.
 */
export class CircuitBreaker {
  readonly name: string;
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptAt = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(name: string, opts: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.successThreshold = opts.successThreshold ?? 2;
  }

  get currentState(): CircuitState {
    return this.state;
  }

  /**
   * Execute `fn` subject to circuit-breaker logic.
   * Throws `CircuitOpenError` when the circuit is OPEN.
   */
  async fire<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptAt) {
        throw new CircuitOpenError(
          `Circuit breaker "${this.name}" is OPEN — downstream unavailable`,
        );
      }
      // Transition to HALF_OPEN for a probe
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount += 1;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
      }
    }
  }

  private onFailure(): void {
    this.failureCount += 1;
    if (
      this.state === 'HALF_OPEN' ||
      this.failureCount >= this.failureThreshold
    ) {
      this.state = 'OPEN';
      this.nextAttemptAt = Date.now() + this.resetTimeoutMs;
      this.failureCount = 0;
    }
  }

  /** Reset to CLOSED state (useful in tests). */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptAt = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// ---------------------------------------------------------------------------
// Retry with exponential back-off + jitter
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in milliseconds. Default: 100 */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds. Default: 5_000 */
  maxDelayMs?: number;
  /** Predicate to determine whether an error is retryable. Default: always */
  isRetryable?: (err: unknown) => boolean;
}

/**
 * Execute `fn` with automatic retry on failure.
 * Uses full-jitter exponential back-off to spread retry load.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 100;
  const maxDelayMs = opts.maxDelayMs ?? 5_000;
  const isRetryable = opts.isRetryable ?? (() => true);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts || !isRetryable(err)) {
        break;
      }

      // Full-jitter back-off: random delay in [0, min(cap, base * 2^attempt)]
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delayMs = Math.random() * cap;
      await sleep(delayMs);
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

/**
 * Wrap a Promise with a timeout.  Rejects with `TimeoutError` if `promise`
 * does not settle within `timeoutMs` milliseconds.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
