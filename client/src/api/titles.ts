import type { FavoriteTitle, FavoriteTitlesResponse, SearchTitlesResponse } from '@vellin/shared';
import { apiFetch } from './client';

export const titlesApi = {
  /** Поиск фильмов/сериалов (kinopoisk.dev) для выбора в избранное. */
  search: (q: string, signal?: AbortSignal) =>
    apiFetch<SearchTitlesResponse>(`/titles/search?q=${encodeURIComponent(q)}`, { signal }),
  /** Текущее избранное пользователя. */
  getFavorites: () => apiFetch<FavoriteTitlesResponse>('/titles/favorites'),
  /** Полная замена набора избранного (≤5). */
  saveFavorites: (titles: FavoriteTitle[]) =>
    apiFetch<FavoriteTitlesResponse>('/titles/favorites', { method: 'PUT', body: { titles } }),
};
