import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config/index.js';
import { createLogger } from '@resume-score/logger';

const logger = createLogger({ service: 'api-gateway' });
const router = Router();

function buildProxy(target: string, pathRewrite?: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq: any, req: any) => {
        // Forward trace headers to upstream services
        const requestId = req.headers['x-request-id'];
        const traceId = req.headers['x-trace-id'];
        if (requestId) proxyReq.setHeader('X-Request-ID', requestId);
        if (traceId) proxyReq.setHeader('X-Trace-ID', traceId);
        // Forward authenticated user context
        if (req.user?.id) {
          proxyReq.setHeader('X-User-ID', req.user.id);
        }
      },
      error: (err: any, req: any, res: any) => {
        logger.error({ err, path: req.url }, 'Proxy error');
        (res as unknown as { status: (n: number) => { json: (b: unknown) => void } })
          .status(502)
          .json({ error: 'Bad Gateway', message: 'Upstream service unavailable' });
      },
    },
  };
  if (pathRewrite) options.pathRewrite = pathRewrite;
  return createProxyMiddleware(options);
}

// ─── Route Mappings ────────────────────────────────────────────────────────

// Auth routes (public — no JWT required for login/register)
router.use('/auth', buildProxy(config.services.authService, { '^/api/v1/auth': '' }));

// User routes
router.use('/users', buildProxy(config.services.userService, { '^/api/v1/users': '/users' }));

// Resume routes
router.use('/resumes', buildProxy(config.services.resumeService, { '^/api/v1/resumes': '/resumes' }));

// AI routes
router.use('/ai', buildProxy(config.services.aiService, { '^/api/v1/ai': '/api/ai' }));

// Notification routes
router.use('/notifications', buildProxy(config.services.notificationService, { '^/api/v1/notifications': '/notifications' }));

// Search routes
router.use('/search', buildProxy(config.services.searchService, { '^/api/v1/search': '/search' }));

export { router as proxyRouter };
