/**
 * @module profile-service/config
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  nodeEnv: optional('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  port: parseInt(optional('PORT', '8005'), 10),
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:3000').split(',').map(s => s.trim()),

  supabase: {
    url: required('SUPABASE_URL'),
    serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    jwtSecret: required('SUPABASE_JWT_SECRET'),
  },

  redis: {
    url: required('REDIS_URL'), // Changed from optional to required
  },

  events: {
    enabled: (process.env['ENABLE_EVENTS'] ?? 'false').toLowerCase() === 'true',
  },

  logging: {
    level: optional('LOG_LEVEL', 'info'),
  },
} as const;