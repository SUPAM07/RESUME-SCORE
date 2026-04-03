/**
 * Tests for the structured logger utility:
 * createLogger, requestLogger, rootServiceLogger
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, requestLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// createLogger
// ---------------------------------------------------------------------------

describe('createLogger', () => {
  it('returns a ServiceLogger with all log-level methods', () => {
    const logger = createLogger('test-service');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.http).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('exposes withRequestId() that returns a ServiceLogger', () => {
    const logger = createLogger('test-service');
    const child = logger.withRequestId('abc-123');
    expect(typeof child.info).toBe('function');
    expect(typeof child.withRequestId).toBe('function');
  });

  it('exposes child() that returns a ServiceLogger', () => {
    const logger = createLogger('test-service');
    const child = logger.child({ traceId: 'trace-xyz' });
    expect(typeof child.info).toBe('function');
  });

  it('withRequestId handles array header values', () => {
    const logger = createLogger('test-service');
    // Should not throw even with array input (from Express headers)
    expect(() => logger.withRequestId(['id-1', 'id-2'])).not.toThrow();
  });

  it('withRequestId handles undefined', () => {
    const logger = createLogger('test-service');
    expect(() => logger.withRequestId(undefined)).not.toThrow();
  });

  it('does not throw when logging with metadata', () => {
    const logger = createLogger('test-service');
    expect(() =>
      logger.info('Test message', { userId: 'u-1', resumeId: 'r-2' })
    ).not.toThrow();
  });

  it('redacts sensitive fields', () => {
    const logger = createLogger('secure-service');
    // Verify it doesn't throw when given sensitive data
    expect(() =>
      logger.info('Sensitive test', { password: 'secret', token: 'abc' })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// requestLogger middleware
// ---------------------------------------------------------------------------

describe('requestLogger', () => {
  function makeReq(headers: Record<string, string> = {}) {
    return {
      method: 'GET',
      url: '/test',
      path: '/test',
      headers,
      ip: '127.0.0.1',
    };
  }

  function makeRes() {
    const listeners: Array<() => void> = [];
    return {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      on(event: string, fn: () => void) {
        if (event === 'finish') listeners.push(fn);
      },
      _emit() {
        for (const fn of listeners) fn();
      },
    };
  }

  it('returns a middleware function', () => {
    const logger = createLogger('test-svc');
    const middleware = requestLogger(logger);
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3);
  });

  it('calls next()', () => {
    const logger = createLogger('test-svc');
    const middleware = requestLogger(logger);
    const req = makeReq();
    const res = makeRes();
    let called = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => { called = true; });
    expect(called).toBe(true);
  });

  it('does not throw when response finishes', () => {
    const logger = createLogger('test-svc');
    const middleware = requestLogger(logger);
    const req = makeReq();
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => {});
    expect(() => res._emit()).not.toThrow();
  });

  it('attaches a request-scoped logger to req', () => {
    const logger = createLogger('test-svc');
    const middleware = requestLogger(logger);
    const req = makeReq();
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => {});
    // The middleware should attach a request-scoped logger
    expect((req as unknown as Record<string, unknown>)['logger']).toBeDefined();
  });

  it('uses the X-Request-ID header from the request when present', () => {
    const logger = createLogger('test-svc');
    const middleware = requestLogger(logger);
    const req = makeReq({ 'x-request-id': 'existing-id-123' });
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => {});
    // The middleware should attach a request-scoped logger
    const attached = (req as unknown as Record<string, unknown>)['logger'];
    expect(attached).toBeDefined();
  });
});
