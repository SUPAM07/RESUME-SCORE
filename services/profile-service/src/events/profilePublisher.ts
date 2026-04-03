/**
 * @module profile-service/events/profilePublisher
 *
 * Writes profile domain events to the outbox table so that the outbox
 * worker can relay them to Redis Streams.
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';

interface OutboxInsert {
  id: string;
  event_type: string;
  source: string;
  payload: object;
}

async function writeToOutbox(eventType: string, data: object, correlationId?: string): Promise<void> {
  const record: OutboxInsert = {
    id: randomUUID(),
    event_type: eventType,
    source: 'profile-service',
    payload: {
      id: randomUUID(),
      type: eventType,
      source: 'profile-service',
      version: '1.0',
      timestamp: new Date().toISOString(),
      correlationId,
      data,
    },
  };

  const { error } = await getSupabaseClient()
    .from('outbox')
    .insert(record);

  if (error) {
    logger.error('Failed to write event to outbox', { eventType, error: error.message });
  }
}

export async function publishUserRegistered(
  userId: string,
  email: string,
  plan: 'free' | 'pro',
  correlationId?: string,
): Promise<void> {
  await writeToOutbox('user.registered', { userId, email, plan }, correlationId);
}

export async function publishProfileUpdated(
  userId: string,
  fields: string[],
  correlationId?: string,
): Promise<void> {
  await writeToOutbox('profile.updated', { userId, fields }, correlationId);
}
