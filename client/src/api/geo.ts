import type { SearchCitiesResponse } from '@vellin/shared';
import { apiFetch } from './client';

export const geoApi = {
  /** Подсказки городов для автодополнения. Пустой ответ при q короче 2 символов. */
  searchCities: (q: string) => apiFetch<SearchCitiesResponse>(`/geo/cities?q=${encodeURIComponent(q)}`),
};
