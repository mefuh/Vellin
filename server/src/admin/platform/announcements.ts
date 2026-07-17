import type { Announcement } from '@prisma/client';
import type {
  AnnouncementAudience,
  AnnouncementDTO,
  AnnouncementKind,
  AnnouncementStyle,
  RuntimeAnnouncement,
  UpsertAnnouncementRequest,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { resolveAdminIdentity } from '../rbac/roles.js';

const NEW_USER_DAYS = 7;

function parseAudience(json: string): AnnouncementAudience {
  try {
    const a = JSON.parse(json) as AnnouncementAudience;
    if (a && (a.kind === 'all' || a.kind === 'role' || a.kind === 'new-users')) return a;
  } catch { /* ignore */ }
  return { kind: 'all' };
}

export function toAnnouncementDTO(r: Announcement): AnnouncementDTO {
  return {
    id: r.id,
    kind: r.kind as AnnouncementKind,
    title: r.title,
    body: r.body,
    ctaLabel: r.ctaLabel,
    ctaUrl: r.ctaUrl,
    style: r.style as AnnouncementStyle,
    audience: parseAudience(r.audienceJson),
    active: r.active,
    startsAt: r.startsAt ? r.startsAt.toISOString() : null,
    endsAt: r.endsAt ? r.endsAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listAnnouncements(): Promise<AnnouncementDTO[]> {
  const rows = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toAnnouncementDTO);
}

function dataFromRequest(body: UpsertAnnouncementRequest, createdById?: string) {
  return {
    kind: body.kind,
    title: body.title,
    body: body.body,
    ctaLabel: body.ctaLabel ?? null,
    ctaUrl: body.ctaUrl ?? null,
    style: body.style ?? 'info',
    audienceJson: JSON.stringify(body.audience ?? { kind: 'all' }),
    active: body.active ?? false,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    ...(createdById ? { createdById } : {}),
  };
}

export async function createAnnouncement(body: UpsertAnnouncementRequest, createdById: string): Promise<AnnouncementDTO> {
  const row = await prisma.announcement.create({ data: dataFromRequest(body, createdById) });
  return toAnnouncementDTO(row);
}

export async function updateAnnouncement(id: string, body: UpsertAnnouncementRequest): Promise<AnnouncementDTO | null> {
  try {
    const row = await prisma.announcement.update({ where: { id }, data: dataFromRequest(body) });
    return toAnnouncementDTO(row);
  } catch {
    return null;
  }
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  const res = await prisma.announcement.deleteMany({ where: { id } });
  return res.count > 0;
}

/**
 * Активные объявления для конкретного зрителя (публичный runtime). Фильтрует по
 * временному окну и аудитории. Тяжёлые проверки (роль/возраст аккаунта) делаются
 * лишь при наличии таких объявлений и только для авторизованных.
 */
export async function activeRuntimeAnnouncements(userId: string | null): Promise<RuntimeAnnouncement[]> {
  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const needsRole = rows.some((r) => parseAudience(r.audienceJson).kind === 'role');
  const needsNewUser = rows.some((r) => parseAudience(r.audienceJson).kind === 'new-users');
  let roleKey: string | null = null;
  let isNewUser = false;
  if (userId && (needsRole || needsNewUser)) {
    const [identity, user] = await Promise.all([
      needsRole ? resolveAdminIdentity(userId) : Promise.resolve(null),
      needsNewUser ? prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }) : Promise.resolve(null),
    ]);
    roleKey = identity?.role?.key ?? null;
    if (user) isNewUser = now.getTime() - user.createdAt.getTime() < NEW_USER_DAYS * 86400_000;
  }

  return rows
    .filter((r) => {
      const aud = parseAudience(r.audienceJson);
      if (aud.kind === 'all') return true;
      if (aud.kind === 'role') return !!roleKey && aud.role === roleKey;
      if (aud.kind === 'new-users') return isNewUser;
      return false;
    })
    .map((r) => ({
      id: r.id,
      kind: r.kind as AnnouncementKind,
      title: r.title,
      body: r.body,
      ctaLabel: r.ctaLabel,
      ctaUrl: r.ctaUrl,
      style: r.style as AnnouncementStyle,
    }));
}
