import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { CREATED_USERS, RUN_DIR } from './env';
import { killTestApp, restoreAppPrefs } from './app-person';

/**
 * Уборка после прогона: созданные тестами люди и их переписки. Удаления
 * аккаунта в API нет, поэтому — напрямую в базе стенда, через клиент Prisma
 * сервера. Это уборка, а не проверка: на результат тестов она не влияет.
 */
export default async function globalTeardown(): Promise<void> {
  // Приложение могло остаться открытым при падении — закрываем тестовую сборку
  // и в любом случае возвращаем человеку его настройки приложения.
  killTestApp();
  restoreAppPrefs();
  if (!existsSync(CREATED_USERS)) return;
  const ids = readFileSync(CREATED_USERS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => (JSON.parse(l) as { id: string }).id);
  if (ids.length > 0) {
    const serverDir = join(__dirname, '..', '..', 'server');
    if (!process.env.DATABASE_URL) {
      const envFile = join(serverDir, '.env');
      if (existsSync(envFile)) {
        const m = /^DATABASE_URL=(.*)$/m.exec(readFileSync(envFile, 'utf8'));
        if (m) process.env.DATABASE_URL = m[1]!.trim().replace(/^"|"$/g, '');
      }
    }
    try {
      const req = createRequire(join(serverDir, 'package.json'));
      const { PrismaClient } = req('@prisma/client') as typeof import('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.conversation.deleteMany({
        where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    } catch (e) {
      console.warn(`Уборка не удалась, удалите вручную: ${ids.join(', ')} — ${(e as Error).message}`);
      return;
    }
  }
  if (!process.env.KEEP_E2E_RUN) rmSync(RUN_DIR, { recursive: true, force: true });
}
