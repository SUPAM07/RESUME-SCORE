function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
function optional(name: string, def: string): string {
  return process.env[name] ?? def;
}

export const config = {
  nodeEnv: optional('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  port: parseInt(optional('PORT', '8004'), 10),
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:3000').split(',').map(s => s.trim()),
  supabase: {
    url: required('SUPABASE_URL'),
    serviceKey: required('SUPABASE_SERVICE_KEY'),
    jwtSecret: required('SUPABASE_JWT_SECRET'),
  },
  redis: { url: optional('REDIS_URL', 'redis://localhost:6379') },
  logging: { level: optional('LOG_LEVEL', 'info') },
} as const;
