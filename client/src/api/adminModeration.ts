import type {
  AdminFavoritesResponse,
  AdminSharedTimeResponse,
  AdminUpdateUserProfileResponse,
  AdminUserFullResponse,
  AdminUserProfilePatch,
  AdminUserSessionsResponse,
} from '@vellin/shared';
import { apiFetch } from './client';

const enc = encodeURIComponent;

/** API модерации пользователей (профиль-360 + точечные действия). */
export const adminModerationApi = {
  userFull: (id: string) => apiFetch<AdminUserFullResponse>(`/admin/users/${enc(id)}/full`),

  // Редактирование полей профиля
  updateProfile: (id: string, patch: AdminUserProfilePatch) =>
    apiFetch<AdminUpdateUserProfileResponse>(`/admin/users/${enc(id)}/profile`, { method: 'PATCH', body: patch }),

  // Избранное: точечное удаление и переупорядочивание
  removeFavorite: (id: string, kpId: number) =>
    apiFetch<AdminFavoritesResponse>(`/admin/users/${enc(id)}/favorites/${kpId}`, { method: 'DELETE' }),
  reorderFavorites: (id: string, order: number[]) =>
    apiFetch<AdminFavoritesResponse>(`/admin/users/${enc(id)}/favorites/reorder`, { method: 'POST', body: { order } }),

  // Совместное время: начисление/списание и аннулирование
  adjustSharedTime: (id: string, peerId: string, deltaSeconds: number) =>
    apiFetch<AdminSharedTimeResponse>(`/admin/users/${enc(id)}/shared-time/${enc(peerId)}/adjust`, { method: 'POST', body: { deltaSeconds } }),
  resetSharedTime: (id: string, peerId: string) =>
    apiFetch<void>(`/admin/users/${enc(id)}/shared-time/${enc(peerId)}`, { method: 'DELETE' }),

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
