import { Prisma } from '@prisma/client';
import type {
  AnalyticsOverview,
  AnalyticsPair,
  AnalyticsPoint,
  AnalyticsRange,
  AnalyticsSeries,
  RoomsAnalytics,
  SharedWatchAnalytics,
  SocialAnalytics,
  UsersAnalytics,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { userHub } from '../../realtime/UserHub.js';
import { roomStore } from '../../rooms/store.js';

export function rangeDays(range: AnalyticsRange): number {
  return range === '7d' ? 7 : range === '90d' ? 90 : 30;
}

/** UTC-полночь `days` дней назад (включая сегодня → всего days точек). */
function sinceDate(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Заполняет пропуски ряда нулями по всем дням диапазона. */
function fillSeries(rows: { date: string; value: number }[], days: number): AnalyticsSeries {
  const map = new Map(rows.map((r) => [r.date, Number(r.value)]));
  const points: AnalyticsPoint[] = [];
  const start = sinceDate(days);
  let total = 0;
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = utcDayKey(d);
    const value = map.get(key) ?? 0;
    total += value;
    points.push({ date: key, value });
  }
  return { points, total };
}

type RawDay = { date: string; value: number };

/** Гистограмма по дню для «createdAt»-подобной колонки указанной таблицы. */
async function dailyByColumn(table: string, column: string, since: Date, where?: Prisma.Sql): Promise<RawDay[]> {
  // table/column — из белого списка вызовов ниже (не пользовательский ввод).
  const rows = await prisma.$queryRaw<RawDay[]>(Prisma.sql`
    SELECT to_char(date_trunc('day', ${Prisma.raw(`"${column}"`)}), 'YYYY-MM-DD') AS date,
           count(*)::int AS value
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE ${Prisma.raw(`"${column}"`)} >= ${since}
    ${where ? Prisma.sql`AND ${where}` : Prisma.empty}
    GROUP BY 1 ORDER BY 1
  `);
  return rows;
}

function avgLiveParticipants(): number {
  const runtimes = roomStore.list();
  if (runtimes.length === 0) return 0;
  const sum = runtimes.reduce((acc, rt) => acc + rt.participants.size, 0);
  return Math.round((sum / runtimes.length) * 10) / 10;
}

// ── Overview ────────────────────────────────────────────────────────────────

export async function buildOverview(): Promise<AnalyticsOverview> {
  const since7 = sinceDate(7);
  const startToday = sinceDate(1);
  const [
    totalUsers, blockedUsers, newToday, new7d, totalRooms, privateRooms,
    messages, dmSent, friendships, reg7rows, sw,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBlocked: true } }),
    prisma.user.count({ where: { createdAt: { gte: startToday } } }),
    prisma.user.count({ where: { createdAt: { gte: since7 } } }),
    prisma.room.count(),
    prisma.room.count({ where: { isPrivate: true } }),
    prisma.message.count(),
    prisma.directMessage.count(),
    prisma.friendship.count({ where: { status: 'accepted' } }),
    dailyByColumn('User', 'createdAt', since7),
    prisma.sharedWatchStat.aggregate({ _sum: { totalSeconds: true, sessionsCount: true } }),
  ]);
  return {
    users: {
      total: totalUsers,
      online: userHub.countOnline(),
      blocked: blockedUsers,
      guestsOnline: 0,
      newToday,
      new7d,
    },
    rooms: { total: totalRooms, active: roomStore.list().length, private: privateRooms },
    social: { messages, dmSent, friendships },
    sharedWatch: {
      totalHours: Math.round((sw._sum.totalSeconds ?? 0) / 3600),
      sessions: sw._sum.sessionsCount ?? 0,
    },
    registrations7d: fillSeries(reg7rows, 7),
    generatedAt: new Date().toISOString(),
  };
}

// ── Users ───────────────────────────────────────────────────────────────────

export async function buildUsersAnalytics(range: AnalyticsRange): Promise<UsersAnalytics> {
  const days = rangeDays(range);
  const since = sinceDate(days);
  const [regRows, dauRows, total, blocked, deleted, hourRows] = await Promise.all([
    dailyByColumn('User', 'createdAt', since),
    // DAU из суточных снапшотов (накапливается с момента внедрения rollup).
    prisma.dailyStat.findMany({ where: { day: { gte: utcDayKey(since) } }, orderBy: { day: 'asc' } }),
    prisma.user.count(),
    prisma.user.count({ where: { isBlocked: true } }),
    prisma.auditLog.count({ where: { action: 'user.delete' } }),
    prisma.$queryRaw<{ hour: number; value: number }[]>(Prisma.sql`
      SELECT extract(hour from "createdAt")::int AS hour, count(*)::int AS value
      FROM "Session" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1
    `),
  ]);

  const dauMap = new Map<string, number>();
  for (const row of dauRows) {
    try {
      const j = JSON.parse(row.json) as { dau?: number };
      if (typeof j.dau === 'number') dauMap.set(row.day, j.dau);
    } catch { /* ignore */ }
  }
  const dau = fillSeries([...dauMap].map(([date, value]) => ({ date, value })), days);

  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    value: hourRows.find((r) => Number(r.hour) === hour)?.value ?? 0,
  }));

  return {
    registrations: fillSeries(regRows, days),
    dau,
    totals: { total, blocked, online: userHub.countOnline(), guestsOnline: 0, deleted },
    byHour,
  };
}

