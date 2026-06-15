import type {
  AuthResponse,
  GuestRequest,
  LoginRequest,
  MeResponse,
  PrivacyResponse,
  RegisterRequest,
  UpdatePrivacyRequest,
  UpdatePrivacyResponse,
} from '@vellin/shared';
import { apiFetch } from './client';

export const authApi = {
  register: (body: RegisterRequest) =>
    apiFetch<AuthResponse>('/auth/register', { method: 'POST', body }),
  login: (body: LoginRequest) =>
    apiFetch<AuthResponse>('/auth/login', { method: 'POST', body }),
  guest: (body: GuestRequest) =>
    apiFetch<AuthResponse>('/auth/guest', { method: 'POST', body }),
  me: () => apiFetch<MeResponse>('/auth/me'),
  privacy: () => apiFetch<PrivacyResponse>('/auth/privacy'),
  updatePrivacy: (body: UpdatePrivacyRequest) =>
    apiFetch<UpdatePrivacyResponse>('/auth/privacy', { method: 'PATCH', body }),
};
