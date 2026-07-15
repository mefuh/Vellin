import type {
  AnnouncementDTO,
  AnnouncementListResponse,
  FeatureFlagDTO,
  FeatureFlagListResponse,
  PlatformSettingsResponse,
  RuntimeConfig,
  UpdatePlatformSettingsRequest,
  UpsertAnnouncementRequest,
  UpsertFeatureFlagRequest,
} from '@vellin/shared';
import { apiFetch } from './client';

const enc = encodeURIComponent;

/** Публичный runtime-конфиг (без авторизации; авторизованный запрос точнее таргетит объявления). */
export const runtimeApi = {
  get: () => apiFetch<RuntimeConfig>('/runtime'),
};

/** Админ: настройки платформы, feature flags, объявления. */
export const adminPlatformApi = {
  getSettings: () => apiFetch<PlatformSettingsResponse>('/admin/platform/settings'),
  updateSettings: (body: UpdatePlatformSettingsRequest) =>
    apiFetch<PlatformSettingsResponse>('/admin/platform/settings', { method: 'PUT', body }),

  listFlags: () => apiFetch<FeatureFlagListResponse>('/admin/platform/flags'),
  upsertFlag: (body: UpsertFeatureFlagRequest) =>
    apiFetch<{ flag: FeatureFlagDTO }>('/admin/platform/flags', { method: 'PUT', body }),
  deleteFlag: (key: string) =>
    apiFetch<void>(`/admin/platform/flags/${enc(key)}`, { method: 'DELETE' }),

  listAnnouncements: () => apiFetch<AnnouncementListResponse>('/admin/platform/announcements'),
  createAnnouncement: (body: UpsertAnnouncementRequest) =>
    apiFetch<{ announcement: AnnouncementDTO }>('/admin/platform/announcements', { method: 'POST', body }),
  updateAnnouncement: (id: string, body: UpsertAnnouncementRequest) =>
    apiFetch<{ announcement: AnnouncementDTO }>(`/admin/platform/announcements/${enc(id)}`, { method: 'PATCH', body }),
  deleteAnnouncement: (id: string) =>
    apiFetch<void>(`/admin/platform/announcements/${enc(id)}`, { method: 'DELETE' }),
};
