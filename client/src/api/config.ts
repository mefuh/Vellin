import type { AppConfigResponse } from '@vellin/shared';
import { apiFetch } from './client';

export const configApi = {
  /** Публичный конфиг сервиса — версия API, тумблеры, публикация десктоп-клиента. */
  get: (signal?: AbortSignal) => apiFetch<AppConfigResponse>('/config', { signal }),
};
