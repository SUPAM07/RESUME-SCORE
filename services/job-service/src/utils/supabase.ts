import { createClient as _createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

export const supabaseAdmin = _createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function checkDbConnection(): Promise<void> {
  const { error } = await supabaseAdmin.from('jobs').select('id').limit(1);
  if (error) throw new Error(error.message);
}
