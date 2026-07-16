import type { SharedWatchDTO } from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { userHub } from '../realtime/UserHub.js';
import { logger } from '../utils/logger.js';

/**
 * «Совместное время» — накопительная попарная статистика совместного пребывания
 * в комнатах. Единственная точка начисления: RoomRuntime отслеживает co-presence
 * и через инъектируемый sink зовёт `onSessionStart`/`onSessionEnd` (DI разрывает
 * цикл импортов rooms↔social↔realtime). Начисляем агрегаты по завершении сессии
 * и рассылаем живое обновление обоим участникам — карточка профиля открывается
 * мгновенно из БД, а «прямо сейчас вместе» тикает у клиента локально.
 *
 * Расширяемость: чтобы добавить новую метрику (совместные фильмы/жанры/бейджи),
 * достаточно расширить `onSessionEnd` (туда можно прокидывать контекст сессии,
 * напр. игравший title) и завести соседнюю таблицу по той же паре.
 */

/** Каноническая упорядоченная пара: userAId < userBId (одна строка на пару). */
function pairOf(x: string, y: string): { userAId: string; userBId: string } {
  return x < y ? { userAId: x, userBId: y } : { userAId: y, userBId: x };
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** Агрегаты пары из БД (без `together` — его подставляет вызывающий). */
export type SharedWatchAggregates = Omit<SharedWatchDTO, 'together' | 'togetherSince'>;

const ZERO: SharedWatchAggregates = {
  totalSeconds: 0,
  sessionsCount: 0,
  longestSessionSeconds: 0,
  firstWatchedAt: null,
  lastWatchedAt: null,
};

/** Прочитать агрегаты пары (нули, если пара ещё не встречалась). */
export async function getSharedWatch(x: string, y: string): Promise<SharedWatchAggregates> {
  const { userAId, userBId } = pairOf(x, y);
  const row = await prisma.sharedWatchStat.findUnique({
    where: { userAId_userBId: { userAId, userBId } },
  });
  if (!row) return ZERO;
  return {
    totalSeconds: row.totalSeconds,
    sessionsCount: row.sessionsCount,
    longestSessionSeconds: row.longestSessionSeconds,
    firstWatchedAt: iso(row.firstWatchedAt),
    lastWatchedAt: iso(row.lastWatchedAt),
  };
}

/**
 * Ручная корректировка совместного времени администратором: начисление
 * (delta>0) или списание (delta<0). Итог не опускается ниже нуля. Рассылает
 * обоим участникам обновлённые агрегаты, чтобы открытые карточки перерисовались.
 */
export async function adjustSharedWatch(x: string, y: string, deltaSeconds: number): Promise<SharedWatchAggregates> {
  const { userAId, userBId } = pairOf(x, y);
  const agg = await prisma.$transaction(async (tx) => {
    const existing = await tx.sharedWatchStat.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
    const next = Math.max(0, (existing?.totalSeconds ?? 0) + Math.round(deltaSeconds));
    const row = await tx.sharedWatchStat.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      create: { userAId, userBId, totalSeconds: next, sessionsCount: 0, longestSessionSeconds: 0 },
      update: { totalSeconds: next },
    });
    return {
      totalSeconds: row.totalSeconds,
      sessionsCount: row.sessionsCount,
      longestSessionSeconds: row.longestSessionSeconds,
      firstWatchedAt: iso(row.firstWatchedAt),
      lastWatchedAt: iso(row.lastWatchedAt),
    } satisfies SharedWatchAggregates;
  });
  pushBoth(x, y, agg, false, null);
  return agg;
}

/**
 * Аннулирование совместного времени пары (полный сброс агрегатов). Строку
 * удаляем и рассылаем обоим нулевые агрегаты.
 */
export async function resetSharedWatch(x: string, y: string): Promise<void> {
  const { userAId, userBId } = pairOf(x, y);
  await prisma.sharedWatchStat.deleteMany({ where: { userAId, userBId } });
  pushBoth(x, y, ZERO, false, null);
}

/** Разослать живое обновление обоим участникам пары (peerId — «другой»). */
function pushBoth(x: string, y: string, agg: SharedWatchAggregates, together: boolean, togetherSince: string | null): void {
  userHub.pushTo(x, { t: 'shared_time', peerId: y, ...agg, together, togetherSince });
  userHub.pushTo(y, { t: 'shared_time', peerId: x, ...agg, together, togetherSince });
}

/**
 * Начало совместной сессии пары (оба только что оказались вместе). Ничего не
 * персистим (интервал ещё идёт) — только шлём обоим «together с этого момента»,
 * чтобы открытая карточка начала тикать. Текущие агрегаты подтягиваем из БД.
 */
export async function onSessionStart(x: string, y: string, sinceMs: number): Promise<void> {
  try {
    const agg = await getSharedWatch(x, y);
    pushBoth(x, y, agg, true, new Date(sinceMs).toISOString());
  } catch (err) {
    logger.error({ err, x, y }, 'sharedTime: onSessionStart failed');
  }
}

/**
 * Конец совместной сессии: начисляем `seconds` в накопительные агрегаты пары
 * (транзакция read-modify-write — max для рекорда нельзя выразить одним upsert)
 * и рассылаем обновлённые агрегаты с `together:false`.
 */
export async function onSessionEnd(x: string, y: string, seconds: number, endedAtMs: number): Promise<void> {
  if (seconds <= 0) return;
  const { userAId, userBId } = pairOf(x, y);
  const endedAt = new Date(endedAtMs);
  try {
    const agg = await prisma.$transaction(async (tx) => {
      const existing = await tx.sharedWatchStat.findUnique({
        where: { userAId_userBId: { userAId, userBId } },
      });
      const row = await tx.sharedWatchStat.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: {
          userAId,
          userBId,
          totalSeconds: seconds,
          sessionsCount: 1,
          longestSessionSeconds: seconds,
          firstWatchedAt: endedAt,
          lastWatchedAt: endedAt,
        },
        update: {
          totalSeconds: { increment: seconds },
          sessionsCount: { increment: 1 },
          longestSessionSeconds: Math.max(existing?.longestSessionSeconds ?? 0, seconds),
          firstWatchedAt: existing?.firstWatchedAt ?? endedAt,
          lastWatchedAt: endedAt,
        },
      });
      return {
        totalSeconds: row.totalSeconds,
        sessionsCount: row.sessionsCount,
        longestSessionSeconds: row.longestSessionSeconds,
        firstWatchedAt: iso(row.firstWatchedAt),
        lastWatchedAt: iso(row.lastWatchedAt),
      } satisfies SharedWatchAggregates;
    });
    pushBoth(x, y, agg, false, null);
  } catch (err) {
    logger.error({ err, x, y, seconds }, 'sharedTime: onSessionEnd failed');
  }
}
