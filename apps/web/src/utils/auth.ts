import { headers } from 'next/headers';
import { createClient } from './supabase/server';
import AuthCache from './auth-cache';

class AuthenticationError extends Error {
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
        // Validate cache TTL (1 hour)
        const cacheAge = Date.now() - (cachedUser.timestamp || 0);
        if (cacheAge < 3600000) {
          return {
            id: cachedUser.id,
            email: cachedUser.email || undefined
          };
        } else {
          // Cache expired, remove it
          AuthCache.delete(requestId);
        }
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
        email: user.email,
        timestamp: Date.now()
      });
    }

    return { id: user.id, email: user.email };
  } catch (err) {
    if (err instanceof AuthenticationError) {
      throw err;
    }
    throw new AuthenticationError(`Failed to get authenticated user: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Helper to get user ID with error handling
export const getUserId = async () => {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    throw new AuthenticationError('User ID is not available');
  }
  return user.id;
};