// ── Rooms ───────────────────────────────────────────────────────────────────

export async function buildRoomsAnalytics(range: AnalyticsRange): Promise<RoomsAnalytics> {
  const days = rangeDays(range);
  const since = sinceDate(days);
  const [createdRows, total, privateRooms, topByMessages] = await Promise.all([
    dailyByColumn('Room', 'createdAt', since),
    prisma.room.count(),
    prisma.room.count({ where: { isPrivate: true } }),
    prisma.message.groupBy({ by: ['roomId'], _count: { _all: true }, orderBy: { _count: { roomId: 'desc' } }, take: 8 }),
  ]);

  const roomIds = topByMessages.map((r) => r.roomId);
  const rooms = await prisma.room.findMany({
    where: { id: { in: roomIds } },
    select: { id: true, slug: true, name: true, isPrivate: true, _count: { select: { memberships: true } } },
  });
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const topRooms = topByMessages.flatMap((t) => {
    const r = roomMap.get(t.roomId);
    if (!r) return [];
    return [{
      id: r.id, slug: r.slug, name: r.name, isPrivate: r.isPrivate,
      messages: t._count._all, members: r._count.memberships,
    }];
  });

  return {
    created: fillSeries(createdRows, days),
    totals: { total, active: roomStore.list().length, private: privateRooms, avgLiveParticipants: avgLiveParticipants() },
    topRooms,
  };
}

// ── Shared watch ──────────────────────────────────────────────────────────────

async function resolvePairs(
  rows: { userAId: string; userBId: string; totalSeconds: number; sessionsCount: number; longestSessionSeconds: number; lastWatchedAt: Date | null }[],
): Promise<AnalyticsPair[]> {
  const ids = [...new Set(rows.flatMap((r) => [r.userAId, r.userBId]))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.username]));
  return rows.map((r) => ({
    userAId: r.userAId,
    userAName: nameOf.get(r.userAId) ?? '—',
    userBId: r.userBId,
    userBName: nameOf.get(r.userBId) ?? '—',
    totalSeconds: r.totalSeconds,
    sessionsCount: r.sessionsCount,
    longestSessionSeconds: r.longestSessionSeconds,
    lastWatchedAt: r.lastWatchedAt ? r.lastWatchedAt.toISOString() : null,
  }));
}

export async function buildSharedWatchAnalytics(): Promise<SharedWatchAnalytics> {
  const [agg, topRows, longRows] = await Promise.all([
    prisma.sharedWatchStat.aggregate({ _sum: { totalSeconds: true, sessionsCount: true }, _count: { _all: true } }),
    prisma.sharedWatchStat.findMany({ orderBy: { totalSeconds: 'desc' }, take: 10 }),
    prisma.sharedWatchStat.findMany({ orderBy: { longestSessionSeconds: 'desc' }, take: 10 }),
  ]);
  const totalSeconds = agg._sum.totalSeconds ?? 0;
  const sessions = agg._sum.sessionsCount ?? 0;
  const [topPairs, longestSessions] = await Promise.all([resolvePairs(topRows), resolvePairs(longRows)]);
  return {
    totals: {
      totalHours: Math.round(totalSeconds / 3600),
      sessions,
      avgSessionMinutes: sessions > 0 ? Math.round(totalSeconds / sessions / 60) : 0,
      pairs: agg._count._all,
    },
    topPairs,
    longestSessions,
  };
}

// ── Social ────────────────────────────────────────────────────────────────────

export async function buildSocialAnalytics(range: AnalyticsRange): Promise<SocialAnalytics> {
  const days = rangeDays(range);
  const since = sinceDate(days);
  const [msgRows, friendRows, messages, photos, voice, video, invites, friendships, blocks] = await Promise.all([
    dailyByColumn('Message', 'createdAt', since),
    dailyByColumn('Friendship', 'createdAt', since, Prisma.sql`status = 'accepted'`),
    prisma.message.count(),
    prisma.directMessage.count({ where: { imageUrl: { not: null } } }),
    prisma.directMessage.count({ where: { voiceUrl: { not: null } } }),
    prisma.directMessage.count({ where: { videoStatus: { not: null } } }),
    prisma.directMessage.count({ where: { inviteRoomId: { not: null } } }),
    prisma.friendship.count({ where: { status: 'accepted' } }),
    prisma.block.count(),
  ]);
  return {
    messages: fillSeries(msgRows, days),
    friendships: fillSeries(friendRows, days),
    totals: { messages, photos, voice, video, invites, friendships, blocks },
  };
}
