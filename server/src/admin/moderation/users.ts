import type {
  AdminPushDevice,
  AdminSharedWatchPeer,
  AdminUserFullResponse,
  AdminUserProfile,
  AdminUserProfilePatch,
  AdminUserSession,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { PUBLIC_USER_SELECT } from '../../friends/mappers.js';
import { getAcceptedFriendIds } from '../../friends/service.js';
import { getFavorites } from '../../titles/service.js';
import { parseUserAgent, forgetTouch } from '../../auth/sessions.js';
import { listUserAuditHistory } from '../audit/audit.js';

function toProfile(u: {
  id: string; publicId: string; email: string; username: string; avatarSeed: string;
  avatarUrl: string | null; bio: string | null; gender: string | null; birthDate: Date | null;
  city: string | null; createdAt: Date; lastSeenAt: Date | null; isBlocked: boolean;
  blockedAt: Date | null; blockReason: string | null; adminRole: { name: string } | null;
}): AdminUserProfile {
  return {
    id: u.id,
    publicId: u.publicId,
    email: u.email,
    username: u.username,
    avatarSeed: u.avatarSeed,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    gender: u.gender,
    birthDate: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : null,
    city: u.city,
    createdAt: u.createdAt.toISOString(),
    lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
    isBlocked: u.isBlocked,
    blockedAt: u.blockedAt ? u.blockedAt.toISOString() : null,
    blockReason: u.blockReason,
    roleName: u.adminRole?.name ?? null,
  };
}

function sessionRowToDTO(s: {
  id: string; userAgent: string | null; ip: string | null; createdAt: Date; lastSeenAt: Date;
}): AdminUserSession {
  const parsed = parseUserAgent(s.userAgent);
  return {
    id: s.id,
    deviceLabel: parsed.deviceLabel,
    browser: parsed.browser,
    os: parsed.os,
    ip: s.ip,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
  };
}

/** Список сессий/устройств пользователя (по убыванию активности). */
export async function listUserSessions(userId: string): Promise<AdminUserSession[]> {
  const rows = await prisma.session.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } });
  return rows.map(sessionRowToDTO);
}

/**
 * Полный профиль-360: агрегирует данные из существующих таблиц. Все секции
 * ограничены разумными лимитами (профиль — не выгрузка).
 */
export async function getUserFull(userId: string): Promise<AdminUserFullResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { adminRole: { select: { name: true } } },
  });
  if (!user) return null;

  const friendIds = await getAcceptedFriendIds(userId);
  const [
    friendUsers,
    sharedRows,
    favorites,
    rooms,
    recentMessages,
    sessions,
    pushRows,
    roomsOwned,
    messagesSent,
    dmSent,
    devicesCount,
    pushCount,
    history,
  ] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: friendIds.slice(0, 24) } }, select: PUBLIC_USER_SELECT }),
    prisma.sharedWatchStat.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { totalSeconds: 'desc' },
      take: 8,
    }),
    getFavorites(userId),
    prisma.room.findMany({
      where: { ownerId: userId },
      select: { id: true, slug: true, name: true, isPrivate: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.message.findMany({
      where: { userId },
      select: { id: true, body: true, createdAt: true, room: { select: { slug: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.session.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } }),
    prisma.pushSubscription.findMany({ where: { userId }, orderBy: { lastUsedAt: 'desc' } }),
    prisma.room.count({ where: { ownerId: userId } }),
    prisma.message.count({ where: { userId } }),
    prisma.directMessage.count({ where: { senderId: userId } }),
    prisma.session.count({ where: { userId } }),
    prisma.pushSubscription.count({ where: { userId } }),
    listUserAuditHistory(userId, 20),
  ]);

  // Совместное время: резолвим партнёров одним запросом.
  const peerIds = sharedRows.map((r) => (r.userAId === userId ? r.userBId : r.userAId));
  const peers = await prisma.user.findMany({ where: { id: { in: peerIds } }, select: PUBLIC_USER_SELECT });
  const peerMap = new Map(peers.map((p) => [p.id, p]));
  const sharedWatch: AdminSharedWatchPeer[] = sharedRows.flatMap((r) => {
    const pid = r.userAId === userId ? r.userBId : r.userAId;
    const peer = peerMap.get(pid);
    if (!peer) return [];
    return [{
      peer: { id: peer.id, publicId: peer.publicId, username: peer.username, avatarSeed: peer.avatarSeed, avatarUrl: peer.avatarUrl ?? null },
      totalSeconds: r.totalSeconds,
      sessionsCount: r.sessionsCount,
      longestSessionSeconds: r.longestSessionSeconds,
      lastWatchedAt: r.lastWatchedAt ? r.lastWatchedAt.toISOString() : null,
    }];
  });

  const pushDevices: AdminPushDevice[] = pushRows.map((p) => ({
    id: p.id,
    browser: p.browser,
    os: p.os,
    deviceLabel: p.deviceLabel,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    lastUsedAt: p.lastUsedAt.toISOString(),
  }));

  return {
    user: toProfile(user),
    stats: {
      friends: friendIds.length,
      roomsOwned,
      messagesSent,
      dmSent,
      devices: devicesCount,
      pushDevices: pushCount,
    },
    friends: friendUsers.map((f) => ({
      id: f.id,
      publicId: f.publicId,
      username: f.username,
      avatarSeed: f.avatarSeed,
      avatarUrl: f.avatarUrl ?? null,
    })),
    friendsTotal: friendIds.length,
    sharedWatch,
    favorites: favorites.map((f) => ({
      kpId: f.kpId,
      title: f.title,
      year: f.year ?? null,
      posterUrl: f.posterUrl ?? null,
      ratingKp: f.ratingKp ?? null,
    })),
    rooms: rooms.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      isPrivate: r.isPrivate,
      createdAt: r.createdAt.toISOString(),
    })),
    recentMessages: recentMessages.map((m) => ({
      id: m.id,
      roomSlug: m.room.slug,
      roomName: m.room.name,
      body: m.body.slice(0, 160),
      createdAt: m.createdAt.toISOString(),
    })),
    sessions: sessions.map(sessionRowToDTO),
    pushDevices,
    history,
  };
}

