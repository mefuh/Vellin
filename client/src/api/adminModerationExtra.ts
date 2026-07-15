import type {
  CreateReportRequest,
  ModConversationListResponse,
  ModMessagesResponse,
  ReportDTO,
  ReportListResponse,
  ReportStatus,
  ResolveReportRequest,
} from '@vellin/shared';
import { apiFetch } from './client';

const enc = encodeURIComponent;

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : '';
}

/** Пользовательская подача жалобы (любой авторизованный). */
export const reportsApi = {
  create: (body: CreateReportRequest) => apiFetch<{ ok: boolean; deduped?: boolean }>('/reports', { method: 'POST', body }),
};

/** Админ: очередь жалоб. */
export const adminReportsApi = {
  list: (params: { status?: ReportStatus | 'all'; cursor?: string; limit?: number } = {}) =>
    apiFetch<ReportListResponse>(`/admin/reports${qs(params)}`),
  resolve: (id: string, body: ResolveReportRequest) =>
    apiFetch<{ report: ReportDTO }>(`/admin/reports/${enc(id)}/resolve`, { method: 'POST', body }),
};

/** Админ: модерация ЛС (чувствительно, за пермишеном + аудит). */
export const adminDmApi = {
  conversations: (params: { q?: string; cursor?: string; limit?: number } = {}) =>
    apiFetch<ModConversationListResponse>(`/admin/moderation/conversations${qs(params)}`),
  messages: (id: string, cursor?: string) =>
    apiFetch<ModMessagesResponse>(`/admin/moderation/conversations/${enc(id)}/messages${qs({ cursor })}`),
};
