/**
 * @module config
 * Centralised configuration loaded from environment variables at startup.
 * Fails fast if any required variable is missing.
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
  port: parseInt(optional('PORT', '8003'), 10),
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:3000').split(',').map(s => s.trim()),

  supabase: {
    url: required('SUPABASE_URL'),
    serviceKey: required('SUPABASE_SERVICE_KEY'),
    jwtSecret: required('SUPABASE_JWT_SECRET'),
  },

  database: {
    url: process.env['DATABASE_URL'],
  },

  redis: {
    url: process.env['REDIS_URL'],
  },

  logging: {
    level: optional('LOG_LEVEL', 'info'),
  },
} as const;

export type Config = typeof config;
