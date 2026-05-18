import type {
  CreateInviteRequest,
  CreateInviteResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  GetRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  ListRoomsResponse,
  MessagesResponse,
  ResolveRequest,
  ResolveResponse,
  SetVideoUrlRequest,
  SetVideoUrlResponse,
} from '@vellin/shared';
import { apiFetch } from './client';

export const roomsApi = {
  create: (body: CreateRoomRequest) =>
    apiFetch<CreateRoomResponse>('/rooms', { method: 'POST', body }),
  list: () => apiFetch<ListRoomsResponse>('/rooms'),
  get: (slug: string) => apiFetch<GetRoomResponse>(`/rooms/${encodeURIComponent(slug)}`),
  join: (body: JoinRoomRequest) =>
    apiFetch<JoinRoomResponse>('/rooms/join', { method: 'POST', body }),
  setVideo: (id: string, body: SetVideoUrlRequest) =>
    apiFetch<SetVideoUrlResponse>(`/rooms/${id}/video`, { method: 'POST', body }),
  resolve: (body: ResolveRequest) =>
    apiFetch<ResolveResponse>('/rooms/resolve', { method: 'POST', body }),
  createInvite: (id: string, body: CreateInviteRequest = {}) =>
    apiFetch<CreateInviteResponse>(`/rooms/${id}/invites`, { method: 'POST', body }),
  messages: (id: string, cursor?: string) =>
    apiFetch<MessagesResponse>(
      `/rooms/${id}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
};
