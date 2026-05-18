import type { ApiError } from '@vellin/shared';

const BASE = '/api';

let tokenGetter: () => string | null = () => null;

export function setTokenGetter(fn: () => string | null): void {
  tokenGetter = fn;
}

export class ApiHttpError extends Error {
  constructor(public status: number, public payload: ApiError) {
    super(payload.message);
    this.name = 'ApiHttpError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = tokenGetter();
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const payload: ApiError =
      data && typeof data === 'object'
        ? (data as ApiError)
        : { error: 'Error', message: res.statusText, statusCode: res.status };
    throw new ApiHttpError(res.status, payload);
  }
  return data as T;
}
