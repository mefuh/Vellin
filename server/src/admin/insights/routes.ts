import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  AdminSearchResponse,
  GeoBucket,
  GeoResponse,
  SearchRoomHit,
  SearchUserHit,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { requirePermission, requireAdminAccess, actorCan } from '../rbac/middleware.js';

/** Извлекает страну из строки города формата «Город, Страна» (гео-автокомплит). */
function countryOf(city: string): string {
  const parts = city.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : '—';
}

/**
 * Аналитические врезки: география аудитории и глобальный поиск. География — за
 * analytics.view; поиск — доступен любому сотруднику, но секции фильтруются по
 * его правам (users.view / rooms.view).
 */
export async function adminInsightsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/geo', { preHandler: requirePermission('analytics.view') }, async (_req, reply) => {
    const [totalUsers, grouped] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ['city'], where: { city: { not: null } }, _count: { _all: true } }),
    ]);
    const cityBuckets: GeoBucket[] = grouped
      .filter((g): g is typeof g & { city: string } => !!g.city)
      .map((g) => ({ name: g.city, count: g._count._all }))
      .sort((a, b) => b.count - a.count);
    const totalWithCity = cityBuckets.reduce((s, b) => s + b.count, 0);

    const countryMap = new Map<string, number>();
    for (const b of cityBuckets) {
      const c = countryOf(b.name);
      countryMap.set(c, (countryMap.get(c) ?? 0) + b.count);
    }
    const topCountries: GeoBucket[] = [...countryMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    reply.send({
      totalUsers,
      totalWithCity,
      topCities: cityBuckets.slice(0, 30),
      topCountries,
    } satisfies GeoResponse);
  });

  app.get<{ Querystring: { q?: string } }>(
    '/admin/search',
    { preHandler: requireAdminAccess },
    async (req, reply) => {
      const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);

      let users: SearchUserHit[] = [];
      let rooms: SearchRoomHit[] = [];

      if (actorCan(req, 'users.view')) {
        const rows = await prisma.user.findMany({
          where: {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { publicId: { contains: q } },
              { id: q },
            ],
          },
          select: { id: true, publicId: true, username: true, email: true, avatarSeed: true, avatarUrl: true },
          take: 6,
        });
        users = rows;
      }
      if (actorCan(req, 'rooms.view')) {
        const rows = await prisma.room.findMany({
          where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }, { id: q }] },
          select: { id: true, slug: true, name: true },
          take: 6,
        });
        rooms = rows;
      }
      reply.send({ users, rooms } satisfies AdminSearchResponse);
    },
  );
}
