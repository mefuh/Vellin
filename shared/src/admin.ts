// ── Admin RBAC + Audit — единый контракт админ-панели v2 ──────────────────
//
// Single source of truth для набора административных прав. И сервер (проверка
// доступа), и клиент (гейтинг навигации/кнопок) импортируют ОТСЮДА. Добавление
// нового права — правка только этого файла: строку в ADMIN_PERMISSIONS и (если
// нужно) в дефолтные наборы системных ролей ниже.

/** Плоский каталог пермишенов вида `<домен>.<действие>`. */
export const ADMIN_PERMISSIONS = [
  'analytics.view',
  'users.view',
  'users.moderate',
  'users.delete',
  'rooms.view',
  'rooms.manage',
  'rooms.delete',
  'moderation.dm.view',
  'reports.view',
  'reports.handle',
  'push.view',
  'push.send',
  'push.templates',
  'media.manage',
  'system.view',
  'jobs.manage',
  'platform.manage',
  'flags.manage',
  'announcements.manage',
  'roles.manage',
  'audit.view',
  'broadcast.send',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Человекочитаемые названия прав (для UI редактора ролей). */
export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  'analytics.view': 'Аналитика — просмотр',
  'users.view': 'Пользователи — просмотр',
  'users.moderate': 'Пользователи — модерация (блок, сброс, сессии)',
  'users.delete': 'Пользователи — удаление',
  'rooms.view': 'Комнаты — просмотр',
  'rooms.manage': 'Комнаты — управление (правка, закрыть, звонок, вход)',
  'rooms.delete': 'Комнаты — удаление',
  'moderation.dm.view': 'Модерация ЛС — просмотр переписки (чувствительно)',
  'reports.view': 'Жалобы — просмотр очереди',
  'reports.handle': 'Жалобы — решения',
  'push.view': 'Push — дашборд и аналитика',
  'push.send': 'Push — рассылки',
  'push.templates': 'Push — шаблоны',
  'media.manage': 'Медиа-кэш — управление',
  'system.view': 'Система — мониторинг (WS, производительность, health)',
  'jobs.manage': 'Фоновые задачи — управление',
  'platform.manage': 'Платформа — конфигурация и режим обслуживания',
  'flags.manage': 'Feature flags — управление',
  'announcements.manage': 'Объявления — управление',
  'roles.manage': 'Роли и доступ — управление',
  'audit.view': 'Журнал аудита — просмотр',
  'broadcast.send': 'Системное сообщение во все комнаты',
};

/** Группировка прав по доменам — для секций в редакторе ролей. */
export const ADMIN_PERMISSION_GROUPS: { label: string; keys: AdminPermission[] }[] = [
  { label: 'Аналитика', keys: ['analytics.view'] },
  { label: 'Пользователи', keys: ['users.view', 'users.moderate', 'users.delete'] },
  { label: 'Комнаты', keys: ['rooms.view', 'rooms.manage', 'rooms.delete'] },
  { label: 'Модерация', keys: ['moderation.dm.view', 'reports.view', 'reports.handle'] },
  { label: 'Push', keys: ['push.view', 'push.send', 'push.templates', 'broadcast.send'] },
  { label: 'Система', keys: ['system.view', 'jobs.manage', 'media.manage'] },
  { label: 'Платформа', keys: ['platform.manage', 'flags.manage', 'announcements.manage'] },
  { label: 'Доступ', keys: ['roles.manage', 'audit.view'] },
];

/** Стабильные ключи системных ролей. */
export type SystemRoleKey = 'super_admin' | 'administrator' | 'moderator' | 'support' | 'analyst';

/**
 * Дефолтные наборы прав системных ролей. `super_admin` — специальный: имеет ВСЕ
 * права всегда (в т.ч. будущие), поэтому его набор вычисляется как весь каталог.
 * Остальные — редактируемы из UI, здесь лишь стартовый сид.
 */
export const SYSTEM_ROLE_DEFS: Record<
  SystemRoleKey,
  { name: string; description: string; permissions: AdminPermission[] }
> = {
  super_admin: {
    name: 'Super Admin',
    description: 'Полный доступ, включая управление ролями. Неудаляем и непонижаем.',
    permissions: [...ADMIN_PERMISSIONS],
  },
  administrator: {
    name: 'Administrator',
    description: 'Полный доступ, кроме управления ролями.',
    permissions: ADMIN_PERMISSIONS.filter((p) => p !== 'roles.manage'),
  },
  moderator: {
    name: 'Moderator',
    description: 'Модерация пользователей, комнат и жалоб.',
    permissions: [
      'analytics.view',
      'users.view',
      'users.moderate',
      'rooms.view',
      'rooms.manage',
      'reports.view',
      'reports.handle',
      'moderation.dm.view',
      'audit.view',
    ],
  },
  support: {
    name: 'Support',
    description: 'Просмотр пользователей/комнат/жалоб и push-дашборда.',
    permissions: ['users.view', 'rooms.view', 'reports.view', 'push.view'],
  },
  analyst: {
    name: 'Analyst',
    description: 'Только чтение: аналитика и системный мониторинг.',
    permissions: ['analytics.view', 'system.view'],
  },
};

// ── DTO ───────────────────────────────────────────────────────────────────

export interface AdminRoleDTO {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: AdminPermission[];
  isSystem: boolean;
  /** Сколько сотрудников с этой ролью. */
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Ответ `GET /admin/me` — кто я в админке и что мне можно. */
export interface AdminMeResponse {
  userId: string;
  username: string;
  email: string;
  role: AdminRoleDTO | null;
  /** Плоский эффективный набор прав (super_admin → весь каталог). */
  permissions: AdminPermission[];
  isSuperAdmin: boolean;
}

export interface AdminStaffMember {
  id: string;
  publicId: string;
  username: string;
  email: string;
  avatarSeed: string;
  avatarUrl: string | null;
  roleId: string | null;
  roleKey: string | null;
  roleName: string | null;
}

export interface AdminRoleListResponse {
  roles: AdminRoleDTO[];
}
export interface AdminRoleResponse {
  role: AdminRoleDTO;
}
export interface AdminStaffListResponse {
  staff: AdminStaffMember[];
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions: AdminPermission[];
}
export interface UpdateRoleRequest {
  name?: string;
  description?: string | null;
  permissions?: AdminPermission[];
}
export interface AssignRoleRequest {
  /** null — снять роль (лишить админ-доступа). */
  roleId: string | null;
}

// ── Audit Log ──────────────────────────────────────────────────────────────

export interface AuditLogEntryDTO {
  id: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  before: unknown;
  after: unknown;
  meta: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogQuery {
  q?: string;
  actorId?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface AuditLogListResponse {
  entries: AuditLogEntryDTO[];
  nextCursor: string | null;
}

/** Различимые действия в аудите (не исчерпывающе — строка расширяема). */
export type AuditAction =
  | 'user.block'
  | 'user.unblock'
  | 'user.delete'
  | 'user.reset_avatar'
  | 'user.reset_bio'
  | 'user.reset_favorites'
  | 'user.push_disable'
  | 'user.session_revoke'
  | 'user.sessions_revoke_all'
  | 'room.update'
  | 'room.delete'
  | 'room.close'
  | 'room.call_end'
  | 'room.access_ticket'
  | 'broadcast.send'
  | 'push.template_update'
  | 'push.broadcast'
  | 'role.create'
  | 'role.update'
  | 'role.delete'
  | 'staff.assign_role'
  | 'dm.view'
  | 'report.resolve'
  | 'platform.update'
  | 'flag.update'
  | 'announcement.update'
  | 'media.purge';
