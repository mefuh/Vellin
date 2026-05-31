import type {
  BlockFriendResponse,
  ListFriendRequestsResponse,
  ListFriendsResponse,
  RemoveFriendResponse,
  RespondFriendRequestResponse,
  SendFriendRequestRequest,
  SendFriendRequestResponse,
} from '@vellin/shared';
import { apiFetch } from './client';

export const friendsApi = {
  list: () => apiFetch<ListFriendsResponse>('/friends'),
  requests: () => apiFetch<ListFriendRequestsResponse>('/friends/requests'),
  send: (body: SendFriendRequestRequest) =>
    apiFetch<SendFriendRequestResponse>('/friends/requests', { method: 'POST', body }),
  accept: (id: string) =>
    apiFetch<RespondFriendRequestResponse>(`/friends/requests/${id}/accept`, { method: 'POST' }),
  decline: (id: string) =>
    apiFetch<RespondFriendRequestResponse>(`/friends/requests/${id}/decline`, { method: 'POST' }),
  remove: (userId: string) =>
    apiFetch<RemoveFriendResponse>(`/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  block: (userId: string) =>
    apiFetch<BlockFriendResponse>(`/friends/${encodeURIComponent(userId)}/block`, { method: 'POST' }),
  unblock: (userId: string) =>
    apiFetch<BlockFriendResponse>(`/friends/${encodeURIComponent(userId)}/block`, { method: 'DELETE' }),
};
