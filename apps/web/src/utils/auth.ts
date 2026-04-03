import { headers } from 'next/headers';
import { createClient } from './supabase/server';
import AuthCache from './auth-cache';

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// Cache the auth check using React cache()
export async function getAuthenticatedUser() {
  try {
    const headersList = await headers();
    const requestId = headersList.get('x-request-id');
    const userId = headersList.get('x-user-id');

    // If we have a request ID and user ID in headers, check cache first
    if (requestId && userId) {
      const cachedUser = AuthCache.get(requestId);
      if (cachedUser) {
        return {
          id: cachedUser.id,
          email: cachedUser.email ?? undefined,
        };
      }
    }

    // If not in cache, get from Supabase
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      throw new AuthenticationError(`Auth check failed: ${error.message}`);
    }

    if (!user) {
      throw new AuthenticationError('User not authenticated');
    }

    // If we have a request ID, cache the result
    if (requestId) {
      AuthCache.set(requestId, {
        id: user.id,
        email: user.email || null,
        timestamp: Date.now(),
      });
    }

    return { id: user.id, email: user.email };
  } catch (err) {
    if (err instanceof AuthenticationError) throw err;
    throw new AuthenticationError(`Failed to get authenticated user: ${String(err)}`);
  }
}

// Helper to get user ID with error handling
export const getUserId = async () => {
  const user = await getAuthenticatedUser();
  return user.id;
}; 