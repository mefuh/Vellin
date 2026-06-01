import type {
  DismissNotificationResponse,
  ListNotificationsResponse,
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
} from '@vellin/shared';
import { apiFetch } from './client';

export const notificationsApi = {
  list: () => apiFetch<ListNotificationsResponse>('/notifications'),
  markRead: (body: MarkNotificationsReadRequest = {}) =>
    apiFetch<MarkNotificationsReadResponse>('/notifications/read', { method: 'POST', body }),
  dismiss: (id: string) =>
    apiFetch<DismissNotificationResponse>(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
