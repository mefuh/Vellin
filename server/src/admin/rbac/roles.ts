import type { AdminRole } from '@prisma/client';
import type { AdminPermission, AdminRoleDTO } from '@vellin/shared';
import {
  ADMIN_PERMISSIONS,
  SYSTEM_ROLE_DEFS,
  type SystemRoleKey,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { isAdminEmail, loadEnv } from '../../env.js';
import { logger } from '../../utils/logger.js';

const ALL_PERMISSIONS = new Set<string>(ADMIN_PERMISSIONS);

/** Парсит хранимый permissionsJson в чистый набор известных пермишенов. */
export function parsePermissions(json: string): AdminPermission[] {
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((p): p is AdminPermission => typeof p === 'string' && ALL_PERMISSIONS.has(p));
  } catch {
    return [];
  }
}

/**
 * Эффективные права роли. super_admin всегда получает ВЕСЬ каталог (в т.ч.
 * будущие права), поэтому его хранимый набор игнорируется — это исключает
 * само-локаут при добавлении новых пермишенов.
 */
export function effectivePermissions(role: Pick<AdminRole, 'key' | 'permissionsJson'>): AdminPermission[] {
  if (role.key === 'super_admin') return [...ADMIN_PERMISSIONS];
  return parsePermissions(role.permissionsJson);
}

export function isSuperAdminRole(role: Pick<AdminRole, 'key'> | null | undefined): boolean {
  return role?.key === 'super_admin';
}

export function toRoleDTO(role: AdminRole, memberCount: number): AdminRoleDTO {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    permissions: effectivePermissions(role),
    isSystem: role.isSystem,
    memberCount,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

export interface AdminIdentity {
  role: AdminRole | null;
  permissions: AdminPermission[];
  isSuperAdmin: boolean;
}

/**
 * Права конкретного пользователя. Null-роль → пустой набор (нет доступа).
 * Break-glass: пользователь с email === ADMIN_EMAIL, у которого роль ещё не
 * назначена (до бутстрапа на старте), трактуется как super_admin и роль
 * назначается best-effort — платформа не может остаться без владельца.
 */
export async function resolveAdminIdentity(userId: string): Promise<AdminIdentity> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, adminRole: true },
  });
  let role = user?.adminRole ?? null;
  if (!role && user && isAdminEmail(user.email)) {
    role = await prisma.adminRole.findUnique({ where: { key: 'super_admin' } });
    if (role) {
      const roleId = role.id;
      void prisma.user
        .update({ where: { id: userId }, data: { adminRoleId: roleId } })
        .catch((err: unknown) => logger.warn({ err, userId }, 'rbac: break-glass assign failed'));
    }
  }
  if (!role) return { role: null, permissions: [], isSuperAdmin: false };
  return {
    role,
    permissions: effectivePermissions(role),
    isSuperAdmin: isSuperAdminRole(role),
  };
}

/**
 * Идемпотентно создаёт/обновляет системные роли и бутстрапит ADMIN_EMAIL в
 * super_admin. Запускается на старте приложения. Не трогает пользовательские
 * (custom) роли и не понижает уже назначенные роли, кроме апдейта дефолтных прав
 * системных ролей (super_admin всё равно вычисляется динамически).
 */
export async function seedRolesAndBootstrapAdmin(): Promise<void> {
  const keys = Object.keys(SYSTEM_ROLE_DEFS) as SystemRoleKey[];
  for (const key of keys) {
    const def = SYSTEM_ROLE_DEFS[key];
    await prisma.adminRole.upsert({
      where: { key },
      create: {
        key,
        name: def.name,
        description: def.description,
        permissionsJson: JSON.stringify(def.permissions),
        isSystem: true,
      },
      // При обновлении держим имя/описание/системность синхронными с кодом, но
      // НЕ перетираем permissionsJson (админ мог отредактировать не-super роли).
      update: { name: def.name, description: def.description, isSystem: true },
    });
  }

  const adminEmail = loadEnv().ADMIN_EMAIL;
  if (!adminEmail) return;
  const superRole = await prisma.adminRole.findUnique({ where: { key: 'super_admin' } });
  if (!superRole) return;

  const user = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, adminRoleId: true },
  });
  if (!user) {
    logger.warn({ adminEmail }, 'rbac: ADMIN_EMAIL пользователь ещё не зарегистрирован — бутстрап отложен');
    return;
  }
  if (user.adminRoleId !== superRole.id) {
    await prisma.user.update({ where: { id: user.id }, data: { adminRoleId: superRole.id } });
    logger.info({ adminEmail }, 'rbac: ADMIN_EMAIL повышен до super_admin');
  }
}

/**
 * Гарантирует наличие хотя бы одного super_admin. Вызывается при снятии роли,
 * чтобы не оставить платформу без владельца. Возвращает true, если операция
 * безопасна (останется ≥1 super_admin).
 */
export async function wouldLeaveSuperAdmins(excludingUserId: string): Promise<boolean> {
  const superRole = await prisma.adminRole.findUnique({ where: { key: 'super_admin' }, select: { id: true } });
  if (!superRole) return false;
  const count = await prisma.user.count({
    where: { adminRoleId: superRole.id, id: { not: excludingUserId } },
  });
  return count > 0;
}
