import { prisma } from '../../db/prisma.js';
import { userHub } from '../../realtime/UserHub.js';
import { roomStore } from '../../rooms/store.js';
import { logger } from '../../utils/logger.js';

function startOfTodayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

interface DailySnapshot {
  registrations: number;
  dau: number;
  online: number;
  activeRooms: number;
  roomsCreated: number;
  messages: number;
}

/**
 * Считает суточный снапшот метрик, которые нельзя восстановить задним числом.
 * DAU — приближение: число разных пользователей с активностью сессии сегодня
 * (Session.lastSeenAt троттлится 5 мин), объединённое с текущим онлайном.
 */
async function computeSnapshot(): Promise<DailySnapshot> {
  const start = startOfTodayUTC();
  const [registrations, activeSessions, roomsCreated, messages] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: start } } }),
    prisma.session.findMany({ where: { lastSeenAt: { gte: start } }, distinct: ['userId'], select: { userId: true } }),
    prisma.room.count({ where: { createdAt: { gte: start } } }),
    prisma.message.count({ where: { createdAt: { gte: start } } }),
  ]);
  const dauSet = new Set(activeSessions.map((s) => s.userId));
  return {
    registrations,
    dau: Math.max(dauSet.size, userHub.countOnline()),
    online: userHub.countOnline(),
    activeRooms: roomStore.list().length,
    roomsCreated,
    messages,
  };
}

/** Пишет/обновляет строку DailyStat за сегодня (идемпотентно). */
export async function runRollup(): Promise<void> {
  const day = startOfTodayUTC().toISOString().slice(0, 10);
  const snapshot = await computeSnapshot();
  const json = JSON.stringify(snapshot);
  await prisma.dailyStat.upsert({ where: { day }, create: { day, json }, update: { json } });
}

/**
 * Запускает периодический rollup: сразу на старте и далее каждые 6 часов.
 * Строка за сегодня перезаписывается; DAU считается по Session.lastSeenAt за
 * день и потому накапливается сам собой к вечернему запуску, online — спот.
 */
export function startRollupJob(): void {
  const tick = (): void => {
    void runRollup().catch((err) => logger.error({ err }, 'analytics: rollup failed'));
  };
  tick();
  setInterval(tick, 6 * 60 * 60 * 1000).unref();
}
