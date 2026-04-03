/**
 * @module infrastructure/events/schemas
 *
 * Canonical event schemas for the ResumeLM event-driven architecture.
 *
 * All events share a common envelope:
 * ```json
 * {
 *   "id":          "<uuid v4>",
 *   "type":        "resume.created",
 *   "source":      "resume-service",
 *   "version":     "1.0",
 *   "timestamp":   "2024-01-01T00:00:00.000Z",
 *   "correlationId": "<request uuid>",
 *   "data":        { ... event-specific payload ... }
 * }
 * ```
 *
 * Event type namespaces:
 *   auth.*    – authentication & user lifecycle
 *   resume.*  – resume CRUD & AI operations
 *   job.*     – job posting CRUD
 *   ai.*      – AI task lifecycle
 */

// ---------------------------------------------------------------------------
// Base envelope
// ---------------------------------------------------------------------------

export interface EventEnvelope<T = unknown> {
  /** Globally unique event identifier (UUIDv4). */
  id: string;
  /** Dot-namespaced event type, e.g. "resume.created". */
  type: string;
  /** Originating service name, e.g. "resume-service". */
  source: string;
  /** Schema version string, e.g. "1.0". */
  version: string;
  /** ISO-8601 UTC timestamp when the event was produced. */
  timestamp: string;
  /**
   * Correlation ID carried forward from the inbound HTTP request
   * (X-Request-ID header).  Used to correlate events across services in
   * distributed traces and logs.
   */
  correlationId?: string;
  /** Event-specific payload. */
  data: T;
}

// ---------------------------------------------------------------------------
// Auth events
// ---------------------------------------------------------------------------

export interface UserRegisteredPayload {
  userId: string;
  email: string;
  plan: 'free' | 'pro';
}

export interface UserDeletedPayload {
  userId: string;
}

export interface SubscriptionChangedPayload {
  userId: string;
  previousPlan: 'free' | 'pro';
  newPlan: 'free' | 'pro';
}

export type UserRegisteredEvent = EventEnvelope<UserRegisteredPayload> & {
  type: 'auth.user.registered';
};
export type UserDeletedEvent = EventEnvelope<UserDeletedPayload> & {
  type: 'auth.user.deleted';
};
export type SubscriptionChangedEvent =
  EventEnvelope<SubscriptionChangedPayload> & {
    type: 'auth.subscription.changed';
  };

// ---------------------------------------------------------------------------
// Resume events
// ---------------------------------------------------------------------------

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

export interface ResumeAiScoredPayload {
  resumeId: string;
  userId: string;
  score: number;
  jobId?: string;
}

export type ResumeCreatedEvent = EventEnvelope<ResumeCreatedPayload> & {
  type: 'resume.created';
};
export type ResumeUpdatedEvent = EventEnvelope<ResumeUpdatedPayload> & {
  type: 'resume.updated';
};
export type ResumeDeletedEvent = EventEnvelope<ResumeDeletedPayload> & {
  type: 'resume.deleted';
};
export type ResumeAiScoredEvent = EventEnvelope<ResumeAiScoredPayload> & {
  type: 'resume.ai.scored';
};

// ---------------------------------------------------------------------------
// Job events
// ---------------------------------------------------------------------------

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

export type JobCreatedEvent = EventEnvelope<JobCreatedPayload> & {
  type: 'job.created';
};
export type JobUpdatedEvent = EventEnvelope<JobUpdatedPayload> & {
  type: 'job.updated';
};
export type JobDeletedEvent = EventEnvelope<JobDeletedPayload> & {
  type: 'job.deleted';
};

// ---------------------------------------------------------------------------
// AI task events
// ---------------------------------------------------------------------------

export interface AiTaskStartedPayload {
  taskId: string;
  taskType: 'tailor' | 'score' | 'chat' | 'cover_letter' | 'improve_bullet';
  userId: string;
  resumeId?: string;
  jobId?: string;
}

export interface AiTaskCompletedPayload extends AiTaskStartedPayload {
  durationMs: number;
  tokensUsed?: number;
}

export interface AiTaskFailedPayload extends AiTaskStartedPayload {
  error: string;
}

export type AiTaskStartedEvent = EventEnvelope<AiTaskStartedPayload> & {
  type: 'ai.task.started';
};
export type AiTaskCompletedEvent = EventEnvelope<AiTaskCompletedPayload> & {
  type: 'ai.task.completed';
};
export type AiTaskFailedEvent = EventEnvelope<AiTaskFailedPayload> & {
  type: 'ai.task.failed';
};

// ---------------------------------------------------------------------------
// Union type of all domain events
// ---------------------------------------------------------------------------

export type DomainEvent =
  | UserRegisteredEvent
  | UserDeletedEvent
  | SubscriptionChangedEvent
  | ResumeCreatedEvent
  | ResumeUpdatedEvent
  | ResumeDeletedEvent
  | ResumeAiScoredEvent
  | JobCreatedEvent
  | JobUpdatedEvent
  | JobDeletedEvent
  | AiTaskStartedEvent
  | AiTaskCompletedEvent
  | AiTaskFailedEvent;

// ---------------------------------------------------------------------------
// Event type constants
// ---------------------------------------------------------------------------

export const EventTypes = {
  // Auth
  USER_REGISTERED: 'auth.user.registered',
  USER_DELETED: 'auth.user.deleted',
  SUBSCRIPTION_CHANGED: 'auth.subscription.changed',
  // Resume
  RESUME_CREATED: 'resume.created',
  RESUME_UPDATED: 'resume.updated',
  RESUME_DELETED: 'resume.deleted',
  RESUME_AI_SCORED: 'resume.ai.scored',
  // Job
  JOB_CREATED: 'job.created',
  JOB_UPDATED: 'job.updated',
  JOB_DELETED: 'job.deleted',
  // AI
  AI_TASK_STARTED: 'ai.task.started',
  AI_TASK_COMPLETED: 'ai.task.completed',
  AI_TASK_FAILED: 'ai.task.failed',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
