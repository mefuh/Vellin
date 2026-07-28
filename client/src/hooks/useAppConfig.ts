import { useEffect, useState } from 'react';
import type { AppConfigResponse } from '@vellin/shared';
import { configApi } from '../api/config';
import { useAuthStore } from '../stores/authStore';

/**
 * Публичный конфиг сервиса (`GET /api/config`).
 *
 * Ответ зависит от того, кто спрашивает (например, видимость страницы
 * скачивания Windows-клиента считается по аудитории из админ-панели), поэтому
 * кэш привязан к текущему токену и сбрасывается при входе/выходе. Кэш нужен,
 * чтобы переход между страницами не мигал состоянием «ещё не знаем».
 */
let cache: { token: string | null; config: AppConfigResponse } | null = null;

export interface AppConfigState {
  config: AppConfigResponse | null;
  /** true, пока первый ответ для текущего токена не получен. */
  loading: boolean;
}

export function useAppConfig(): AppConfigState {
  const token = useAuthStore((s) => s.token);
  const [config, setConfig] = useState<AppConfigResponse | null>(
    cache && cache.token === token ? cache.config : null,
  );
  const [loading, setLoading] = useState(!(cache && cache.token === token));

  useEffect(() => {
    if (cache && cache.token === token) {
      setConfig(cache.config);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    configApi
      .get(ac.signal)
      .then((c) => {
        cache = { token, config: c };
        setConfig(c);
      })
      .catch(() => {
        if (!ac.signal.aborted) setConfig(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [token]);

  return { config, loading };
}
