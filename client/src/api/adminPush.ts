import type {
  NotificationTemplateDTO,
  PushBroadcastsResponse,
  PushDashboardResponse,
  PushTemplatesResponse,
  SendBroadcastRequest,
  SendBroadcastResponse,
  UpdateTemplateRequest,
} from '@vellin/shared';
import { apiFetch } from './client';

export const adminPushApi = {
  dashboard: () => apiFetch<PushDashboardResponse>('/admin/push/dashboard'),
  templates: () => apiFetch<PushTemplatesResponse>('/admin/push/templates'),
  updateTemplate: (type: string, patch: UpdateTemplateRequest) =>
    apiFetch<{ template: NotificationTemplateDTO }>(`/admin/push/templates/${encodeURIComponent(type)}`, {
      method: 'PUT',
      body: patch,
    }),
  broadcasts: () => apiFetch<PushBroadcastsResponse>('/admin/push/broadcasts'),
  sendBroadcast: (body: SendBroadcastRequest) =>
    apiFetch<SendBroadcastResponse>('/admin/push/broadcast', { method: 'POST', body }),
};
