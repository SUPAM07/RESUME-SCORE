/**
 * @module services/shared/events/catalog
 *
 * Complete domain event catalog for ResumeLM.
 * Defines all event type constants and their payload shapes.
 *
 * Event type namespaces:
 *   resume.*   – resume CRUD & AI operations
 *   job.*      – job listing CRUD
 *   ai.*       – AI task lifecycle
 *   user.*     – user registration & lifecycle
 *   billing.*  – subscription & payment events
 */

import type { DomainEvent } from './types.js';

// ---------------------------------------------------------------------------
// Event type constants
// ---------------------------------------------------------------------------

export const EventTypes = {
  // Resume domain
  RESUME_CREATED: 'resume.created',
  RESUME_UPDATED: 'resume.updated',
  RESUME_DELETED: 'resume.deleted',
  RESUME_SCORE_CALCULATED: 'resume.score.calculated',

  // Job domain
  JOB_CREATED: 'job.created',
  JOB_UPDATED: 'job.updated',
  JOB_DELETED: 'job.deleted',

  // AI task lifecycle
  AI_TASK_QUEUED: 'ai.task.queued',
  AI_TASK_COMPLETED: 'ai.task.completed',
  AI_TASK_FAILED: 'ai.task.failed',
  AI_SCORE_CALCULATED: 'ai.score.calculated',

  // User lifecycle
  USER_REGISTERED: 'user.registered',
  USER_DELETED: 'user.deleted',

  // Billing & subscriptions
  SUBSCRIPTION_CREATED: 'billing.subscription.created',
  SUBSCRIPTION_UPGRADED: 'billing.subscription.upgraded',
  SUBSCRIPTION_CANCELLED: 'billing.subscription.cancelled',
  PAYMENT_SUCCEEDED: 'billing.payment.succeeded',
  PAYMENT_FAILED: 'billing.payment.failed',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

// ---------------------------------------------------------------------------
// Payload interfaces
// ---------------------------------------------------------------------------

// Resume
export interface ResumeCreatedPayload {
  resumeId: string;
  userId: string;
  resumeType: 'base' | 'tailored';
  jobId?: string;
}

export interface ResumeUpdatedPayload {
  resumeId: string;
  userId: string;
  fields: string[];
}

export interface ResumeDeletedPayload {
  resumeId: string;
  userId: string;
}

export interface ResumeScoreCalculatedPayload {
  resumeId: string;
  userId: string;
  score: number;
  jobId?: string;
  atsKeywords?: string[];
}

// Job
export interface JobCreatedPayload {
  jobId: string;
  userId: string;
  company: string;
  positionTitle: string;
}

export interface JobUpdatedPayload {
  jobId: string;
  userId: string;
  fields: string[];
}

export interface JobDeletedPayload {
  jobId: string;
  userId: string;
}

// AI tasks
export interface AiTaskQueuedPayload {
  taskId: string;
  taskType: 'tailor' | 'score' | 'chat' | 'cover_letter' | 'improve_bullet';
  userId: string;
  resumeId?: string;
  jobId?: string;
}

export interface AiTaskCompletedPayload extends AiTaskQueuedPayload {
  durationMs: number;
  tokensUsed?: number;
}

export interface AiTaskFailedPayload extends AiTaskQueuedPayload {
  error: string;
  retryCount: number;
}

export interface AiScoreCalculatedPayload {
  taskId: string;
  resumeId: string;
  userId: string;
  score: number;
  jobId?: string;
}

// User
export interface UserRegisteredPayload {
  userId: string;
  email: string;
  plan: 'free' | 'pro';
}

export interface UserDeletedPayload {
  userId: string;
}

// Billing
export interface SubscriptionCreatedPayload {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: 'pro';
  periodEnd: string;
}

export interface SubscriptionUpgradedPayload {
  userId: string;
  previousPlan: 'free' | 'pro';
  newPlan: 'free' | 'pro';
  stripeSubscriptionId: string;
}

export interface SubscriptionCancelledPayload {
  userId: string;
  stripeSubscriptionId: string;
  cancelledAt: string;
}

export interface PaymentSucceededPayload {
  userId: string;
  stripeInvoiceId: string;
  amountCents: number;
  currency: string;
}

export interface PaymentFailedPayload {
  userId: string;
  stripeInvoiceId: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Strongly-typed event aliases
// ---------------------------------------------------------------------------

export type ResumeCreatedEvent = DomainEvent<ResumeCreatedPayload> & { type: 'resume.created' };
export type ResumeUpdatedEvent = DomainEvent<ResumeUpdatedPayload> & { type: 'resume.updated' };
export type ResumeDeletedEvent = DomainEvent<ResumeDeletedPayload> & { type: 'resume.deleted' };
export type ResumeScoreCalculatedEvent = DomainEvent<ResumeScoreCalculatedPayload> & { type: 'resume.score.calculated' };

export type JobCreatedEvent = DomainEvent<JobCreatedPayload> & { type: 'job.created' };
export type JobUpdatedEvent = DomainEvent<JobUpdatedPayload> & { type: 'job.updated' };
export type JobDeletedEvent = DomainEvent<JobDeletedPayload> & { type: 'job.deleted' };

export type AiTaskQueuedEvent = DomainEvent<AiTaskQueuedPayload> & { type: 'ai.task.queued' };
export type AiTaskCompletedEvent = DomainEvent<AiTaskCompletedPayload> & { type: 'ai.task.completed' };
export type AiTaskFailedEvent = DomainEvent<AiTaskFailedPayload> & { type: 'ai.task.failed' };
export type AiScoreCalculatedEvent = DomainEvent<AiScoreCalculatedPayload> & { type: 'ai.score.calculated' };

export type UserRegisteredEvent = DomainEvent<UserRegisteredPayload> & { type: 'user.registered' };
export type UserDeletedEvent = DomainEvent<UserDeletedPayload> & { type: 'user.deleted' };

export type SubscriptionCreatedEvent = DomainEvent<SubscriptionCreatedPayload> & { type: 'billing.subscription.created' };
export type SubscriptionUpgradedEvent = DomainEvent<SubscriptionUpgradedPayload> & { type: 'billing.subscription.upgraded' };
export type SubscriptionCancelledEvent = DomainEvent<SubscriptionCancelledPayload> & { type: 'billing.subscription.cancelled' };
export type PaymentSucceededEvent = DomainEvent<PaymentSucceededPayload> & { type: 'billing.payment.succeeded' };
export type PaymentFailedEvent = DomainEvent<PaymentFailedPayload> & { type: 'billing.payment.failed' };

// Union of all domain events
export type AnyDomainEvent =
  | ResumeCreatedEvent
  | ResumeUpdatedEvent
  | ResumeDeletedEvent
  | ResumeScoreCalculatedEvent
  | JobCreatedEvent
  | JobUpdatedEvent
  | JobDeletedEvent
  | AiTaskQueuedEvent
  | AiTaskCompletedEvent
  | AiTaskFailedEvent
  | AiScoreCalculatedEvent
  | UserRegisteredEvent
  | UserDeletedEvent
  | SubscriptionCreatedEvent
  | SubscriptionUpgradedEvent
  | SubscriptionCancelledEvent
  | PaymentSucceededEvent
  | PaymentFailedEvent;
