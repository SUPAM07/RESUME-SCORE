/**
 * @module services/shared/events/handlers
 *
 * Event handler registry.  Each service registers its handlers here at
 * startup time.  The registry maps event type strings to arrays of handlers
 * so multiple consumers can react to the same event.
 *
 * Example (AI service startup):
 * ```ts
 * import { registry } from '@resume-lm/shared/events/handlers';
 * import { EventTypes } from '@resume-lm/shared/events/catalog';
 *
 * registry.register(EventTypes.RESUME_CREATED, async (event) => {
 *   await aiService.autoScore(event.data.resumeId);
 * });
 * ```
 */

import type { EventHandler, EventHandlerMap } from '../types.js';

export class EventHandlerRegistry {
  private readonly handlers: EventHandlerMap = {};

  /**
   * Register a handler for the given event type.
   * Multiple handlers per event type are supported.
   */
  register<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    if (!this.handlers[eventType]) {
      this.handlers[eventType] = [];
    }
    this.handlers[eventType].push(handler as EventHandler);
  }

  /** Return all handlers registered for the given event type. */
  getHandlers(eventType: string): EventHandler[] {
    return this.handlers[eventType] ?? [];
  }

  /** Return a snapshot of the full handler map. */
  all(): Readonly<EventHandlerMap> {
    return { ...this.handlers };
  }
}

/** Global singleton registry used across the process. */
export const registry = new EventHandlerRegistry();
