/**
 * @module utils/supabase
 * Supabase admin client (service-role key) for server-side database operations.
 * This client bypasses Row Level Security — use only in trusted server code.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import { createLogger } from './logger.js';

const logger = createLogger('supabase');

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  _client = createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  logger.info('Supabase admin client initialised', { url: config.supabase.url });
  return _client;
}

/** Run a lightweight connectivity check — returns true when the DB responds. */
export async function checkDbConnection(): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('resumes').select('id').limit(1);
    return error === null;
  } catch {
    return false;
  }
}
