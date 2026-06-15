import type { Friendship } from '@prisma/client';
import type {
  AppNotification,
  FriendPresence,
  FriendRequest,
  FriendUser,
  Gender,
  PublicProfile,
  Relationship,
} from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { userHub } from '../realtime/UserHub.js';
import { createAndPush, pushFriendsChanged, removeNotifications } from '../realtime/notify.js';
import { PUBLIC_USER_SELECT, toAppNotifications, toPublicUser } from './mappers.js';
import { getFavorites } from '../titles/service.js';

/** Бизнес-ошибка с HTTP-кодом — глобальный errorHandler форматирует по statusCode. */
export class FriendError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'FriendError';
  }
}

const PROFILE_SELECT = {
  ...PUBLIC_USER_SELECT,
  bio: true,
  gender: true,
  birthDate: true,
  city: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

/**
 * «Был в сети» для DTO: онлайн → null; иначе берём свежее из presence хаба, а
 * если хаб не знает (после рестарта) — фолбэк на сохранённое в БД.
 */
function lastSeenIso(presence: FriendPresence, dbLastSeen?: Date | null): string | null {
  if (presence.online) return null;
  return presence.lastSeenAt ?? (dbLastSeen ? dbLastSeen.toISOString() : null);
}

/** Общие профильные поля (пол/дата рождения/город) для DTO `PublicProfile`. */
function profileExtras(u: { gender: string | null; birthDate: Date | null; city: string | null }): {
  gender: Gender | null;
  birthDate: string | null;
  city: string | null;
} {
  return {
    gender: (u.gender as Gender | null) ?? null,
    birthDate: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : null,
    city: u.city ?? null,
  };
}

// ── Внутренние помощники ────────────────────────────────────────────────

/** Дружба/заявка между двумя пользователями в любом направлении. */
function findFriendship(a: string, b: string): Promise<Friendship | null> {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
}

/** Есть ли блокировка в любом направлении между a и b. */
async function blockBetween(a: string, b: string): Promise<{ aBlockedB: boolean; bBlockedA: boolean }> {
  const rows = await prisma.block.findMany({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { blockerId: true },
  });
  return {
    aBlockedB: rows.some((r) => r.blockerId === a),
    bBlockedA: rows.some((r) => r.blockerId === b),
  };
}

function relationshipFrom(
  viewerId: string,
  targetId: string,
  friendship: Friendship | null,
  viewerBlockedTarget: boolean,
): { relationship: Relationship; friendshipId: string | null } {
  if (viewerId === targetId) return { relationship: 'self', friendshipId: null };
  if (viewerBlockedTarget) return { relationship: 'blocked', friendshipId: null };
  if (!friendship) return { relationship: 'none', friendshipId: null };
  if (friendship.status === 'accepted') return { relationship: 'friends', friendshipId: friendship.id };
  // pending
  if (friendship.requesterId === viewerId) return { relationship: 'outgoing', friendshipId: friendship.id };
  return { relationship: 'incoming', friendshipId: friendship.id };
}

// ── Presence-резолвер (для UserHub) ─────────────────────────────────────

/** id всех принятых друзей пользователя. */
export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

// ── Списки ──────────────────────────────────────────────────────────────

export async function listFriends(userId: string): Promise<FriendUser[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: {
      requester: { select: PUBLIC_USER_SELECT },
      addressee: { select: PUBLIC_USER_SELECT },
    },
    orderBy: { respondedAt: 'desc' },
  });
  return rows.map((r) => {
    const other = r.requesterId === userId ? r.addressee : r.requester;
    const presence = userHub.presenceOf(other.id);
    return {
      ...toPublicUser(other),
      friendshipId: r.id,
      online: presence.online,
      currentRoom: presence.currentRoom,
      lastSeenAt: lastSeenIso(presence),
    };
  });
}

