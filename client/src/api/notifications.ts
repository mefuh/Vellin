import type {
  ListNotificationsResponse,
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
} from '@vellin/shared';
import { apiFetch } from './client';

export const notificationsApi = {
  list: () => apiFetch<ListNotificationsResponse>('/notifications'),
  markRead: (body: MarkNotificationsReadRequest = {}) =>
    apiFetch<MarkNotificationsReadResponse>('/notifications/read', { method: 'POST', body }),
};
