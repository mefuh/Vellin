import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ADMIN_PERMISSIONS,
  type AdminMeResponse,
  type AdminRoleListResponse,
  type AdminRoleResponse,
  type AdminStaffListResponse,
  type AdminStaffMember,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { requireAdminAccess, requirePermission } from './middleware.js';
import { toRoleDTO, effectivePermissions, wouldLeaveSuperAdmins } from './roles.js';
import { writeAudit } from '../audit/audit.js';

const permsSchema = z.array(z.enum(ADMIN_PERMISSIONS as unknown as [string, ...string[]]));

const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
  permissions: permsSchema.default([]),
});

const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.union([z.string().trim().max(300), z.null()]).optional(),
    permissions: permsSchema.optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: 'At least one field required' });

const assignSchema = z.object({ roleId: z.union([z.string(), z.null()]) });

async function roleWithCount(roleId: string) {
  const role = await prisma.adminRole.findUnique({ where: { id: roleId } });
  if (!role) return null;
  const memberCount = await prisma.user.count({ where: { adminRoleId: role.id } });
  return toRoleDTO(role, memberCount);
}

function slugifyRoleKey(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `custom-${base || 'role'}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * RBAC-роуты админ-панели: self-профиль доступа, CRUD ролей и назначение ролей
 * сотрудникам. Отдельный плагин-контекст (собственный preHandler). Управление
 * ролями — только за roles.manage; /admin/me доступен любому сотруднику.
 */
export async function adminRbacRoutes(app: FastifyInstance): Promise<void> {
  // ── Self ────────────────────────────────────────────────────────────────
  app.get('/admin/me', { preHandler: requireAdminAccess }, async (req, reply) => {
    const identity = req.adminIdentity!;
    const principal = req.principal!;
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { email: true, username: true },
    });
    const memberCount = identity.role
      ? await prisma.user.count({ where: { adminRoleId: identity.role.id } })
      : 0;
    reply.send({
      userId: principal.userId,
      username: user?.username ?? principal.username,
      email: user?.email ?? '',
      role: identity.role ? toRoleDTO(identity.role, memberCount) : null,
      permissions: identity.permissions,
      isSuperAdmin: identity.isSuperAdmin,
    } satisfies AdminMeResponse);
  });

  // ── Roles ────────────────────────────────────────────────────────────────
  app.get('/admin/roles', { preHandler: requirePermission('roles.manage') }, async (_req, reply) => {
    const roles = await prisma.adminRole.findMany({ orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }] });
    const counts = await prisma.user.groupBy({ by: ['adminRoleId'], _count: { _all: true } });
    const countMap = new Map(counts.map((c) => [c.adminRoleId, c._count._all]));
    reply.send({
      roles: roles.map((r) => toRoleDTO(r, countMap.get(r.id) ?? 0)),
    } satisfies AdminRoleListResponse);
  });

  app.post('/admin/roles', { preHandler: requirePermission('roles.manage') }, async (req, reply) => {
    const body = createRoleSchema.parse(req.body);
    const role = await prisma.adminRole.create({
      data: {
        key: slugifyRoleKey(body.name),
        name: body.name,
        description: body.description ?? null,
        permissionsJson: JSON.stringify(body.permissions),
        isSystem: false,
      },
    });
    await writeAudit(req, 'role.create', { type: 'role', id: role.id, label: role.name }, {
      after: { name: role.name, permissions: body.permissions },
    });
    reply.send({ role: toRoleDTO(role, 0) } satisfies AdminRoleResponse);
  });

  app.patch<{ Params: { id: string } }>(
    '/admin/roles/:id',
    { preHandler: requirePermission('roles.manage') },
    async (req, reply) => {
      const body = updateRoleSchema.parse(req.body);
      const existing = await prisma.adminRole.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        reply.code(404).send({ error: 'NotFound', message: 'Роль не найдена', statusCode: 404 });
        return;
      }
      // super_admin неизменяем (права всегда полные, имя фиксировано).
      if (existing.key === 'super_admin') {
        reply.code(400).send({ error: 'BadRequest', message: 'Роль Super Admin нельзя изменять', statusCode: 400 });
        return;
      }
      const before = { name: existing.name, permissions: effectivePermissions(existing) };
      const updated = await prisma.adminRole.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.permissions !== undefined ? { permissionsJson: JSON.stringify(body.permissions) } : {}),
        },
      });
      await writeAudit(req, 'role.update', { type: 'role', id: updated.id, label: updated.name }, {
        before,
        after: { name: updated.name, permissions: effectivePermissions(updated) },
      });
      reply.send({ role: (await roleWithCount(updated.id))! } satisfies AdminRoleResponse);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/admin/roles/:id',
    { preHandler: requirePermission('roles.manage') },
    async (req, reply) => {
      const existing = await prisma.adminRole.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        reply.code(404).send({ error: 'NotFound', message: 'Роль не найдена', statusCode: 404 });
        return;
      }
      if (existing.isSystem) {
        reply.code(400).send({ error: 'BadRequest', message: 'Системную роль нельзя удалить', statusCode: 400 });
        return;
      }
      // onDelete: SetNull снимет adminRoleId у носителей — они теряют доступ.
      await prisma.adminRole.delete({ where: { id: existing.id } });
      await writeAudit(req, 'role.delete', { type: 'role', id: existing.id, label: existing.name });
      reply.code(204).send();
    },
  );

  // ── Staff (носители ролей) ────────────────────────────────────────────────
  app.get('/admin/staff', { preHandler: requirePermission('roles.manage') }, async (_req, reply) => {
    const rows = await prisma.user.findMany({
      where: { adminRoleId: { not: null } },
      select: {
        id: true,
        publicId: true,
        username: true,
        email: true,
        avatarSeed: true,
        avatarUrl: true,
        adminRole: { select: { id: true, key: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const staff: AdminStaffMember[] = rows.map((u) => ({
      id: u.id,
      publicId: u.publicId,
      username: u.username,
      email: u.email,
      avatarSeed: u.avatarSeed,
      avatarUrl: u.avatarUrl,
      roleId: u.adminRole?.id ?? null,
      roleKey: u.adminRole?.key ?? null,
      roleName: u.adminRole?.name ?? null,
    }));
    reply.send({ staff } satisfies AdminStaffListResponse);
  });

  app.post<{ Params: { userId: string } }>(
    '/admin/staff/:userId/role',
    { preHandler: requirePermission('roles.manage') },
    async (req, reply) => {
      const { roleId } = assignSchema.parse(req.body);
      const target = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true, username: true, adminRole: { select: { id: true, key: true, name: true } } },
      });
      if (!target) {
        reply.code(404).send({ error: 'NotFound', message: 'Пользователь не найден', statusCode: 404 });
        return;
      }
      // Защита от само-локаута: снятие/смена роли последнего super_admin запрещены.
      if (target.adminRole?.key === 'super_admin') {
        const willChange = roleId !== target.adminRole.id;
        if (willChange && !(await wouldLeaveSuperAdmins(target.id))) {
          reply.code(400).send({
            error: 'BadRequest',
            message: 'Нельзя снять роль у последнего Super Admin',
            statusCode: 400,
          });
          return;
        }
      }
      let newRole: { id: string; name: string } | null = null;
      if (roleId !== null) {
        const role = await prisma.adminRole.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
        if (!role) {
          reply.code(404).send({ error: 'NotFound', message: 'Роль не найдена', statusCode: 404 });
          return;
        }
        newRole = role;
      }
      await prisma.user.update({ where: { id: target.id }, data: { adminRoleId: roleId } });
      await writeAudit(req, 'staff.assign_role', { type: 'user', id: target.id, label: target.username }, {
        before: { role: target.adminRole?.name ?? null },
        after: { role: newRole?.name ?? null },
      });
      reply.code(204).send();
    },
  );
}
