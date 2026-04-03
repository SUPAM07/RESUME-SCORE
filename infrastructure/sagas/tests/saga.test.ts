/**
 * Tests for the Saga orchestration executor.
 */

import { describe, it, expect } from 'vitest';
import { Saga, type SagaContext, type SagaStep } from '../saga.js';

// Helpers
function makeStep(
  name: string,
  opts: {
    execute?: (ctx: SagaContext) => Promise<SagaContext | void>;
    compensate?: (ctx: SagaContext) => Promise<void>;
  } = {},
): SagaStep {
  return {
    name,
    execute: opts.execute ?? (async () => {}),
    compensate: opts.compensate ?? (async () => {}),
  };
}

describe('Saga', () => {
  it('executes all steps in order and returns success', async () => {
    const order: string[] = [];

    const saga = new Saga('test', [
      makeStep('step-1', { execute: async () => { order.push('s1'); } }),
      makeStep('step-2', { execute: async () => { order.push('s2'); } }),
      makeStep('step-3', { execute: async () => { order.push('s3'); } }),
    ]);

    const result = await saga.execute();
    expect(result.success).toBe(true);
    expect(order).toEqual(['s1', 's2', 's3']);
  });

  it('accumulates context from step return values', async () => {
    const saga = new Saga('test', [
      makeStep('step-a', {
        execute: async () => ({ resumeId: 'r-123' }),
      }),
      makeStep('step-b', {
        execute: async (ctx) => ({ taskId: `task-for-${ctx['resumeId']}` }),
      }),
    ]);

    const result = await saga.execute();
    expect(result.success).toBe(true);
    expect(result.context['resumeId']).toBe('r-123');
    expect(result.context['taskId']).toBe('task-for-r-123');
  });

  it('propagates initial context into the first step', async () => {
    let receivedCtx: SagaContext = {};

    const saga = new Saga('test', [
      makeStep('step-1', {
        execute: async (ctx) => { receivedCtx = ctx; },
      }),
    ]);

    await saga.execute({ userId: 'u-abc' });
    expect(receivedCtx['userId']).toBe('u-abc');
  });

  it('runs compensations in reverse order when a step fails', async () => {
    const compensated: string[] = [];

    const saga = new Saga('test', [
      makeStep('step-1', {
        compensate: async () => { compensated.push('comp-1'); },
      }),
      makeStep('step-2', {
        compensate: async () => { compensated.push('comp-2'); },
      }),
      makeStep('step-3', {
        execute: async () => { throw new Error('step-3 failed'); },
        compensate: async () => { compensated.push('comp-3-never'); },
      }),
    ]);

    const result = await saga.execute();
    expect(result.success).toBe(false);
    expect(result.failedStep).toBe('step-3');
    // Only steps 1 and 2 completed, so only their compensations run — in reverse
    expect(compensated).toEqual(['comp-2', 'comp-1']);
  });

  it('continues compensations even if one compensation throws', async () => {
    const compensated: string[] = [];

    const saga = new Saga('test', [
      makeStep('step-1', {
        compensate: async () => { compensated.push('comp-1'); },
      }),
      makeStep('step-2', {
        compensate: async () => { throw new Error('comp-2 failed'); },
      }),
      makeStep('step-3', {
        execute: async () => { throw new Error('step-3 failed'); },
      }),
    ]);

    const result = await saga.execute();
    expect(result.success).toBe(false);
    // comp-2 threw but comp-1 still ran
    expect(compensated).toContain('comp-1');
    // Compensation error is recorded
    expect(result.compensationErrors.length).toBe(1);
    expect(result.compensationErrors[0]?.step).toBe('step-2');
  });

  it('returns the failing error on result.error', async () => {
    const err = new Error('something broke');
    const saga = new Saga('test', [
      makeStep('boom', { execute: async () => { throw err; } }),
    ]);

    const result = await saga.execute();
    expect(result.error).toBe(err);
  });

  it('never throws — always returns a SagaResult', async () => {
    const saga = new Saga('test', [
      makeStep('fail-always', { execute: async () => { throw new Error('oops'); } }),
    ]);

    // Should not throw
    const result = await saga.execute();
    expect(result.success).toBe(false);
  });
});