export async function listRequests(userId: string): Promise<FriendRequest[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: 'pending',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: {
      requester: { select: PUBLIC_USER_SELECT },
      addressee: { select: PUBLIC_USER_SELECT },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => {
    const incoming = r.addresseeId === userId;
    const other = incoming ? r.requester : r.addressee;
    return {
      id: r.id,
      direction: incoming ? 'incoming' : 'outgoing',
      user: toPublicUser(other),
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function getFriendPresenceSnapshot(userId: string): Promise<FriendPresence[]> {
  const ids = await getAcceptedFriendIds(userId);
  return ids.map((id) => userHub.presenceOf(id));
}

// ── Заявки ──────────────────────────────────────────────────────────────

export async function sendRequest(
  requesterId: string,
  target: { username?: string; userId?: string },
): Promise<{ request: FriendRequest; autoAccepted: boolean }> {
  const targetUser = target.userId
    ? await prisma.user.findUnique({ where: { id: target.userId }, select: { ...PUBLIC_USER_SELECT } })
    : target.username
      ? await prisma.user.findUnique({ where: { username: target.username }, select: { ...PUBLIC_USER_SELECT } })
      : null;
  if (!targetUser) throw new FriendError(404, 'Пользователь не найден');
  if (targetUser.id === requesterId) throw new FriendError(400, 'Нельзя добавить самого себя');

  const blocks = await blockBetween(requesterId, targetUser.id);
  if (blocks.aBlockedB) throw new FriendError(409, 'Вы заблокировали этого пользователя');
  if (blocks.bBlockedA) throw new FriendError(403, 'Пользователь недоступен');

  const existing = await findFriendship(requesterId, targetUser.id);
  if (existing) {
    if (existing.status === 'accepted') throw new FriendError(409, 'Вы уже друзья');
    if (existing.requesterId === requesterId) throw new FriendError(409, 'Заявка уже отправлена');
    // Встречная заявка существует — сразу принимаем.
    const accepted = await prisma.friendship.update({
      where: { id: existing.id },
      data: { status: 'accepted', respondedAt: new Date() },
    });
    await createAndPush(existing.requesterId, 'friend_accepted', requesterId, {});
    // Встречную заявку (она у нас, отправителя) приняли самим фактом отправки —
    // убираем её уведомление «… хочет добавить вас в друзья».
    await removeNotifications(requesterId, { type: 'friend_request', actorId: existing.requesterId });
    pushFriendsChanged(existing.requesterId);
    pushFriendsChanged(requesterId);
    return {
      request: {
        id: accepted.id,
        direction: 'outgoing',
        user: toPublicUser(targetUser),
        createdAt: accepted.createdAt.toISOString(),
      },
      autoAccepted: true,
    };
  }

  const created = await prisma.friendship.create({
    data: { requesterId, addresseeId: targetUser.id, status: 'pending' },
  });
  await createAndPush(targetUser.id, 'friend_request', requesterId, {});
  pushFriendsChanged(targetUser.id);
  pushFriendsChanged(requesterId);
  return {
    request: {
      id: created.id,
      direction: 'outgoing',
      user: toPublicUser(targetUser),
      createdAt: created.createdAt.toISOString(),
    },
    autoAccepted: false,
  };
}

export async function respondRequest(
  userId: string,
  friendshipId: string,
  accept: boolean,
): Promise<'accepted' | 'declined'> {
  const fr = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!fr || fr.addresseeId !== userId || fr.status !== 'pending') {
    throw new FriendError(404, 'Заявка не найдена');
  }
  if (accept) {
    await prisma.friendship.update({
      where: { id: fr.id },
      data: { status: 'accepted', respondedAt: new Date() },
    });
    await createAndPush(fr.requesterId, 'friend_accepted', userId, {});
    // Заявка отыграна — убираем уведомление «… хочет добавить вас в друзья».
    await removeNotifications(userId, { type: 'friend_request', actorId: fr.requesterId });
    pushFriendsChanged(fr.requesterId);
    pushFriendsChanged(userId);
    return 'accepted';
  }
  await prisma.friendship.delete({ where: { id: fr.id } });
  await removeNotifications(userId, { type: 'friend_request', actorId: fr.requesterId });
  pushFriendsChanged(fr.requesterId);
  pushFriendsChanged(userId);
  return 'declined';
}

export async function removeFriend(userId: string, otherId: string): Promise<void> {
  const fr = await findFriendship(userId, otherId);
  if (!fr) throw new FriendError(404, 'Дружба не найдена');
  await prisma.friendship.delete({ where: { id: fr.id } });
  // Отмена ещё не принятой заявки — у адресата висит «… хочет добавить вас в
  // друзья», убираем его.
  if (fr.status === 'pending') {
    await removeNotifications(fr.addresseeId, { type: 'friend_request', actorId: fr.requesterId });
  }
  pushFriendsChanged(userId);
  pushFriendsChanged(otherId);
}

export async function blockUser(userId: string, otherId: string): Promise<void> {
  if (userId === otherId) throw new FriendError(400, 'Нельзя заблокировать самого себя');
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
  if (!other) throw new FriendError(404, 'Пользователь не найден');
  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: otherId } },
      create: { blockerId: userId, blockedId: otherId },
      update: {},
    }),
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: userId },
        ],
      },
    }),
  ]);
  // Блок рвёт заявки в обе стороны — чистим связанные friend_request-уведомления.
  await removeNotifications(otherId, { type: 'friend_request', actorId: userId });
  await removeNotifications(userId, { type: 'friend_request', actorId: otherId });
  pushFriendsChanged(userId);
  pushFriendsChanged(otherId);
}

