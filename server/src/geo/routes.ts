import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SearchCitiesResponse } from '@vellin/shared';
import { requireAuth } from '../auth/middleware.js';
import { searchCities } from './cities.js';

const querySchema = z.object({ q: z.string().max(80).optional() });

/**
 * Геосправочник. Отдельный плагин-контекст с `requireAuth` (как roomRoutes/
 * friendRoutes) — хук не протекает на auth-роуты.
 */
export async function geoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Подсказки городов для автодополнения поля «Город» в профиле.
  app.get('/geo/cities', async (req, reply) => {
    const { q } = querySchema.parse(req.query);
    const cities = q ? searchCities(q, 8) : [];
    reply.send({ cities } satisfies SearchCitiesResponse);
  });
}
