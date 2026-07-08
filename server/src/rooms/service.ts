import type { Room, User } from '@prisma/client';
import type { ResolvedMedia, RoomDetails, RoomSummary, VideoStatus } from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { generateRoomSlug } from '../utils/ids.js';
import { roomStore } from './store.js';
import { resolveWithCache } from '../media/resolveWithCache.js';
import { logger } from '../utils/logger.js';

export interface CreateRoomInput {
  name: string;
  isPrivate: boolean;
  password?: string;
  maxParticipants: number;
  allowGuests: boolean;
  hostOnlyControl: boolean;
  videoUrl?: string;
  ownerId: string;
}

export class RoomServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function asStatus(s: string): VideoStatus {
  return s === 'playing' ? 'playing' : 'paused';
}

function parseResolved(json: string | null): ResolvedMedia | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as ResolvedMedia;
    return parsed && typeof parsed.kind === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Постер/название играющего видео для карточки библиотеки. У живой комнаты
 * берём актуальный снимок из рантайма (плейлистное имя + постер резолвера),
 * у холодной — персистнутый `videoResolvedJson`.
 */
export function videoCardInfo(room: Room): { videoPoster: string | null; videoTitle: string | null } {
  const runtime = roomStore.get(room.id);
  if (runtime) {
    const v = runtime.snapshotVideo();
    return {
      videoPoster: v.resolved?.poster ?? null,
      videoTitle: v.title ?? v.resolved?.title ?? null,
    };
  }
  const resolved = parseResolved(room.videoResolvedJson);
  return {
    videoPoster: resolved?.poster ?? null,
    videoTitle: resolved?.title ?? null,
  };
}

export function toRoomSummary(
  room: Room & { owner: Pick<User, 'username'> },
): RoomSummary {
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
    participantCount: roomStore.get(room.id)?.participants.size ?? 0,
    ...videoCardInfo(room),
    createdAt: room.createdAt.toISOString(),
  };
}

export function toRoomDetails(
  room: Room & { owner: Pick<User, 'username'> },
): RoomDetails {
  return {
    ...toRoomSummary(room),
    videoUrl: room.videoUrl,
    videoPositionSec: room.videoPositionSec,
    videoStatus: asStatus(room.videoStatus),
  };
}

export async function createRoom(input: CreateRoomInput): Promise<RoomDetails> {
  let slug = generateRoomSlug();
  for (let attempt = 0; attempt < 4; attempt++) {
    const collision = await prisma.room.findUnique({ where: { slug }, select: { id: true } });
    if (!collision) break;
    slug = generateRoomSlug();
  }

  const passwordHash =
    input.isPrivate && input.password ? await hashPassword(input.password) : null;

  // Best-effort resolve at create time so the first joiner sees a playable video.
  // Failures are non-fatal — owner can set/change the URL later through the UI.
  let videoResolvedJson: string | null = null;
  if (input.videoUrl) {
    try {
      const resolved = await resolveWithCache(input.videoUrl);
      videoResolvedJson = JSON.stringify(resolved);
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, url: input.videoUrl },
        'createRoom: resolve failed — proceeding without resolved media',
      );
    }
  }

  const room = await prisma.room.create({
    data: {
      slug,
      name: input.name,
      isPrivate: input.isPrivate,
      passwordHash,
      maxParticipants: input.maxParticipants,
      allowGuests: input.allowGuests,
      hostOnlyControl: input.hostOnlyControl,
      ownerId: input.ownerId,
      videoUrl: input.videoUrl ?? null,
      videoPositionSec: 0,
      videoStatus: 'paused',
      videoResolvedJson,
    },
    include: { owner: { select: { username: true } } },
  });

  return toRoomDetails(room);
}

export async function listAccessibleRooms(userId: string): Promise<RoomSummary[]> {
  const rooms = await prisma.room.findMany({
    where: {
      OR: [{ isPrivate: false }, { ownerId: userId }],
    },
    include: { owner: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rooms.map(toRoomSummary);
}

export async function getRoomBySlug(slug: string): Promise<RoomDetails | null> {
  const room = await prisma.room.findUnique({
    where: { slug },
    include: { owner: { select: { username: true } } },
  });
  return room ? toRoomDetails(room) : null;
}

export async function getRoomById(id: string): Promise<(Room & { owner: { username: string } }) | null> {
  return prisma.room.findUnique({
    where: { id },
    include: { owner: { select: { username: true } } },
  });
}

export interface JoinAuth {
  userId: string;
  isGuest: boolean;
}

export async function authorizeJoin(
  slug: string,
  auth: JoinAuth,
  password: string | undefined,
  inviteToken: string | undefined,
): Promise<Room & { owner: { username: string } }> {
  const room = await prisma.room.findUnique({
    where: { slug },
    include: { owner: { select: { username: true } } },
  });
  if (!room) throw new RoomServiceError(404, 'Room not found');

  if (auth.isGuest && !room.allowGuests) {
    throw new RoomServiceError(403, 'Guests are not allowed in this room');
  }

  if (room.isPrivate && room.ownerId !== auth.userId) {
    const okByInvite = inviteToken ? await consumeInvite(room.id, inviteToken) : false;
    if (!okByInvite) {
      if (!password) throw new RoomServiceError(401, 'Password required');
      if (!room.passwordHash || !(await verifyPassword(password, room.passwordHash))) {
        throw new RoomServiceError(403, 'Incorrect password');
      }
    }
  }

  const live = roomStore.get(room.id);
  if (live && live.participants.size >= room.maxParticipants) {
    throw new RoomServiceError(409, 'Room is full');
  }

  return room;
}

async function consumeInvite(roomId: string, token: string): Promise<boolean> {
  const invite = await prisma.inviteLink.findUnique({ where: { token } });
  if (!invite || invite.roomId !== roomId) return false;
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return false;
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return false;
  await prisma.inviteLink.update({
    where: { id: invite.id },
    data: { uses: { increment: 1 } },
  });
  return true;
}
