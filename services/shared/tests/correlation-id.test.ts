/**
 * Tests for the correlation-id utilities:
 * correlationIdMiddleware, getCorrelationId, withCorrelationId, runWithCorrelationId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CORRELATION_ID_HEADER,
  correlationIdMiddleware,
  getCorrelationId,
  withCorrelationId,
  runWithCorrelationId,
} from '../utils/correlation-id.js';

// ---------------------------------------------------------------------------
// Helpers to build minimal Express-like req / res / next mocks
// ---------------------------------------------------------------------------

function makeReq(headers: Record<string, string> = {}): {
  headers: Record<string, string>;
} {
  return { headers };
}

function makeRes(): { headers: Record<string, string>; setHeader: (k: string, v: string) => void } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
  };
}

// ---------------------------------------------------------------------------
// correlationIdMiddleware
// ---------------------------------------------------------------------------

describe('correlationIdMiddleware', () => {
  it('generates a UUID when no X-Request-ID header is present', async () => {
    const req = makeReq();
    const res = makeRes();
    let capturedId: string | undefined;

    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      correlationIdMiddleware(req as any, res as any, () => {
        capturedId = getCorrelationId();
        resolve();
      });
    });

    expect(capturedId).toBeDefined();
    expect(typeof capturedId).toBe('string');
    expect(capturedId!.length).toBeGreaterThan(0);
    // UUID v4 pattern
    expect(capturedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('reuses an existing X-Request-ID header value', async () => {
    const existingId = 'my-trace-id-abc123';
    const req = makeReq({ [CORRELATION_ID_HEADER]: existingId });
    const res = makeRes();
    let capturedId: string | undefined;

    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      correlationIdMiddleware(req as any, res as any, () => {
        capturedId = getCorrelationId();
        resolve();
      });
    });

    expect(capturedId).toBe(existingId);
    expect(res.headers[CORRELATION_ID_HEADER]).toBe(existingId);
  });

  it('sets X-Request-ID on the response', async () => {
    const req = makeReq();
    const res = makeRes();

    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      correlationIdMiddleware(req as any, res as any, () => resolve());
    });

    expect(res.headers[CORRELATION_ID_HEADER]).toBeDefined();
    expect(res.headers[CORRELATION_ID_HEADER]!.length).toBeGreaterThan(0);
  });

  it('generates unique IDs for concurrent requests', async () => {
    const ids: string[] = [];

    await Promise.all(
      Array.from({ length: 5 }, () =>
        new Promise<void>((resolve) => {
          const req = makeReq();
          const res = makeRes();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          correlationIdMiddleware(req as any, res as any, () => {
            const id = getCorrelationId();
            if (id) ids.push(id);
            resolve();
          });
        }),
      ),
    );

    const unique = new Set(ids);
    expect(unique.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getCorrelationId
// ---------------------------------------------------------------------------

describe('getCorrelationId', () => {
  it('returns undefined outside of a request context', () => {
    // Called at module load, outside any AsyncLocalStorage.run()
    expect(getCorrelationId()).toBeUndefined();
  });

  it('returns the ID set by runWithCorrelationId', async () => {
    const id = 'test-id-xyz';
    let observed: string | undefined;

    await runWithCorrelationId(id, async () => {
      observed = getCorrelationId();
    });

    expect(observed).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// withCorrelationId
// ---------------------------------------------------------------------------

describe('withCorrelationId', () => {
  it('returns existing headers unchanged when no correlation ID is active', () => {
    const headers = { 'content-type': 'application/json' };
    const result = withCorrelationId(headers);
    expect(result).toEqual(headers);
  });

  it('merges the correlation ID header when active', async () => {
    const id = 'merge-test-id';
    let result: Record<string, string> = {};

    await runWithCorrelationId(id, async () => {
      result = withCorrelationId({ 'content-type': 'application/json' });
    });

    expect(result[CORRELATION_ID_HEADER]).toBe(id);
    expect(result['content-type']).toBe('application/json');
  });

  it('does not mutate the original headers object', async () => {
    const id = 'mutation-test-id';
    const original = { authorization: 'Bearer token' };

    await runWithCorrelationId(id, async () => {
      withCorrelationId(original);
    });

    expect(original).not.toHaveProperty(CORRELATION_ID_HEADER);
  });
});

// ---------------------------------------------------------------------------
// runWithCorrelationId
// ---------------------------------------------------------------------------

describe('runWithCorrelationId', () => {
  it('resolves the return value of fn', async () => {
    const result = await runWithCorrelationId('any-id', async () => 42);
    expect(result).toBe(42);
  });

  it('propagates rejections from fn', async () => {
    await expect(
      runWithCorrelationId('any-id', async () => {
        throw new Error('inner error');
      }),
    ).rejects.toThrow('inner error');
  });

  it('isolates IDs between concurrent runs', async () => {
    const results: string[] = [];

    await Promise.all([
      runWithCorrelationId('id-A', async () => {
        await Promise.resolve(); // yield
        results.push(getCorrelationId() ?? 'none');
      }),
      runWithCorrelationId('id-B', async () => {
        await Promise.resolve(); // yield
        results.push(getCorrelationId() ?? 'none');
      }),
    ]);

    expect(results).toHaveLength(2);
    expect(results).toContain('id-A');
    expect(results).toContain('id-B');
  });
});
