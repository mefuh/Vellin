import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';

const clickedSchema = z.object({ jobId: z.string().min(1).max(64) });

/**
 * Публичный (без авторизации) маршрут клик-бикона push. Service Worker не несёт
 * JWT, поэтому при клике на уведомление шлёт сюда jobId (cuid — неугадываемый),
 * а мы помечаем соответствующую доставку как «кликнутую» — это питает CTR.
 * Никаких данных не раскрывает и ничего деструктивного не делает.
 */
export async function pushPublicRoutes(app: FastifyInstance): Promise<void> {
  app.post('/push/clicked', async (req, reply) => {
    const parsed = clickedSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(204).send();
      return;
    }
    await prisma.pushDelivery
      .updateMany({
        where: { jobId: parsed.data.jobId, clickedAt: null },
        data: { clickedAt: new Date() },
      })
      .catch(() => {});
    reply.code(204).send();
  });
}
