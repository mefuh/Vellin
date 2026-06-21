import type {
  ConversationThreadResponse,
  ListConversationsResponse,
  UploadDmImageResponse,
  UploadDmVoiceResponse,
} from '@vellin/shared';
import { apiFetch, apiUpload } from './client';

export const dmApi = {
  conversations: () => apiFetch<ListConversationsResponse>('/dm/conversations'),
  thread: (username: string, before?: string) =>
    apiFetch<ConversationThreadResponse>(
      `/dm/with/${encodeURIComponent(username)}${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
  uploadImage: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiUpload<UploadDmImageResponse>('/dm/image', fd);
  },
  uploadVoice: (blob: Blob, filename: string) => {
    const fd = new FormData();
    fd.append('file', blob, filename);
    return apiUpload<UploadDmVoiceResponse>('/dm/voice', fd);
  },
};
