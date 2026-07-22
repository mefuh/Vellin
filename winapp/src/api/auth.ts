import type {
  AppConfigResponse,
  AuthResponse,
  ChangeEmailRequest,
  ChangePasswordRequest,
  ListSessionsResponse,
  LoginRequest,
  MeResponse,
  ProfileMutationResponse,
  RegisterRequest,
  RevokeOtherSessionsResponse,
  RevokeSessionResponse,
  UpdateProfileRequest,
  UploadAvatarResponse,
} from '@vellin/shared';
import { apiFetch, apiUpload } from './client';

/**
 * Auth + профиль. Гостевого входа в клиентах нет (только зарегистрированные
 * пользователи) — метод /auth/guest намеренно не проброшен.
 */
export const authApi = {
  config: () => apiFetch<AppConfigResponse>('/config'),
  register: (body: RegisterRequest) => apiFetch<AuthResponse>('/auth/register', { method: 'POST', body }),
  login: (body: LoginRequest) => apiFetch<AuthResponse>('/auth/login', { method: 'POST', body }),
  me: () => apiFetch<MeResponse>('/auth/me'),
};

export const profileApi = {
  updateProfile: (body: UpdateProfileRequest) =>
    apiFetch<ProfileMutationResponse>('/auth/profile', { method: 'PATCH', body }),
  changeEmail: (body: ChangeEmailRequest) =>
    apiFetch<ProfileMutationResponse>('/auth/email', { method: 'POST', body }),
  changePassword: (body: ChangePasswordRequest) =>
    apiFetch<ProfileMutationResponse>('/auth/password', { method: 'POST', body }),
  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiUpload<UploadAvatarResponse>('/auth/avatar', fd);
  },
  listSessions: () => apiFetch<ListSessionsResponse>('/auth/sessions'),
  revokeSession: (id: string) => apiFetch<RevokeSessionResponse>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () => apiFetch<RevokeOtherSessionsResponse>('/auth/sessions', { method: 'DELETE' }),
};
