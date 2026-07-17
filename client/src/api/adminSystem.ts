import type { HealthSnapshot, PerfSnapshot, SystemJobsResponse, WsSnapshot } from '@vellin/shared';
import { apiFetch } from './client';

const enc = encodeURIComponent;

/** API системного мониторинга (просмотр — system.view, действия — jobs.manage). */
export const adminSystemApi = {
  ws: () => apiFetch<WsSnapshot>('/admin/system/ws'),
  perf: () => apiFetch<PerfSnapshot>('/admin/system/perf'),
  health: () => apiFetch<HealthSnapshot>('/admin/system/health'),
  jobs: () => apiFetch<SystemJobsResponse>('/admin/system/jobs'),

  retryJob: (kind: 'push' | 'transcode', id: string) =>
    apiFetch<void>(`/admin/system/jobs/${kind}/${enc(id)}/retry`, { method: 'POST' }),
  cancelJob: (kind: 'push' | 'transcode', id: string) =>
    apiFetch<void>(`/admin/system/jobs/${kind}/${enc(id)}/cancel`, { method: 'POST' }),
  purgeJobs: () => apiFetch<{ count: number }>('/admin/system/jobs/purge', { method: 'POST' }),
};
