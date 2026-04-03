/**
 * Tests for the Redis Streams event infrastructure:
 * - DomainEvent types and EventTypes catalog
 * - buildEvent helper
 * - EventHandlerRegistry
 * - createEventPublisher (no-op mode)
 * - createEventConsumer (no-op mode)
 */

import { describe, it, expect, vi } from 'vitest';
import { buildEvent, createEventPublisher } from '../events/publisher.js';
import { createEventConsumer } from '../events/consumer.js';
import { EventTypes } from '../events/catalog.js';
import { EventHandlerRegistry } from '../events/handlers/index.js';

// ---------------------------------------------------------------------------
// buildEvent helper
// ---------------------------------------------------------------------------

describe('buildEvent', () => {
  it('creates an event envelope with required fields', () => {
    const event = buildEvent('resume.created', 'resume-service', {
      resumeId: 'r-1',
      userId: 'u-1',
      resumeType: 'base',
    });

    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(event.type).toBe('resume.created');
    expect(event.source).toBe('resume-service');
    expect(event.version).toBe('1.0');
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.data).toEqual({
      resumeId: 'r-1',
      userId: 'u-1',
      resumeType: 'base',
    });
  });

  it('includes correlationId when provided', () => {
    const correlationId = 'corr-123';
    const event = buildEvent('job.created', 'job-service', {}, correlationId);
    expect(event.correlationId).toBe(correlationId);
  });

  it('leaves correlationId undefined when not provided', () => {
    const event = buildEvent('job.deleted', 'job-service', {});
    expect(event.correlationId).toBeUndefined();
  });

  it('generates unique IDs for consecutive calls', () => {
    const a = buildEvent('resume.created', 'svc', {});
    const b = buildEvent('resume.created', 'svc', {});
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// EventTypes catalog
// ---------------------------------------------------------------------------

describe('EventTypes', () => {
  it('contains all expected resume event types', () => {
    expect(EventTypes.RESUME_CREATED).toBe('resume.created');
    expect(EventTypes.RESUME_UPDATED).toBe('resume.updated');
    expect(EventTypes.RESUME_DELETED).toBe('resume.deleted');
    expect(EventTypes.RESUME_SCORE_CALCULATED).toBe('resume.score.calculated');
  });

  it('contains all expected job event types', () => {
    expect(EventTypes.JOB_CREATED).toBe('job.created');
    expect(EventTypes.JOB_UPDATED).toBe('job.updated');
    expect(EventTypes.JOB_DELETED).toBe('job.deleted');
  });

  it('contains all expected AI event types', () => {
    expect(EventTypes.AI_TASK_QUEUED).toBe('ai.task.queued');
    expect(EventTypes.AI_TASK_COMPLETED).toBe('ai.task.completed');
    expect(EventTypes.AI_TASK_FAILED).toBe('ai.task.failed');
    expect(EventTypes.AI_SCORE_CALCULATED).toBe('ai.score.calculated');
  });

  it('contains all expected user and billing event types', () => {
    expect(EventTypes.USER_REGISTERED).toBe('user.registered');
    expect(EventTypes.USER_DELETED).toBe('user.deleted');
    expect(EventTypes.SUBSCRIPTION_CREATED).toBe('billing.subscription.created');
    expect(EventTypes.SUBSCRIPTION_UPGRADED).toBe('billing.subscription.upgraded');
    expect(EventTypes.SUBSCRIPTION_CANCELLED).toBe('billing.subscription.cancelled');
    expect(EventTypes.PAYMENT_SUCCEEDED).toBe('billing.payment.succeeded');
    expect(EventTypes.PAYMENT_FAILED).toBe('billing.payment.failed');
  });
});

// ---------------------------------------------------------------------------
// EventHandlerRegistry
// ---------------------------------------------------------------------------

describe('EventHandlerRegistry', () => {
  it('returns empty array for unregistered event type', () => {
    const registry = new EventHandlerRegistry();
    expect(registry.getHandlers('resume.created')).toEqual([]);
  });

  it('registers and retrieves a single handler', async () => {
    const registry = new EventHandlerRegistry();
    const handler = vi.fn();
    registry.register('resume.created', handler);
    const handlers = registry.getHandlers('resume.created');
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(handler);
  });

  it('supports multiple handlers for the same event type', () => {
    const registry = new EventHandlerRegistry();
    const h1 = vi.fn();
    const h2 = vi.fn();
    registry.register('resume.created', h1);
    registry.register('resume.created', h2);
    expect(registry.getHandlers('resume.created')).toHaveLength(2);
  });

  it('isolates handlers across event types', () => {
    const registry = new EventHandlerRegistry();
    const h1 = vi.fn();
    const h2 = vi.fn();
    registry.register('resume.created', h1);
    registry.register('job.created', h2);
    expect(registry.getHandlers('resume.created')).toHaveLength(1);
    expect(registry.getHandlers('job.created')).toHaveLength(1);
  });

  it('all() returns a snapshot of registered handlers', () => {
    const registry = new EventHandlerRegistry();
    const h = vi.fn();
    registry.register('resume.created', h);
    const all = registry.all();
    expect(all['resume.created']).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// createEventPublisher – no-op mode (ENABLE_EVENTS not set)
// ---------------------------------------------------------------------------

describe('createEventPublisher (no-op)', () => {
  it('returns a publisher that resolves without throwing', async () => {
    const publisher = createEventPublisher({ enabled: false });
    const event = buildEvent(EventTypes.RESUME_CREATED, 'resume-service', {
      resumeId: 'r-1',
      userId: 'u-1',
      resumeType: 'base',
    });
    await expect(publisher.publish(event)).resolves.toBeUndefined();
  });

  it('close() resolves without throwing', async () => {
    const publisher = createEventPublisher({ enabled: false });
    await expect(publisher.close()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createEventConsumer – no-op mode
// ---------------------------------------------------------------------------

describe('createEventConsumer (no-op)', () => {
  it('start() resolves immediately when Redis is not configured', async () => {
    const consumer = createEventConsumer({
      streamKey: 'resumelm:events',
      groupName: 'test-group',
      consumerName: 'test-consumer',
    });
    // subscribe should not throw
    consumer.subscribe('resume.created', vi.fn());
    // start should resolve (no Redis available in test)
    await expect(consumer.start()).resolves.toBeUndefined();
  });

  it('stop() is callable without error', () => {
    const consumer = createEventConsumer({
      streamKey: 'resumelm:events',
      groupName: 'test-group',
      consumerName: 'test-consumer',
    });
    expect(() => consumer.stop()).not.toThrow();
  });
});
