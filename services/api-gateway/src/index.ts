import { createApp } from './app.js';
import { config } from './config/index.js';
import { createLogger } from '@resume-score/logger';

const logger = createLogger({ service: 'api-gateway' });

async function main() {
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, '🚀 API Gateway started');
  });

  // ─── Graceful Shutdown ────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force close after 30 seconds
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout');
      process.exit(1);
    }, 30_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
