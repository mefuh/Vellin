import type {
  ApproveQrLoginResponse,
  QrLoginRequestInfo,
  ChangeEmailRequest,
  ChangeEmailResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  ListSessionsResponse,
  RevokeOtherSessionsResponse,
  RevokeSessionResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UploadAvatarResponse,
} from '@vellin/shared';
import { apiFetch, apiUpload } from './client';

export const profileApi = {
  updateProfile: (body: UpdateProfileRequest) =>
    apiFetch<UpdateProfileResponse>('/auth/profile', { method: 'PATCH', body }),
  changeEmail: (body: ChangeEmailRequest) =>
    apiFetch<ChangeEmailResponse>('/auth/email', { method: 'POST', body }),
  changePassword: (body: ChangePasswordRequest) =>
    apiFetch<ChangePasswordResponse>('/auth/password', { method: 'POST', body }),
  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiUpload<UploadAvatarResponse>('/auth/avatar', fd);
  },
  listSessions: () => apiFetch<ListSessionsResponse>('/auth/sessions'),
  revokeSession: (id: string) =>
    apiFetch<RevokeSessionResponse>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () =>
    apiFetch<RevokeOtherSessionsResponse>('/auth/sessions', { method: 'DELETE' }),

  // Вход по QR: сайт подтверждает заявку, созданную десктоп-клиентом.
  qrLoginRequest: (id: string) => apiFetch<QrLoginRequestInfo>(`/auth/qr/${encodeURIComponent(id)}`),
  approveQrLogin: (id: string) =>
    apiFetch<ApproveQrLoginResponse>(`/auth/qr/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
};
