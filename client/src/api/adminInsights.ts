import type {
  AdminSearchResponse,
  GeoResponse,
  MediaCacheListResponse,
  PushAnalyticsResponse,
} from '@vellin/shared';
import { apiFetch } from './client';

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : '';
}

export const adminMediaApi = {
  list: (params: { q?: string; cursor?: string; limit?: number } = {}) =>
    apiFetch<MediaCacheListResponse>(`/admin/media${qs(params)}`),
  delete: (sourceUrl: string) => apiFetch<void>('/admin/media/delete', { method: 'POST', body: { sourceUrl } }),
  purge: () => apiFetch<{ count: number }>('/admin/media/purge', { method: 'POST' }),
};

export const adminGeoApi = {
  get: () => apiFetch<GeoResponse>('/admin/geo'),
};

export const adminPushAnalyticsApi = {
  get: () => apiFetch<PushAnalyticsResponse>('/admin/push/analytics'),
};

export const adminSearchApi = {
  search: (q: string) => apiFetch<AdminSearchResponse>(`/admin/search${qs({ q })}`),
};
