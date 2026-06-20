import type { ConversationThreadResponse, ListConversationsResponse } from '@vellin/shared';
import { apiFetch } from './client';

export const dmApi = {
  conversations: () => apiFetch<ListConversationsResponse>('/dm/conversations'),
  thread: (username: string, before?: string) =>
    apiFetch<ConversationThreadResponse>(
      `/dm/with/${encodeURIComponent(username)}${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
};
