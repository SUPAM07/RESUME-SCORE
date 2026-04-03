import redis from '@/lib/redis';

/**
 * Checks and updates the leaky bucket for a given user using atomic Redis operations.
 * 
 * @param userId - The unique identifier for the Pro user.
 * @param capacity - Maximum number of allowed messages (default: 80).
 * @param duration - The duration (in seconds) over which the capacity is allowed (default: 5 hours).
 * @throws An error if the rate limit is exceeded.
 */
export async function checkRateLimit(
  userId: string,
  capacity: number = 80,
  duration: number = 5 * 60 * 60 // 5 hours in seconds
): Promise<void> {
  // Skip rate limiting in development environment
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid user ID');
  }

  const LEAK_RATE = capacity / duration; // tokens leaked per second
  const redisKey = `rate-limit:pro:${userId}`;
  const now = Date.now() / 1000; // current time in seconds

  // Lua script for atomic Redis operations (prevents race condition)
  const script = `
    local key = KEYS[1]
    local leak_rate = tonumber(ARGV[1])
    local now = tonumber(ARGV[2])
    local capacity = tonumber(ARGV[3])
    local duration = tonumber(ARGV[4])
    
    local bucket = redis.call('hgetall', key)
    local tokens = 0
    local last = now
    
    if #bucket > 0 then
      tokens = tonumber(bucket[2]) or 0
      last = tonumber(bucket[4]) or now
    end
    
    local delta = now - last
    tokens = math.max(0, tokens - delta * leak_rate)
    local new_tokens = tokens + 1;
    
    if new_tokens > capacity then
      return {-1, math.ceil(((new_tokens - capacity) * duration) / capacity)}
    end
    
    redis.call('hset', key, 'tokens', tostring(new_tokens), 'last', tostring(now))
    redis.call('expire', key, duration + 3600)
    return {0}
  `;

  try {
    const result = await redis.eval(script, 1, redisKey, LEAK_RATE, now, capacity, duration);
    const [status, timeLeft] = result as [number, number];
    
    if (status === -1) {
      throw new Error(`Rate limit exceeded. Try again in ${timeLeft} seconds.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Rate limit exceeded')) {
      throw err;
    }
    throw new Error(`Rate limiter error: ${err instanceof Error ? err.message : String(err)}`);
  }
}