export async function unblockUser(userId: string, otherId: string): Promise<void> {
  await prisma.block.deleteMany({ where: { blockerId: userId, blockedId: otherId } });
  pushFriendsChanged(userId);
}

// ── Поиск + публичный профиль ───────────────────────────────────────────

export async function searchUsers(viewerId: string, q: string): Promise<PublicProfile[]> {
  const query = q.trim();
  if (query.length < 1) return [];
  const candidates = await prisma.user.findMany({
    where: {
      username: { contains: query, mode: 'insensitive' },
      id: { not: viewerId },
      isBlocked: false,
      // Не показываем тех, кто заблокировал зрителя.
      blocksMade: { none: { blockedId: viewerId } },
    },
    select: PROFILE_SELECT,
    take: 20,
    orderBy: { username: 'asc' },
  });
  if (candidates.length === 0) return [];

  const ids = candidates.map((c) => c.id);
  const [friendships, myBlocks] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: viewerId, addresseeId: { in: ids } },
          { addresseeId: viewerId, requesterId: { in: ids } },
        ],
      },
    }),
    prisma.block.findMany({
      where: { blockerId: viewerId, blockedId: { in: ids } },
      select: { blockedId: true },
    }),
  ]);
  const frByOther = new Map<string, Friendship>();
  for (const f of friendships) {
    const other = f.requesterId === viewerId ? f.addresseeId : f.requesterId;
    frByOther.set(other, f);
  }
  const blockedSet = new Set(myBlocks.map((b) => b.blockedId));

  return candidates.map((c) => {
    const rel = relationshipFrom(viewerId, c.id, frByOther.get(c.id) ?? null, blockedSet.has(c.id));
    const presence = userHub.presenceOf(c.id);
    return {
      ...toPublicUser(c),
      bio: c.bio ?? null,
      ...profileExtras(c),
      createdAt: c.createdAt.toISOString(),
      online: presence.online,
      currentRoom: presence.currentRoom,
      lastSeenAt: lastSeenIso(presence, c.lastSeenAt),
      relationship: rel.relationship,
      friendshipId: rel.friendshipId,
    };
  });
}

export async function getPublicProfile(viewerId: string, username: string): Promise<PublicProfile> {
  const user = await prisma.user.findUnique({ where: { username }, select: { ...PROFILE_SELECT, isBlocked: true } });
  if (!user || user.isBlocked) throw new FriendError(404, 'Пользователь не найден');

  const favoriteTitles = await getFavorites(user.id);

  if (user.id !== viewerId) {
    const blocks = await blockBetween(viewerId, user.id);
    // Если цель заблокировала зрителя — скрываем профиль целиком.
    if (blocks.bBlockedA) throw new FriendError(404, 'Пользователь не найден');
    const fr = await findFriendship(viewerId, user.id);
    const rel = relationshipFrom(viewerId, user.id, fr, blocks.aBlockedB);
    const presence = userHub.presenceOf(user.id);
    return {
      ...toPublicUser(user),
      bio: user.bio ?? null,
      ...profileExtras(user),
      createdAt: user.createdAt.toISOString(),
      online: presence.online,
      currentRoom: presence.currentRoom,
      lastSeenAt: lastSeenIso(presence, user.lastSeenAt),
      favoriteTitles,
      relationship: rel.relationship,
      friendshipId: rel.friendshipId,
    };
  }
  const presence = userHub.presenceOf(user.id);
  return {
    ...toPublicUser(user),
    bio: user.bio ?? null,
    ...profileExtras(user),
    createdAt: user.createdAt.toISOString(),
    online: presence.online,
    currentRoom: presence.currentRoom,
    lastSeenAt: lastSeenIso(presence, user.lastSeenAt),
    favoriteTitles,
    relationship: 'self',
    friendshipId: null,
  };
}

/** Проверка, что otherId — принятый друг userId (для приглашения в комнату). */
export async function areFriends(userId: string, otherId: string): Promise<boolean> {
  const fr = await findFriendship(userId, otherId);
  return !!fr && fr.status === 'accepted';
}

// ── Уведомления ─────────────────────────────────────────────────────────

export async function getNotificationsSnapshot(
  userId: string,
): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  const notifications = await toAppNotifications(rows);
  return { notifications, unreadCount };
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<number> {
  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  return prisma.notification.count({ where: { userId, readAt: null } });
}
