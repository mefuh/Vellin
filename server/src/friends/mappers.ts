import type { Notification, User } from '@prisma/client';
import type { AppNotification, NotificationType, PublicUser } from '@vellin/shared';
import { prisma } from '../db/prisma.js';

type PublicUserCols = Pick<User, 'id' | 'publicId' | 'username' | 'avatarSeed' | 'avatarUrl'>;

export const PUBLIC_USER_SELECT = {
  id: true,
  publicId: true,
  username: true,
  avatarSeed: true,
  avatarUrl: true,
} as const;

export function toPublicUser(u: PublicUserCols): PublicUser {
  return {
    id: u.id,
    publicId: u.publicId,
    username: u.username,
    avatarSeed: u.avatarSeed,
    avatarUrl: u.avatarUrl ?? null,
    kind: 'user',
  };
}

function parseData(json: string): AppNotification['data'] {
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    return {
      roomSlug: typeof v.roomSlug === 'string' ? v.roomSlug : undefined,
      roomName: typeof v.roomName === 'string' ? v.roomName : undefined,
      conversationId: typeof v.conversationId === 'string' ? v.conversationId : undefined,
      preview: typeof v.preview === 'string' ? v.preview : undefined,
      count: typeof v.count === 'number' ? v.count : undefined,
    };
  } catch {
    return {};
  }
}

function buildNotification(row: Notification, actor: PublicUser | null): AppNotification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    actor,
    data: parseData(row.dataJson),
    read: row.readAt != null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Один ряд → DTO (отдельный запрос за актором). */
export async function toAppNotification(row: Notification): Promise<AppNotification> {
  let actor: PublicUser | null = null;
  if (row.actorId) {
    const u = await prisma.user.findUnique({
      where: { id: row.actorId },
      select: PUBLIC_USER_SELECT,
    });
    if (u) actor = toPublicUser(u);
  }
  return buildNotification(row, actor);
}

/** Пакетный маппинг списка уведомлений — один findMany за всеми акторами. */
export async function toAppNotifications(rows: Notification[]): Promise<AppNotification[]> {
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: PUBLIC_USER_SELECT })
    : [];
  const byId = new Map(actors.map((a) => [a.id, toPublicUser(a)]));
  return rows.map((r) => buildNotification(r, r.actorId ? byId.get(r.actorId) ?? null : null));
}
