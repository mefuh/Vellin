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

/** Названия платформ нативных клиентов для списка устройств. */
const APP_PLATFORM_NAMES: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  ios: 'iOS',
  android: 'Android',
};

/**
 * Строка устройства для записи в сессию.
 *
 * Нативные клиенты шлют User-Agent своей HTTP-библиотеки (`Dart/3.12
 * (dart:io)`), по которому не понять ни что это за программа, ни на чём она
 * работает, — в списке устройств выходил «Браузер на Неизвестно». Зато они
 * присылают `X-App-Platform` и `X-App-Version`: из них собирается метка
 * `Vellin/<версия> (<платформа>)`, которую узнаёт {@link parseUserAgent}.
 * Исходная строка сохраняется следом — для разбора инцидентов.
 */
export function deviceUserAgent(req: FastifyRequest): string | null {
  const ua = req.headers['user-agent'] ?? null;
  const platform = req.headers['x-app-platform'];
  const version = req.headers['x-app-version'];
  if (typeof platform === 'string' && APP_PLATFORM_NAMES[platform]) {
    const v = typeof version === 'string' && /^\d+(\.\d+){0,3}$/.test(version) ? version : '?';
    return `Vellin/${v} (${platform})${ua ? ` ${ua}` : ''}`;
  }
  return ua;
}

/** Создаёт сессию для пользователя по данным HTTP-запроса (UA + IP). */
export async function createSession(userId: string, req: FastifyRequest): Promise<DbSession> {
  const userAgent = deviceUserAgent(req);
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
  /** Нативный клиент Vellin, а не браузер. */
  app: boolean;
  deviceLabel: string;
  browser: string;
  os: string;
}

/** Грубый разбор User-Agent в человекочитаемые браузер/ОС без внешних зависимостей. */
export function parseUserAgent(ua: string | null | undefined): ParsedUa {
  if (!ua) return { deviceLabel: 'Неизвестное устройство', browser: 'Неизвестно', os: 'Неизвестно', app: false };

  // Нативный клиент — метка из deviceUserAgent.
  const app = /^Vellin\/([\d.?]+) \((\w+)\)/.exec(ua);
  if (app) {
    const os = APP_PLATFORM_NAMES[app[2]!] ?? 'Неизвестно';
    const version = app[1] === '?' ? '' : ` ${app[1]}`;
    return { deviceLabel: `Vellin для ${os}`, browser: `Приложение Vellin${version}`, os, app: true };
  }
  // Сессии, открытые клиентом до появления метки: у них голый User-Agent
  // Dart. Других программ на Dart у Vellin пока нет, кроме клиента для
  // Windows, — значит, это он.
  if (/\(dart:io\)/i.test(ua)) {
    return { deviceLabel: 'Vellin для Windows', browser: 'Приложение Vellin', os: 'Windows', app: true };
  }

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

  return { deviceLabel: `${browser} на ${os}`, browser, os, app: false };
}

/** Преобразует строку БД в DTO для клиента, помечая текущую сессию. */
export function toDeviceSession(s: DbSession, currentSid: string | undefined): DeviceSession {
  const parsed = parseUserAgent(s.userAgent);
  return {
    id: s.id,
    deviceLabel: parsed.deviceLabel,
    browser: parsed.browser,
    os: parsed.os,
    app: parsed.app,
    ip: s.ip,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: s.id === currentSid,
  };
}
