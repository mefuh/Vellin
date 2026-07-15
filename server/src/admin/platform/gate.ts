import type { PlatformToggles } from '@vellin/shared';
import { getMaintenance, getToggles } from './config.js';

interface HttpError extends Error {
  statusCode: number;
}

/** Ошибка с HTTP-статусом — форматируется общим errorHandler в app.ts. */
export function httpError(status: number, message: string): HttpError {
  const e = new Error(message) as HttpError;
  e.statusCode = status;
  e.name = status === 503 ? 'ServiceUnavailable' : status === 403 ? 'Forbidden' : 'Error';
  return e;
}

async function assertToggle(name: keyof PlatformToggles, message: string): Promise<void> {
  const toggles = await getToggles();
  if (!toggles[name]) throw httpError(403, message);
}

export const assertRegistrationEnabled = (): Promise<void> =>
  assertToggle('registration', 'Регистрация временно отключена администратором');
export const assertGuestsEnabled = (): Promise<void> =>
  assertToggle('guests', 'Гостевой вход временно отключён');
export const assertRoomCreationEnabled = (): Promise<void> =>
  assertToggle('roomCreation', 'Создание комнат временно отключено');
export const assertUploadsEnabled = (): Promise<void> =>
  assertToggle('uploads', 'Загрузка файлов временно отключена');

/** Режим обслуживания блокирует вход/регистрацию для не-администраторов. */
export async function assertNotMaintenance(isAdmin: boolean): Promise<void> {
  if (isAdmin) return;
  const m = await getMaintenance();
  if (m.enabled) throw httpError(503, m.message || 'Идут технические работы, зайдите позже');
}
