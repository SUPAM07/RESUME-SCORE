import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { checkDbConnection } from './utils/supabase.js';

async function bootstrap() {
  // Verify database connectivity before starting
  try {
    await checkDbConnection();
    logger.info('Database connection verified');
  } catch (err) {
    logger.error('Database connection failed – starting anyway (will retry on requests)', {
      error: (err as Error).message,
    });
  }

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`Resume Service listening`, {
      port: config.port,
      env: config.nodeEnv,
      pid: process.pid,
    });
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info(`${signal} received – shutting down gracefully`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force close after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
  });
}

bootstrap();
