import type {
  DeviceInfo,
  NotificationPreferenceDTO,
  PreferencesResponse,
  PushSubscriptionInput,
  SubscribeResponse,
  UpdatePreferencesRequest,
  VapidKeyResponse,
} from '@vellin/shared';
import { apiFetch } from './client';

export const pushApi = {
  vapidKey: () => apiFetch<VapidKeyResponse>('/push/vapid-key'),
  subscribe: (subscription: PushSubscriptionInput, device: DeviceInfo) =>
    apiFetch<SubscribeResponse>('/push/subscribe', { method: 'POST', body: { subscription, device } }),
  unsubscribe: (endpoint: string) =>
    apiFetch<{ ok: true }>('/push/subscribe', { method: 'DELETE', body: { endpoint } }),
  preferences: () => apiFetch<PreferencesResponse>('/push/preferences'),
  updatePreferences: (patch: UpdatePreferencesRequest) =>
    apiFetch<PreferencesResponse>('/push/preferences', { method: 'PUT', body: patch }),
  test: () => apiFetch<{ ok: true; sent: number }>('/push/test', { method: 'POST' }),
};

export type { NotificationPreferenceDTO };
