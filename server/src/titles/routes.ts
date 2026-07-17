import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  FavoriteTitle,
  FavoriteTitlesResponse,
  SearchTitlesResponse,
  UpdateFavoriteTitlesRequest,
} from '@vellin/shared';
import type { Principal } from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';
import { assertFavoritesEnabled } from '../admin/platform/gate.js';
import { searchTitles } from './kinopoisk.js';
import { getFavorites, setFavorites } from './service.js';

function deny(reply: FastifyReply, status: number, error: string, message: string): void {
  reply.code(status).send({ error, message, statusCode: status });
}

/** Принципал-пользователь (не гость) или 403. */
function requireUser(req: FastifyRequest, reply: FastifyReply): Extract<Principal, { kind: 'user' }> | null {
  const principal = req.principal!;
  if (principal.kind !== 'user') {
    deny(reply, 403, 'Forbidden', 'Доступно только зарегистрированным пользователям');
    return null;
  }
  return principal;
}

const titleItem = z.object({
  kpId: z.number(),
  type: z.string().max(64),
  title: z.string().max(300),
  originalTitle: z.string().max(300).nullable(),
  year: z.number().nullable(),
  posterUrl: z.string().max(1000).nullable(),
  ratingKp: z.number().nullable(),
  ratingImdb: z.number().nullable(),
});
const updateSchema = z.object({
  // Пользовательского лимита нет (безлимитное добавление); .max(100) — только
  // предохранитель от абьюза, чтобы один PUT не залил тысячи строк в БД.
  titles: z.array(titleItem).max(100),
}) satisfies z.ZodType<UpdateFavoriteTitlesRequest>;

/**
 * Поиск фильмов/сериалов (kinopoisk.dev) + избранное профиля. Отдельный плагин
 * с requireAuth (как roomRoutes/friendRoutes), чтобы хук не протёк на auth.
 */
export async function titleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Подсказки для выбора в избранное.
  app.get<{ Querystring: { q?: string } }>('/titles/search', async (req, reply) => {
    if (!requireUser(req, reply)) return;
    await assertFavoritesEnabled();
    const q = (req.query.q ?? '').slice(0, 120);
    const titles = q ? await searchTitles(q) : [];
    reply.send({ titles } satisfies SearchTitlesResponse);
  });

  app.get('/titles/favorites', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    reply.send({ titles: await getFavorites(p.userId) } satisfies FavoriteTitlesResponse);
  });

  app.put('/titles/favorites', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    await assertFavoritesEnabled();
    const body = updateSchema.parse(req.body ?? {});
    const titles = await setFavorites(p.userId, body.titles as FavoriteTitle[]);
    reply.send({ titles } satisfies FavoriteTitlesResponse);
  });
}
