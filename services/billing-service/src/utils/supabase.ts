/**
 * @module billing-service/utils/supabase
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}
