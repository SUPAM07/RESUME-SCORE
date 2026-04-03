/**
 * @module resume-service/utils/outbox
 *
 * Writes domain events to the `outbox` table so the outbox worker
 * can publish them to Redis Streams.  Calls are fire-and-forget
 * (errors are logged but not thrown) so outbox failures never break
 * the primary CRUD operation.
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from './supabase.js';
import { createLogger } from './logger.js';

const logger = createLogger('outbox');

export async function writeToOutbox(
  eventType: string,
  data: object,
  correlationId?: string,
): Promise<void> {
  const eventId = randomUUID();
  const { error } = await getSupabaseClient()
    .from('outbox')
    .insert({
      id: randomUUID(),
      event_type: eventType,
      source: 'resume-service',
      payload: {
        id: eventId,
        type: eventType,
        source: 'resume-service',
        version: '1.0',
        timestamp: new Date().toISOString(),
        correlationId,
        data,
      },
    });

  if (error) {
    logger.error('Failed to write event to outbox', { eventType, error: error.message });
  }
}
