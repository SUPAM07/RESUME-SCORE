/**
 * Tests for the resilience middleware:
 * CircuitBreaker, withRetry, withTimeout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  TimeoutError,
  withRetry,
  withTimeout,
} from '../middleware/resilience.js';

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

describe('CircuitBreaker', () => {
  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker('test');
    expect(cb.currentState).toBe('CLOSED');
  });

  it('passes through successful calls in CLOSED state', async () => {
    const cb = new CircuitBreaker('test');
    const result = await cb.fire(async () => 42);
    expect(result).toBe(42);
    expect(cb.currentState).toBe('CLOSED');
  });

  it('trips to OPEN after failureThreshold consecutive failures', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3, resetTimeoutMs: 60_000 });

    for (let i = 0; i < 3; i++) {
      await cb.fire(async () => { throw new Error('boom'); }).catch(() => {});
    }

    expect(cb.currentState).toBe('OPEN');
  });

  it('throws CircuitOpenError immediately when OPEN', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 60_000 });

    // Trip the circuit
    await cb.fire(async () => { throw new Error('boom'); }).catch(() => {});
    expect(cb.currentState).toBe('OPEN');

    // Next call should be rejected immediately
    await expect(cb.fire(async () => 42)).rejects.toThrow(CircuitOpenError);
  });

  it('transitions to HALF_OPEN after resetTimeout', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 0 });

    // Trip the circuit
    await cb.fire(async () => { throw new Error('boom'); }).catch(() => {});
    expect(cb.currentState).toBe('OPEN');

    // After resetTimeout=0, the next call probes in HALF_OPEN
    const result = await cb.fire(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('closes after successThreshold successes in HALF_OPEN', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 1,
      resetTimeoutMs: 0,
      successThreshold: 2,
    });

    // Trip the circuit
    await cb.fire(async () => { throw new Error('boom'); }).catch(() => {});
    // First success in HALF_OPEN — still HALF_OPEN
    await cb.fire(async () => 'ok');
    expect(cb.currentState).toBe('HALF_OPEN');
    // Second success — closes
    await cb.fire(async () => 'ok');
    expect(cb.currentState).toBe('CLOSED');
  });

  it('reset() restores CLOSED state', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 60_000 });
    await cb.fire(async () => { throw new Error('boom'); }).catch(() => {});
    expect(cb.currentState).toBe('OPEN');
    cb.reset();
    expect(cb.currentState).toBe('CLOSED');
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const result = await withRetry(async () => 'hello', { maxAttempts: 3 });
    expect(result).toBe('hello');
  });

  it('retries on failure and eventually succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('not yet');
        return 'done';
      },
      { maxAttempts: 3, baseDelayMs: 0 },
    );
    expect(result).toBe('done');
    expect(attempts).toBe(3);
  });

  it('throws after exhausting all attempts', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('always fails');
        },
        { maxAttempts: 3, baseDelayMs: 0 },
      ),
    ).rejects.toThrow('always fails');
    expect(attempts).toBe(3);
  });

  it('does not retry when isRetryable returns false', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('non-retryable');
        },
        { maxAttempts: 3, baseDelayMs: 0, isRetryable: () => false },
      ),
    ).rejects.toThrow('non-retryable');
    expect(attempts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------

describe('withTimeout', () => {
  it('resolves when the promise completes within the timeout', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000);
    expect(result).toBe(42);
  });

  it('rejects with TimeoutError when the promise exceeds the timeout', async () => {
    const neverResolves = new Promise<never>(() => {});
    await expect(withTimeout(neverResolves, 1)).rejects.toThrow(TimeoutError);
  });

  it('forwards rejections from the wrapped promise', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('inner error')), 1000),
    ).rejects.toThrow('inner error');
  });
});
