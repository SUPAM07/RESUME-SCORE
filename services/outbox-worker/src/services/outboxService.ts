/**
 * @module outbox-worker/services/outboxService
 *
 * Polls the `outbox` table in Supabase for unpublished events and
 * returns them for publishing.  Marks events as published once done.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger.js';

export interface OutboxRecord {
  id: string;
  event_type: string;
  source: string;
  payload: Record<string, unknown>;
  created_at: string;
  retry_count: number;
}

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/**
 * Fetch up to `batchSize` unpublished outbox records ordered by age.
 */
export async function fetchUnpublished(batchSize = 50): Promise<OutboxRecord[]> {
  const { data, error } = await getClient()
    .from('outbox')
    .select('id, event_type, source, payload, created_at, retry_count')
    .is('published_at', null)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    logger.error('Failed to fetch outbox records', { error: error.message });
    return [];
  }
  return (data ?? []) as OutboxRecord[];
}

/**
 * Mark an outbox record as successfully published.
 */
export async function markPublished(id: string): Promise<void> {
  const { error } = await getClient()
    .from('outbox')
    .update({ published_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    logger.error('Failed to mark outbox record as published', { id, error: error.message });
  }
}

/**
 * Increment the retry counter and record the last error for a failed publish.
 */
export async function markFailed(id: string, errorMessage: string): Promise<void> {
  const { error } = await getClient()
    .from('outbox')
    .update({
      retry_count: getClient()
        .rpc('increment', { row_id: id }) as unknown as number,
      last_error: errorMessage,
    })
    .eq('id', id);

  if (error) {
    // Fallback: raw increment
    await getClient()
      .from('outbox')
      .update({ last_error: errorMessage })
      .eq('id', id);
  }
}
