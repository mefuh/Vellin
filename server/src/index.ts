import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { logger } from './utils/logger.js';
import { disconnectPrisma } from './db/prisma.js';
import { roomStore } from './rooms/store.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    for (const runtime of roomStore.values()) {
      runtime.destroy();
    }
    try {
      await app.close();
    } finally {
      await disconnectPrisma();
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info({ port: env.PORT, host: env.HOST }, 'Vellin server started');
  } catch (err) {
    logger.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});
