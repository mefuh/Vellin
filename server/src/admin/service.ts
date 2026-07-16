import type { Room, User } from '@prisma/client';
import type {
  AdminRoomSummary,
  AdminStatsResponse,
  AdminUserSummary,
  ChatMessage,
  RoomDetails,
  VideoStatus,
} from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { roomStore } from '../rooms/store.js';
import { userHub } from '../realtime/UserHub.js';
import { toRoomSummary, videoCardInfo } from '../rooms/service.js';
import { endCallSession } from '../rooms/events.js';
import { roomMutex } from '../utils/async-mutex.js';
import { hashPassword } from '../auth/password.js';
import { ensureRoomRuntime } from '../rooms/RoomRuntime.js';
import { logger } from '../utils/logger.js';

function asStatus(s: string): VideoStatus {
  return s === 'playing' ? 'playing' : 'paused';
}

export function toAdminUserSummary(
  u: Pick<
    User,
    'id' | 'publicId' | 'email' | 'username' | 'avatarSeed' | 'avatarUrl' | 'createdAt' | 'isBlocked' | 'blockedAt' | 'blockReason'
  > & { _count?: { rooms?: number } },
): AdminUserSummary {
  return {
    id: u.id,
    publicId: u.publicId,
    email: u.email,
    username: u.username,
    avatarSeed: u.avatarSeed,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt.toISOString(),
    isBlocked: u.isBlocked,
    blockedAt: u.blockedAt ? u.blockedAt.toISOString() : null,
    blockReason: u.blockReason,
    roomsOwned: u._count?.rooms ?? 0,
  };
}

export function toAdminRoomSummary(
  room: Room & { owner: Pick<User, 'username' | 'email'> },
): AdminRoomSummary {
  const live = roomStore.get(room.id);
  return {
    id: room.id,
    slug: room.slug,
    name: room.name,
    isPrivate: room.isPrivate,
    allowGuests: room.allowGuests,
    hostOnlyControl: room.hostOnlyControl,
    maxParticipants: room.maxParticipants,
    ownerId: room.ownerId,
    ownerUsername: room.owner.username,
    ownerEmail: room.owner.email,
    createdAt: room.createdAt.toISOString(),
    liveParticipants: live?.participants.size ?? 0,
    isActive: !!live,
    videoUrl: room.videoUrl,
    ...videoCardInfo(room),
  };
}

export function toRoomDetailsFromDb(
  room: Room & { owner: Pick<User, 'username'> },
): RoomDetails {
  return {
    ...toRoomSummary(room),
    videoUrl: room.videoUrl,
    videoPositionSec: room.videoPositionSec,
    videoStatus: asStatus(room.videoStatus),
  };
}

// ── Users ─────────────────────────────────────────────────────────────────

export async function listUsers(
  query: string | undefined,
  cursor: string | undefined,
  limit: number,
): Promise<{ users: AdminUserSummary[]; nextCursor: string | null }> {
  const where = query
    ? {
        OR: [
          { email: { contains: query, mode: 'insensitive' as const } },
          { username: { contains: query, mode: 'insensitive' as const } },
        ],
      }
    : undefined;
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { _count: { select: { rooms: true } } },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    users: page.map(toAdminUserSummary),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function getUserDetail(userId: string): Promise<{
  user: AdminUserSummary;
  rooms: (Room & { owner: { username: string; email: string } })[];
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { _count: { select: { rooms: true } } },
  });
  if (!user) return null;
  const rooms = await prisma.room.findMany({
    where: { ownerId: userId },
    include: { owner: { select: { username: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return {
    user: toAdminUserSummary(user),
    rooms,
  };
}

/** Каскадное удаление через Prisma. Перед удалением закрываем сессии. */
export async function deleteUser(userId: string): Promise<boolean> {
  // Закрываем все WS-сессии этого пользователя во всех runtimes.
  roomStore.closeUserSessionsEverywhere(userId, 'deleted');
  try {
    await prisma.user.delete({ where: { id: userId } });
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message, userId }, 'admin: delete user failed');
    return false;
  }
}

export async function blockUser(userId: string, reason?: string): Promise<AdminUserSummary> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      isBlocked: true,
      blockedAt: new Date(),
      blockReason: reason?.trim().slice(0, 500) || null,
    },
    include: { _count: { select: { rooms: true } } },
  });
  roomStore.closeUserSessionsEverywhere(userId, 'blocked');
  return toAdminUserSummary(user);
}

export async function unblockUser(userId: string): Promise<AdminUserSummary> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isBlocked: false, blockedAt: null, blockReason: null },
    include: { _count: { select: { rooms: true } } },
  });
  return toAdminUserSummary(user);
}

// ── Rooms ─────────────────────────────────────────────────────────────────

