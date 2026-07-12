import type {
  ConversationThreadResponse,
  ListConversationsResponse,
  RoomInviteInfoResponse,
  RoomInviteRespondRequest,
  RoomInviteRespondResponse,
  UploadDmImageResponse,
  UploadDmVoiceResponse,
} from '@vellin/shared';
import { apiFetch, apiUpload } from './client';

export const dmApi = {
  conversations: () => apiFetch<ListConversationsResponse>('/dm/conversations'),
  thread: (publicId: string, before?: string) =>
    apiFetch<ConversationThreadResponse>(
      `/dm/with/${encodeURIComponent(publicId)}${before ? `?before=${encodeURIComponent(before)}` : ''}`,
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
  respondRoomInvite: (messageId: string, action: 'accept' | 'decline') =>
    apiFetch<RoomInviteRespondResponse>(`/dm/room-invite/${messageId}/respond`, {
      method: 'POST',
      body: { action } satisfies RoomInviteRespondRequest,
    }),
  roomInviteInfo: (messageId: string) =>
    apiFetch<RoomInviteInfoResponse>(`/dm/room-invite/${messageId}/info`),
};
