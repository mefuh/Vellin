import type { FastifyRequest } from 'fastify';
import type { DeviceSession } from '@vellin/shared';
import { prisma } from '../db/prisma.js';

/**
 * Управление серверными сессиями (устройствами). Каждая запись Session — это
 * один вход; JWT пользователя несёт claim `sid`, по которому requireAuth
 * проверяет, что вход не отозван, а профиль показывает список устройств.
 */

export interface DbSession {
  id: string;
  userId: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}

/** Создаёт сессию для пользователя по данным HTTP-запроса (UA + IP). */
export async function createSession(userId: string, req: FastifyRequest): Promise<DbSession> {
  const userAgent = req.headers['user-agent'] ?? null;
  // trustProxy включён в app.ts → req.ip учитывает X-Forwarded-For.
  const ip = req.ip || null;
  return prisma.session.create({
    data: { userId, userAgent, ip },
  });
}

// Троттлинг записи lastSeenAt: не чаще раза в 5 минут на сессию, чтобы не
// писать в БД на каждый авторизованный запрос.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const lastTouch = new Map<string, number>();

/** Обновляет lastSeenAt сессии (с троттлингом). Тихо игнорирует ошибки/гонки. */
export function touchSession(sessionId: string): void {
  const now = Date.now();
  const prev = lastTouch.get(sessionId) ?? 0;
  if (now - prev < TOUCH_INTERVAL_MS) return;
  lastTouch.set(sessionId, now);
  prisma.session
    .update({ where: { id: sessionId }, data: { lastSeenAt: new Date(now) } })
    .catch(() => {
      // Сессия могла быть отозвана между проверкой и апдейтом — не страшно.
      lastTouch.delete(sessionId);
    });
}

/** Забывает троттлинг-метку (вызывать при удалении сессии). */
export function forgetTouch(sessionId: string): void {
  lastTouch.delete(sessionId);
}

interface ParsedUa {
  deviceLabel: string;
  browser: string;
  os: string;
}

/** Грубый разбор User-Agent в человекочитаемые браузер/ОС без внешних зависимостей. */
export function parseUserAgent(ua: string | null | undefined): ParsedUa {
  if (!ua) return { deviceLabel: 'Неизвестное устройство', browser: 'Неизвестно', os: 'Неизвестно' };

  const os = (() => {
    if (/windows nt/i.test(ua)) return 'Windows';
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
    if (/mac os x/i.test(ua)) return 'macOS';
    if (/cros/i.test(ua)) return 'ChromeOS';
    if (/linux/i.test(ua)) return 'Linux';
    return 'Неизвестно';
  })();

  const browser = (() => {
    // Порядок важен: Edge/Opera/Brave маскируются под Chrome.
    if (/edg\//i.test(ua)) return 'Edge';
    if (/opr\/|opera/i.test(ua)) return 'Opera';
    if (/yabrowser/i.test(ua)) return 'Yandex';
    if (/firefox\//i.test(ua)) return 'Firefox';
    if (/chrome\//i.test(ua)) return 'Chrome';
    if (/safari\//i.test(ua)) return 'Safari';
    return 'Браузер';
  })();

  return { deviceLabel: `${browser} на ${os}`, browser, os };
}

/** Преобразует строку БД в DTO для клиента, помечая текущую сессию. */
export function toDeviceSession(s: DbSession, currentSid: string | undefined): DeviceSession {
  const parsed = parseUserAgent(s.userAgent);
  return {
    id: s.id,
    deviceLabel: parsed.deviceLabel,
    browser: parsed.browser,
    os: parsed.os,
    ip: s.ip,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: s.id === currentSid,
  };
}
