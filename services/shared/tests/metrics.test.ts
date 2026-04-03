/**
 * Tests for the Prometheus metrics helpers:
 * createMetricsMiddleware, metricsHandler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMetricsMiddleware, metricsHandler } from '../observability/metrics.js';

// ---------------------------------------------------------------------------
// Minimal Express-like req / res / next mocks
// ---------------------------------------------------------------------------

type MockReq = {
  method: string;
  path: string;
  url: string;
  ip: string;
  route?: { path: string };
  headers: Record<string, string>;
};

type MockRes = {
  statusCode: number;
  headers: Record<string, string | number>;
  body: string;
  _finishListeners: Array<() => void>;
  on(event: string, handler: () => void): void;
  set(key: string, value: string): void;
  end(body: string): void;
  finish(): void;
};

function makeReq(overrides: Partial<MockReq> = {}): MockReq {
  return {
    method: 'GET',
    path: '/test',
    url: '/test',
    ip: '127.0.0.1',
    headers: {},
    ...overrides,
  };
}

function makeRes(statusCode = 200): MockRes {
  const listeners: Array<() => void> = [];
  const res: MockRes = {
    statusCode,
    headers: {},
    body: '',
    _finishListeners: listeners,
    on(event: string, handler: () => void) {
      if (event === 'finish') listeners.push(handler);
    },
    set(key: string, value: string) {
      res.headers[key] = value;
    },
    end(body: string) {
      res.body = body;
    },
    finish() {
      for (const fn of listeners) fn();
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// createMetricsMiddleware
// ---------------------------------------------------------------------------

describe('createMetricsMiddleware', () => {
  it('returns a middleware function', () => {
    const middleware = createMetricsMiddleware('test-service');
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3); // (req, res, next)
  });

  it('calls next()', () => {
    const middleware = createMetricsMiddleware('test-service');
    let nextCalled = false;
    const req = makeReq();
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });

  it('records metrics on res.finish event', () => {
    const middleware = createMetricsMiddleware('record-service');
    const req = makeReq({ method: 'POST', path: '/api/v1/resumes' });
    const res = makeRes(201);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(req as any, res as any, () => {});
    res.finish();

    // After finish, metricsHandler should include the recorded data
    let output = '';
    const metricsRes = makeRes();
    metricsRes.end = (body: string) => {
      output = body;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metricsHandler(req as any, metricsRes as any, () => {}, 'record-service');
    expect(output).toContain('http_requests_total');
    expect(output).toContain('record-service');
  });
});

// ---------------------------------------------------------------------------
// metricsHandler
// ---------------------------------------------------------------------------

describe('metricsHandler', () => {
  it('sets Content-Type to Prometheus text format', () => {
    const req = makeReq();
    const res = makeRes();
    let contentType = '';
    res.set = (k: string, v: string) => {
      if (k === 'Content-Type') contentType = v;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metricsHandler(req as any, res as any, () => {}, 'test-svc');
    expect(contentType).toContain('text/plain');
  });

  it('includes standard metric names in output', () => {
    const req = makeReq();
    let output = '';
    const res = makeRes();
    res.end = (body: string) => { output = body; };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metricsHandler(req as any, res as any, () => {}, 'my-service');
    expect(output).toContain('http_request_duration_seconds');
    expect(output).toContain('nodejs_process_info');
    expect(output).toContain('process_uptime_seconds');
    expect(output).toContain('my-service');
  });
});
