import type {
  AdminMeResponse,
  AdminRoleListResponse,
  AdminRoleResponse,
  AdminStaffListResponse,
  AuditLogListResponse,
  AuditLogQuery,
  CreateRoleRequest,
  UpdateRoleRequest,
} from '@vellin/shared';
import { apiFetch } from './client';

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    search.set(k, String(v));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
}

export const adminAccessApi = {
  me: () => apiFetch<AdminMeResponse>('/admin/me'),

  // Роли
  listRoles: () => apiFetch<AdminRoleListResponse>('/admin/roles'),
  createRole: (body: CreateRoleRequest) =>
    apiFetch<AdminRoleResponse>('/admin/roles', { method: 'POST', body }),
  updateRole: (id: string, body: UpdateRoleRequest) =>
    apiFetch<AdminRoleResponse>(`/admin/roles/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteRole: (id: string) =>
    apiFetch<void>(`/admin/roles/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Сотрудники
  listStaff: () => apiFetch<AdminStaffListResponse>('/admin/staff'),
  assignRole: (userId: string, roleId: string | null) =>
    apiFetch<void>(`/admin/staff/${encodeURIComponent(userId)}/role`, {
      method: 'POST',
      body: { roleId },
    }),

  // Аудит
  audit: (params: AuditLogQuery = {}) =>
    apiFetch<AuditLogListResponse>(`/admin/audit${qs(params as Record<string, string | number | undefined>)}`),

  /** URL для скачивания CSV с текущим токеном обрабатывается на стороне вызова. */
  auditCsvPath: (params: AuditLogQuery = {}) =>
    `/admin/audit${qs({ ...(params as Record<string, string | number | undefined>), format: 'csv' })}`,
};
