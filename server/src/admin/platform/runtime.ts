import type { FastifyInstance } from 'fastify';
import type { Principal } from '../../auth/jwt.js';
import type { RuntimeConfig } from '@vellin/shared';
import { getSettings } from './config.js';
import { enabledFlagKeys } from './flags.js';
import { activeRuntimeAnnouncements } from './announcements.js';

/**
 * Публичный снапшот конфигурации для клиента: режим обслуживания, тумблеры,
 * включённые флаги и активные объявления. Аутентификация опциональна — если
 * пришёл валидный session-JWT, используем userId для таргетинга объявлений
 * (роль / новый пользователь). Кэшировать на клиенте с коротким TTL.
 */
export async function runtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/runtime', async (req, reply) => {
    let userId: string | null = null;
    try {
      const payload = await req.jwtVerify<Principal | { ticket?: boolean }>();
      if (!(payload as { ticket?: boolean }).ticket && (payload as Principal).kind === 'user') {
        userId = (payload as Principal).userId;
      }
    } catch {
      // аноним — это ок
    }

    const [settings, flags, announcements] = await Promise.all([
      getSettings(),
      enabledFlagKeys(),
      activeRuntimeAnnouncements(userId),
    ]);

    reply.send({
      maintenance: settings.maintenance,
      toggles: settings.toggles,
      flags,
      announcements,
    } satisfies RuntimeConfig);
  });
}
