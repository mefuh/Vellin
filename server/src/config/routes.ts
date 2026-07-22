import type { FastifyInstance } from 'fastify';
import type { AppConfigResponse } from '@vellin/shared';
import type { DesktopUpdate } from '@vellin/shared';
import { loadEnv } from '../env.js';
import { APP_VERSION, getMinVersions } from '../appMeta.js';
import { getSettings } from '../admin/platform/config.js';
import { getVapidPublicKey } from '../push/vapid.js';

/** Данные автообновления Windows-клиента из окружения (null — не опубликовано). */
function windowsUpdate(): DesktopUpdate | null {
  const env = loadEnv();
  if (!env.WINAPP_LATEST_VERSION || !env.WINAPP_DOWNLOAD_URL) return null;
  return {
    latestVersion: env.WINAPP_LATEST_VERSION,
    url: env.WINAPP_DOWNLOAD_URL,
    mandatory: env.WINAPP_UPDATE_MANDATORY,
  };
}

/**
 * Собирает абсолютные адреса из PUBLIC_BASE_URL. Если база не задана — отдаём
 * пустые строки: нативный клиент обязан быть сконфигурирован своим адресом, а
 * веб-клиент и так резолвит всё по origin.
 */
function buildEndpoints(): AppConfigResponse['endpoints'] {
  const base = loadEnv().PUBLIC_BASE_URL;
  if (!base) {
    return { apiBaseUrl: '', uploadsBaseUrl: '', wsRoomUrl: '', wsUserUrl: '' };
  }
  const wsBase = base.replace(/^http/i, 'ws');
  return {
    apiBaseUrl: `${base}/api`,
    uploadsBaseUrl: base,
    wsRoomUrl: `${wsBase}/ws`,
    wsUserUrl: `${wsBase}/ws/user`,
  };
}

/**
 * Публичный конфиг/дискавери сервиса — единая точка, из которой нативные
 * клиенты узнают версию API, минимальные поддерживаемые версии (force-update),
 * абсолютные базовые адреса, актуальные фиче-тумблеры, режим обслуживания и
 * параметры push. Без авторизации и без версионного гейтинга (клиент должен
 * получить конфиг даже когда его версия устарела — чтобы узнать об апдейте).
 */
export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/config', async () => {
    const settings = await getSettings();
    const vapid = getVapidPublicKey();
    const response: AppConfigResponse = {
      version: APP_VERSION,
      minVersions: getMinVersions(),
      endpoints: buildEndpoints(),
      features: settings.toggles,
      maintenance: settings.maintenance,
      limits: settings.limits,
      push: { mode: 'webpush', vapidPublicKey: vapid },
      update: { windows: windowsUpdate() },
    };
    return response;
  });
}
