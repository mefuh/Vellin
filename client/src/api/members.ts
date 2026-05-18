import type {
  KickMemberResponse,
  UpdateMemberPermissionsRequest,
  UpdateMemberPermissionsResponse,
  UpdateMemberRoleRequest,
  UpdateMemberRoleResponse,
} from '@vellin/shared';
import { apiFetch } from './client';

export const membersApi = {
  setRole: (roomId: string, userId: string, body: UpdateMemberRoleRequest) =>
    apiFetch<UpdateMemberRoleResponse>(
      `/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}/role`,
      { method: 'POST', body },
    ),
  setPermissions: (
    roomId: string,
    userId: string,
    body: UpdateMemberPermissionsRequest,
  ) =>
    apiFetch<UpdateMemberPermissionsResponse>(
      `/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}/permissions`,
      { method: 'PATCH', body },
    ),
  kick: (roomId: string, userId: string) =>
    apiFetch<KickMemberResponse>(
      `/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    ),
};
