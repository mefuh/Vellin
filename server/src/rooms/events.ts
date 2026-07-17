import type { RoomEvent } from '@prisma/client';
import type { RoomEventDTO } from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Журнал событий комнаты (для админ-панели). Логирование — «выстрелил и забыл»:
 * сбой записи не должен влиять на игровой цикл комнаты. Сессии звонков (start/end
 * с длительностью) выводятся из переходов числа участников звонка 0↔1.
 */

interface LogOpts {
  actorId?: string | null;
  actorName?: string | null;
  data?: Record<string, unknown>;
}

export function logRoomEvent(roomId: string, type: string, opts: LogOpts = {}): void {
  prisma.roomEvent
    .create({
      data: {
        roomId,
        type,
        actorId: opts.actorId ?? null,
        actorName: opts.actorName ?? null,
        dataJson: JSON.stringify(opts.data ?? {}),
      },
    })
    .catch((err: unknown) => logger.warn({ err: (err as Error).message, roomId, type }, 'roomEvent: log failed'));
}

// ── Сессии звонков ───────────────────────────────────────────────────────────
// roomId → момент начала текущего звонка (ms). Живёт в памяти инстанса.
const callStart = new Map<string, number>();

/** Участник вошёл в звонок. membersAfter — число участников звонка после входа. */
export function noteCallJoin(roomId: string, actor: { id?: string | null; name?: string | null }, membersAfter: number): void {
  logRoomEvent(roomId, 'call_join', { actorId: actor.id, actorName: actor.name });
  if (membersAfter === 1 && !callStart.has(roomId)) {
    callStart.set(roomId, Date.now());
    logRoomEvent(roomId, 'call_start', { actorId: actor.id, actorName: actor.name });
  }
}

/** Участник вышел из звонка. membersAfter — число участников звонка после выхода. */
export function noteCallLeave(roomId: string, actor: { id?: string | null; name?: string | null }, membersAfter: number): void {
  logRoomEvent(roomId, 'call_leave', { actorId: actor.id, actorName: actor.name });
  if (membersAfter === 0) endCallSession(roomId, actor);
}

/** Принудительно завершает сессию звонка (админ-endCall / опустошение). */
export function endCallSession(roomId: string, actor: { id?: string | null; name?: string | null } = {}): void {
  const start = callStart.get(roomId);
  if (start === undefined) return;
  callStart.delete(roomId);
  const durationSec = Math.round((Date.now() - start) / 1000);
  logRoomEvent(roomId, 'call_end', { actorId: actor.id, actorName: actor.name, data: { durationSec } });
}

// ── Выборка ──────────────────────────────────────────────────────────────────
function toDTO(r: RoomEvent): RoomEventDTO {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(r.dataJson) as Record<string, unknown>;
  } catch { /* ignore */ }
  return {
    id: r.id,
    type: r.type,
    actorId: r.actorId,
    actorName: r.actorName,
    data,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listRoomEvents(
  roomId: string,
  cursor: string | undefined,
  limit: number,
): Promise<{ events: RoomEventDTO[]; nextCursor: string | null }> {
  const rows = await prisma.roomEvent.findMany({
    where: { roomId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    events: page.map(toDTO),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}
