import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfigResponse, PlatformWindows } from '@vellin/shared';
import type { DesktopUpdate } from '@vellin/shared';
import type { Principal } from '../auth/jwt.js';
import { isWsTicket } from '../auth/jwt.js';
import { prisma } from '../db/prisma.js';
import { isAdminEmail, loadEnv } from '../env.js';
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
 * Пользователь запроса, если Bearer-токен пришёл и валиден. Конфиг остаётся
 * публичным: нет токена или он протух — просто аноним, без 401.
 */
async function optionalPrincipal(request: FastifyRequest): Promise<Principal | null> {
  try {
    const payload = await request.jwtVerify<Principal | { ticket: true }>();
    if (isWsTicket(payload as never)) return null;
    return payload as Principal;
  } catch {
    return null;
  }
}

/**
 * Видна ли запросившему страница скачивания Windows-клиента (тумблер +
 * аудитория из админ-панели). Администратор видит страницу при любой
 * аудитории, пока сам тумблер включён, — иначе он терял бы доступ к разделу,
 * которым управляет.
 */
async function isWindowsDownloadVisible(
  windows: PlatformWindows,
  principal: Principal | null,
): Promise<boolean> {
  if (!windows.downloadPage) return false;
  if (windows.audience === 'everyone') return true;
  if (!principal || principal.kind !== 'user') return false;

  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { email: true, username: true },
  });
  if (!user) return false;
  if (isAdminEmail(user.email)) return true;
  if (windows.audience === 'admins') return false;

  const allowed = windows.usernames.map((u) => u.trim().toLowerCase());
  return allowed.includes(user.username.toLowerCase());
}

/**
 * Публичный конфиг/дискавери сервиса — единая точка, из которой нативные
 * клиенты узнают версию API, минимальные поддерживаемые версии (force-update),
 * абсолютные базовые адреса, актуальные фиче-тумблеры, режим обслуживания и
 * параметры push. Без авторизации и без версионного гейтинга (клиент должен
 * получить конфиг даже когда его версия устарела — чтобы узнать об апдейте).
 */
export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/config', async (request) => {
    const settings = await getSettings();
    const vapid = getVapidPublicKey();
    const principal = await optionalPrincipal(request);
    const response: AppConfigResponse = {
      version: APP_VERSION,
      minVersions: getMinVersions(),
      endpoints: buildEndpoints(),
      features: settings.toggles,
      maintenance: settings.maintenance,
      limits: settings.limits,
      push: { mode: 'webpush', vapidPublicKey: vapid },
      update: { windows: windowsUpdate() },
      windowsDownloadVisible: await isWindowsDownloadVisible(settings.windows, principal),
    };
    return response;
  });
}
