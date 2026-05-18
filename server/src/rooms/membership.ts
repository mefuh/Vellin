import type { RoomPermissions } from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { serializeMemberPermissions } from './permissions.js';

export type MembershipRole = 'admin' | 'member';

export interface MembershipRecord {
  role: MembershipRole;
  permissionsJson: string;
}

export async function getOrCreateMembership(
  roomId: string,
  userId: string,
): Promise<MembershipRecord> {
  const row = await prisma.membership.upsert({
    where: { userId_roomId: { userId, roomId } },
    create: { roomId, userId, role: 'member', permissionsJson: '{}' },
    update: {},
    select: { role: true, permissionsJson: true },
  });
  return { role: row.role as MembershipRole, permissionsJson: row.permissionsJson };
}

export async function setMembershipRole(
  roomId: string,
  userId: string,
  role: MembershipRole,
): Promise<MembershipRecord> {
  const row = await prisma.membership.upsert({
    where: { userId_roomId: { userId, roomId } },
    create: { roomId, userId, role, permissionsJson: '{}' },
    update: { role },
    select: { role: true, permissionsJson: true },
  });
  return { role: row.role as MembershipRole, permissionsJson: row.permissionsJson };
}

export async function setMembershipPermissions(
  roomId: string,
  userId: string,
  patch: Partial<RoomPermissions>,
): Promise<MembershipRecord> {
  const existing = await prisma.membership.upsert({
    where: { userId_roomId: { userId, roomId } },
    create: { roomId, userId, role: 'member', permissionsJson: '{}' },
    update: {},
    select: { role: true, permissionsJson: true },
  });
  let merged: Partial<RoomPermissions> = {};
  try {
    merged = JSON.parse(existing.permissionsJson || '{}');
  } catch {
    merged = {};
  }
  const next = { ...merged, ...patch };
  const json = serializeMemberPermissions(next);
  const row = await prisma.membership.update({
    where: { userId_roomId: { userId, roomId } },
    data: { permissionsJson: json },
    select: { role: true, permissionsJson: true },
  });
  return { role: row.role as MembershipRole, permissionsJson: row.permissionsJson };
}
