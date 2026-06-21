import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { loadEnv } from '../env.js';

/**
 * Хранение голосовых сообщений для личных переписок. В отличие от картинок, аудио
 * НЕ перекодируем (без зависимости от ffmpeg) — кладём исходный blob от
 * MediaRecorder как есть в `UPLOADS_DIR/dm-voice`, отдаём по
 * `/api/uploads/dm-voice/...` (общий @fastify/static). Длительность и амплитудную
 * волну считает клиент при записи и присылает вместе с dm_send.
 */

const PUBLIC_PREFIX = '/api/uploads/dm-voice';

/** Допустимые MIME записи (что отдают MediaRecorder в разных браузерах). */
export const ALLOWED_DM_VOICE_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);

/** Расширения по MIME (для имени файла). */
const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

/** Потолок размера файла голосового (без лимита длительности — это «часы» opus). */
export const MAX_DM_VOICE_BYTES = 25 * 1024 * 1024;

/** Сколько столбиков волны принимаем максимум (защита от раздутого payload). */
export const MAX_VOICE_PEAKS = 64;

function voiceDir(): string {
  return path.resolve(loadEnv().UPLOADS_DIR, 'dm-voice');
}

/** Создаёт каталог для голосовых ЛС (идемпотентно). */
export async function ensureDmVoiceDir(): Promise<void> {
  await fs.mkdir(voiceDir(), { recursive: true });
}

export interface SavedVoice {
  url: string;
}

/** Сохраняет буфер аудио как файл и возвращает публичный URL. */
export async function saveDmVoice(userId: string, buffer: Buffer, mime: string): Promise<SavedVoice> {
  const ext = EXT_BY_MIME[mime] ?? 'webm';
  await ensureDmVoiceDir();
  const filename = `${userId}-${nanoid(10)}.${ext}`;
  await fs.writeFile(path.join(voiceDir(), filename), buffer);
  return { url: `${PUBLIC_PREFIX}/${filename}` };
}

/** Принадлежит ли URL нашему каталогу голосовых (для валидации dm_send). */
export function isDmVoiceUrl(url: string): boolean {
  return url.startsWith(`${PUBLIC_PREFIX}/`);
}

/**
 * Санитизация присланной клиентом волны: только целые 0..100, не длиннее
 * {@link MAX_VOICE_PEAKS}. Возвращает null, если данных нет/некорректны.
 */
export function sanitizeVoicePeaks(peaks: unknown): number[] | null {
  if (!Array.isArray(peaks) || peaks.length === 0) return null;
  const out: number[] = [];
  for (const p of peaks.slice(0, MAX_VOICE_PEAKS)) {
    if (typeof p !== 'number' || !Number.isFinite(p)) continue;
    out.push(Math.max(0, Math.min(100, Math.round(p))));
  }
  return out.length ? out : null;
}
