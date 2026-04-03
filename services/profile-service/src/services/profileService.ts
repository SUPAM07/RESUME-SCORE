/**
 * @module profile-service/services/profileService
 *
 * Profile CRUD operations – extracted from the frontend's actions.ts.
 * All queries are scoped to the authenticated user's `user_id`.
 */

import { getSupabaseClient } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';

export interface Profile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
  location: string | null;
  website: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  work_experience: object[];
  education: object[];
  skills: object[];
  certifications: object[];
  projects: object[];
  created_at: string;
  updated_at: string;
}

export type UpdateProfileBody = Partial<Omit<Profile, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    logger.error('Failed to get profile', { userId, error: error.message });
    throw new Error('Failed to get profile');
  }

  return data as Profile;
}

export async function upsertProfile(userId: string, body: UpdateProfileBody): Promise<Profile> {
  const now = new Date().toISOString();

  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        ...body,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single();

  if (error) {
    logger.error('Failed to upsert profile', { userId, error: error.message });
    throw new Error('Failed to upsert profile');
  }

  return data as Profile;
}

export async function deleteProfile(userId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('profiles')
    .delete()
    .eq('user_id', userId);

  if (error) {
    logger.error('Failed to delete profile', { userId, error: error.message });
    throw new Error('Failed to delete profile');
  }
}
