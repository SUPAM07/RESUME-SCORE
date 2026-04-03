export const config = {
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  allowedOrigins: (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000').split(','),

  // JWT
  jwtSecret: process.env['JWT_SECRET'] ?? '',
  jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',

  // Upstream services
  services: {
    authService:         process.env['AUTH_SERVICE_URL']         ?? 'http://auth-service:8002',
    userService:         process.env['USER_SERVICE_URL']         ?? 'http://user-service:3003',
    resumeService:       process.env['RESUME_SERVICE_URL']       ?? 'http://resume-service:3002',
    aiService:           process.env['AI_SERVICE_URL']           ?? 'http://ai-service:8001',
    notificationService: process.env['NOTIFICATION_SERVICE_URL'] ?? 'http://notification-service:3004',
    searchService:       process.env['SEARCH_SERVICE_URL']       ?? 'http://search-service:3005',
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10),
    max:      parseInt(process.env['RATE_LIMIT_MAX'] ?? '100', 10),
  },
} as const;