/** Завершает одну сессию пользователя. Возвращает true, если строка была удалена. */
export async function revokeUserSession(userId: string, sid: string): Promise<boolean> {
  const res = await prisma.session.deleteMany({ where: { id: sid, userId } });
  if (res.count > 0) forgetTouch(sid);
  return res.count > 0;
}

/**
 * Завершает все сессии пользователя (как «выйти со всех устройств»). Живые
 * комнатные WS работают на отдельном тикете и отвалятся при следующем
 * реконнекте/REST-запросе — форсировать их закрытие здесь не нужно.
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const sessions = await prisma.session.findMany({ where: { userId }, select: { id: true } });
  const res = await prisma.session.deleteMany({ where: { userId } });
  sessions.forEach((s) => forgetTouch(s.id));
  return res.count;
}

/** Отключает push пользователю (главный выключатель). Идемпотентно. */
export async function disableUserPush(userId: string): Promise<void> {
  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, pushEnabled: false },
    update: { pushEnabled: false },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = new Set(['male', 'female', 'other']);

export type UpdateProfileResult =
  | { ok: true; user: AdminUserProfile }
  | { ok: false; reason: 'not_found' | 'email_invalid' | 'email_taken' | 'birthDate_invalid' };

/**
 * Редактирование администратором полей профиля: email, город, пол, дата
 * рождения. Отправляются только изменяемые ключи; `null` очищает поле. Email
 * проверяется на формат и уникальность. Возвращает обновлённый профиль или
 * причину отказа (для аккуратного ответа роутом).
 */
export async function updateUserProfile(userId: string, patch: AdminUserProfilePatch): Promise<UpdateProfileResult> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) return { ok: false, reason: 'not_found' };

  const data: {
    email?: string; city?: string | null; gender?: string | null; birthDate?: Date | null;
  } = {};

  if (patch.email !== undefined) {
    // Регистрация хранит email как есть (без нижнего регистра) — сохраняем ту же
    // семантику, иначе проверка уникальности и вход пользователя рассинхронятся.
    const email = String(patch.email).trim();
    if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, reason: 'email_invalid' };
    const taken = await prisma.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
    if (taken) return { ok: false, reason: 'email_taken' };
    data.email = email;
  }
  if (patch.city !== undefined) {
    const city = patch.city === null ? null : String(patch.city).trim().slice(0, 80);
    data.city = city ? city : null;
  }
  if (patch.gender !== undefined) {
    data.gender = patch.gender && GENDERS.has(patch.gender) ? patch.gender : null;
  }
  if (patch.birthDate !== undefined) {
    if (patch.birthDate === null || patch.birthDate === '') {
      data.birthDate = null;
    } else {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(patch.birthDate));
      if (!m) return { ok: false, reason: 'birthDate_invalid' };
      const d = new Date(`${patch.birthDate}T00:00:00.000Z`);
      const year = Number(m[1]);
      if (Number.isNaN(d.getTime()) || year < 1900 || d.getTime() > Date.now()) {
        return { ok: false, reason: 'birthDate_invalid' };
      }
      data.birthDate = d;
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    include: { adminRole: { select: { name: true } } },
  });
  return { ok: true, user: toProfile(updated) };
}

/** Сброс аватара (возврат к градиенту по seed). */
export async function resetUserAvatar(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
}

/** Очистка «О себе». */
export async function resetUserBio(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { bio: null } });
}

/** Удаление всех любимых фильмов пользователя. */
export async function resetUserFavorites(userId: string): Promise<number> {
  const res = await prisma.favoriteTitle.deleteMany({ where: { userId } });
  return res.count;
}
