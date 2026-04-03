/**
 * @module services/shared/events
 *
 * Barrel export for the Redis Streams event infrastructure.
 */

export { createEventPublisher, buildEvent } from './publisher.js';
export { createEventConsumer } from './consumer.js';
export { EventTypes } from './catalog.js';
export { registry, EventHandlerRegistry } from './handlers/index.js';

export type { EventPublisher } from './publisher.js';
export type { EventConsumer } from './consumer.js';
export type { DomainEvent, EventHandler, EventHandlerMap, ConsumerGroupOptions, PublisherOptions } from './types.js';
export type {
  EventType,
  AnyDomainEvent,
  ResumeCreatedPayload,
  ResumeUpdatedPayload,
  ResumeDeletedPayload,
  ResumeScoreCalculatedPayload,
  JobCreatedPayload,
  JobUpdatedPayload,
  JobDeletedPayload,
  AiTaskQueuedPayload,
  AiTaskCompletedPayload,
  AiTaskFailedPayload,
  AiScoreCalculatedPayload,
  UserRegisteredPayload,
  UserDeletedPayload,
  SubscriptionCreatedPayload,
  SubscriptionUpgradedPayload,
  SubscriptionCancelledPayload,
  PaymentSucceededPayload,
  PaymentFailedPayload,
} from './catalog.js';
