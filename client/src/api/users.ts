import type { GetPublicProfileResponse, SearchUsersResponse } from '@vellin/shared';
import { apiFetch } from './client';

export const usersApi = {
  search: (q: string) => apiFetch<SearchUsersResponse>(`/users/search?q=${encodeURIComponent(q)}`),
  profile: (username: string) =>
    apiFetch<GetPublicProfileResponse>(`/users/${encodeURIComponent(username)}`),
};