export async function listRoomsForAdmin(
  query: string | undefined,
  cursor: string | undefined,
  limit: number,
): Promise<{ rooms: AdminRoomSummary[]; nextCursor: string | null }> {
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { slug: { contains: query, mode: 'insensitive' as const } },
        ],
      }
    : undefined;
  const rows = await prisma.room.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { owner: { select: { username: true, email: true } } },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    rooms: page.map(toAdminRoomSummary),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function getRoomForAdmin(roomId: string): Promise<
  | (Room & { owner: { username: string; email: string } })
  | null
> {
  return prisma.room.findUnique({
    where: { id: roomId },
    include: { owner: { select: { username: true, email: true } } },
  });
}

export interface AdminRoomPatch {
  name?: string;
  isPrivate?: boolean;
  /** null = сбросить пароль, undefined = оставить как есть, string = новый. */
  password?: string | null;
  maxParticipants?: number;
  allowGuests?: boolean;
  hostOnlyControl?: boolean;
}

export async function patchRoom(
  roomId: string,
  patch: AdminRoomPatch,
): Promise<Room & { owner: { username: string; email: string } }> {
  const data: {
    name?: string;
    isPrivate?: boolean;
    passwordHash?: string | null;
    maxParticipants?: number;
    allowGuests?: boolean;
    hostOnlyControl?: boolean;
  } = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.isPrivate !== undefined) data.isPrivate = patch.isPrivate;
  if (patch.password !== undefined) {
    data.passwordHash = patch.password === null ? null : await hashPassword(patch.password);
  }
  if (patch.maxParticipants !== undefined) data.maxParticipants = patch.maxParticipants;
  if (patch.allowGuests !== undefined) data.allowGuests = patch.allowGuests;
  if (patch.hostOnlyControl !== undefined) data.hostOnlyControl = patch.hostOnlyControl;

  const updated = await prisma.room.update({
    where: { id: roomId },
    data,
    include: { owner: { select: { username: true, email: true } } },
  });

  // Синхронизируем живой runtime + broадкастим обновление участникам.
  const runtime = roomStore.get(roomId);
  if (runtime) {
    runtime.maxParticipants = updated.maxParticipants;
    runtime.allowGuests = updated.allowGuests;
    runtime.broadcast({
      t: 'room_state_update',
      hostOnlyControl: updated.hostOnlyControl,
      hostUserId: updated.ownerId,
    });
  }
  return updated;
}

export async function closeRoom(roomId: string, byAdminUserId: string): Promise<number> {
  const runtime = roomStore.get(roomId);
  if (!runtime) return 0;
  return runtime.forceClose(byAdminUserId);
}

export async function deleteRoomById(roomId: string, byAdminUserId: string): Promise<void> {
  const runtime = roomStore.get(roomId);
  if (runtime) runtime.forceClose(byAdminUserId);
  await prisma.room.delete({ where: { id: roomId } });
}

export async function endRoomCall(roomId: string): Promise<number> {
  const runtime = roomStore.get(roomId);
  if (!runtime) return 0;
  const ended = await roomMutex.run(`call:${roomId}`, () => runtime.endCall());
  if (ended > 0) endCallSession(roomId);
  return ended;
}

// ── Stats ─────────────────────────────────────────────────────────────────

export async function buildStats(): Promise<AdminStatsResponse> {
  const [totalUsers, blockedUsers, totalRooms, privateRooms] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBlocked: true } }),
    prisma.room.count(),
    prisma.room.count({ where: { isPrivate: true } }),
  ]);
  return {
    users: {
      total: totalUsers,
      blocked: blockedUsers,
      online: userHub.countOnline(),
    },
    rooms: {
      total: totalRooms,
      active: roomStore.list().length,
      private: privateRooms,
    },
    serverTime: new Date().toISOString(),
  };
}

// ── Broadcast ─────────────────────────────────────────────────────────────

/** Системное сообщение во все активные комнаты + запись в БД. */
export async function broadcastSystemMessage(body: string): Promise<number> {
  const trimmed = body.trim();
  if (!trimmed) return 0;
  const runtimes = roomStore.list();
  let delivered = 0;
  for (const runtime of runtimes) {
    try {
      await runtime.appendSystemMessage(trimmed);
      delivered += 1;
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, roomId: runtime.roomId },
        'admin: broadcast to room failed',
      );
    }
  }
  return delivered;
}

// ── Welcome-like snapshot для админ-просмотра ─────────────────────────────

export interface AdminRoomLiveSnapshot {
  participants: import('@vellin/shared').ParticipantInfo[];
  recentMessages: ChatMessage[];
}

export async function snapshotLiveRoom(
  room: Room & { owner: { username: string; email: string } },
): Promise<AdminRoomLiveSnapshot> {
  const runtime = await ensureRoomRuntime(room);
  // We build a partial welcome — passing room.ownerId as "forUserId" gives us
  // a valid `you` slot even if the admin isn't yet attached.
  const welcome = await runtime.buildWelcome(room.ownerId);
  return {
    participants: welcome.participants,
    recentMessages: welcome.recentMessages,
  };
}
