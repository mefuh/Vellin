import type { RealtimeTicketResponse } from '@vellin/shared';
import { apiFetch } from './client';

export const realtimeApi = {
  ticket: () => apiFetch<RealtimeTicketResponse>('/auth/realtime-ticket'),
};
