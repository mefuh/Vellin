import type { AdminUserFullResponse, AdminUserSessionsResponse } from '@vellin/shared';
import { apiFetch } from './client';

const enc = encodeURIComponent;

/** API модерации пользователей (профиль-360 + точечные действия). */
export const adminModerationApi = {
  userFull: (id: string) => apiFetch<AdminUserFullResponse>(`/admin/users/${enc(id)}/full`),

  sessions: (id: string) => apiFetch<AdminUserSessionsResponse>(`/admin/users/${enc(id)}/sessions`),
  revokeSession: (id: string, sid: string) =>
    apiFetch<void>(`/admin/users/${enc(id)}/sessions/${enc(sid)}`, { method: 'DELETE' }),
  revokeAllSessions: (id: string) =>
    apiFetch<{ count: number }>(`/admin/users/${enc(id)}/sessions`, { method: 'DELETE' }),

  disablePush: (id: string) =>
    apiFetch<void>(`/admin/users/${enc(id)}/push/disable`, { method: 'POST' }),

  resetAvatar: (id: string) => apiFetch<void>(`/admin/users/${enc(id)}/reset-avatar`, { method: 'POST' }),
  resetBio: (id: string) => apiFetch<void>(`/admin/users/${enc(id)}/reset-bio`, { method: 'POST' }),
  resetFavorites: (id: string) =>
    apiFetch<{ count: number }>(`/admin/users/${enc(id)}/reset-favorites`, { method: 'POST' }),
};
