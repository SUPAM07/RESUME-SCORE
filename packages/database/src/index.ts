import { PrismaClient } from '@prisma/client';

// ─── Singleton Prisma Client ──────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'minimal',
  });
}

// Reuse in development to prevent hot-reload from opening too many connections
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.__prisma = prisma;
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

process.on('beforeExit', () => {
  void disconnectDb();
});

export { PrismaClient } from '@prisma/client';
export default prisma;
