import type { ApiError } from '@vellin/shared';
import { apiBase } from '../runtime/config';
import { APP_PLATFORM, APP_VERSION, isTauri } from '../runtime/platform';

/**
 * HTTP-клиент WinApp. Отличия от веб-клиента:
 *  - абсолютная база API (нативному клиенту нечего резолвить относительно);
 *  - заголовки X-App-Platform / X-App-Version для версионного гейтинга;
 *  - в нативной сборке запросы идут через Tauri HTTP-плагин (из Rust, минуя
 *    CORS браузерного WebView); в браузер-dev — обычный fetch + Vite-прокси;
 *  - ответ 426 Upgrade Required — сигнал «нужно обновить приложение».
 */

let tokenGetter: () => string | null = () => null;
export function setTokenGetter(fn: () => string | null): void {
  tokenGetter = fn;
}

/** Колбэк на 426 — приложение показывает экран принудительного обновления. */
let onUpgradeRequired: ((minVersion: string) => void) | null = null;
export function setUpgradeRequiredHandler(fn: (minVersion: string) => void): void {
  onUpgradeRequired = fn;
}

export class ApiHttpError extends Error {
  constructor(public status: number, public payload: ApiError) {
    super(payload.message);
    this.name = 'ApiHttpError';
  }
}

// Fetch: нативно — Tauri HTTP (без CORS), иначе — глобальный fetch.
type FetchFn = typeof globalThis.fetch;
let fetchPromise: Promise<FetchFn> | null = null;
async function getFetch(): Promise<FetchFn> {
  if (!isTauri()) return globalThis.fetch.bind(globalThis);
  if (!fetchPromise) {
    fetchPromise = import('@tauri-apps/plugin-http').then((m) => m.fetch as unknown as FetchFn);
  }
  return fetchPromise;
}

function baseHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'x-app-platform': APP_PLATFORM,
    'x-app-version': APP_VERSION,
  };
  const token = tokenGetter();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function parseError(res: Response, data: unknown): Promise<never> {
  const payload: ApiError =
    data && typeof data === 'object'
      ? (data as ApiError)
      : { error: 'Error', message: res.statusText, statusCode: res.status };
  if (res.status === 426 && onUpgradeRequired) {
    const minVersion = (payload as { minVersion?: string }).minVersion ?? '';
    onUpgradeRequired(minVersion);
  }
  throw new ApiHttpError(res.status, payload);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const doFetch = await getFetch();
  const headers = baseHeaders();
  if (opts.body !== undefined) headers['content-type'] = 'application/json';

  const res = await doFetch(apiBase() + path, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) return parseError(res, data);
  return data as T;
}

/**
 * Multipart-загрузка (аватар). content-type не выставляем — рантайм сам
 * проставит boundary. Заголовки платформы/версии и токен — те же.
 */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const doFetch = await getFetch();
  const res = await doFetch(apiBase() + path, {
    method: 'POST',
    headers: baseHeaders(),
    body: formData,
  });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) return parseError(res, data);
  return data as T;
}
