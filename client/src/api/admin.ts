import type {
  AdminAccessMode,
  AdminAccessTicketResponse,
  AdminBroadcastResponse,
  AdminCloseRoomResponse,
  AdminRoomDetailResponse,
  AdminRoomListResponse,
  AdminStatsResponse,
  AdminUserDetailResponse,
  AdminUserListResponse,
  BlockUserResponse,
  UpdateRoomRequest,
  UpdateRoomResponse,
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

export const adminApi = {
  stats: () => apiFetch<AdminStatsResponse>('/admin/stats'),

  listUsers: (params: { q?: string; cursor?: string; limit?: number } = {}) =>
    apiFetch<AdminUserListResponse>(`/admin/users${qs(params)}`),
  getUser: (id: string) => apiFetch<AdminUserDetailResponse>(`/admin/users/${encodeURIComponent(id)}`),
  deleteUser: (id: string) =>
    apiFetch<void>(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  blockUser: (id: string, reason?: string) =>
    apiFetch<BlockUserResponse>(`/admin/users/${encodeURIComponent(id)}/block`, {
      method: 'POST',
      body: { reason },
    }),
  unblockUser: (id: string) =>
    apiFetch<BlockUserResponse>(`/admin/users/${encodeURIComponent(id)}/unblock`, {
      method: 'POST',
    }),

  listRooms: (params: { q?: string; cursor?: string; limit?: number } = {}) =>
    apiFetch<AdminRoomListResponse>(`/admin/rooms${qs(params)}`),
  getRoom: (id: string) => apiFetch<AdminRoomDetailResponse>(`/admin/rooms/${encodeURIComponent(id)}`),
  updateRoom: (id: string, patch: UpdateRoomRequest) =>
    apiFetch<UpdateRoomResponse>(`/admin/rooms/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
    }),
  deleteRoom: (id: string) =>
    apiFetch<void>(`/admin/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  closeRoom: (id: string) =>
    apiFetch<AdminCloseRoomResponse>(`/admin/rooms/${encodeURIComponent(id)}/close`, {
      method: 'POST',
    }),
  endCall: (id: string) =>
    apiFetch<AdminCloseRoomResponse>(`/admin/rooms/${encodeURIComponent(id)}/call/end`, {
      method: 'POST',
    }),
  accessTicket: (id: string, mode: AdminAccessMode) =>
    apiFetch<AdminAccessTicketResponse>(`/admin/rooms/${encodeURIComponent(id)}/access-ticket`, {
      method: 'POST',
      body: { mode },
    }),

  broadcast: (body: string) =>
    apiFetch<AdminBroadcastResponse>('/admin/broadcast', {
      method: 'POST',
      body: { body },
    }),
};
