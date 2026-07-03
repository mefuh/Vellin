import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Readable } from 'node:stream';
import { nanoid } from 'nanoid';
import { loadEnv } from '../env.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

/**
 * Видеосообщения-«кружки» ЛС. Сырое видео (webm/mp4 от MediaRecorder) стримится
 * на диск в `dm-video/raw`, затем фоновый воркер транскодирует его в квадратный
 * mp4/h264 (+jpg первого кадра) в `dm-video` (кросс-платформенное воспроизведение),
 * а сырой файл удаляется. Сырой файл именуется по messageId (после создания
 * сообщения) — это даёт бесплатное восстановление после краша сканом каталога.
 */

const PUBLIC_PREFIX = '/api/uploads/dm-video';

/** Потолок размера сырого видео (стримим на диск, не буферим в RAM). */
export const MAX_DM_VIDEO_BYTES = 128 * 1024 * 1024;

/** Целевой размер квадрата «кружка» (px). Задел под HD — поменять одно число. */
const TARGET_SIZE = 384;

export const ALLOWED_DM_VIDEO_MIME = new Set([
  'video/webm',
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
]);

const EXT_BY_MIME: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
};

function baseDir(): string {
  return path.resolve(loadEnv().UPLOADS_DIR, 'dm-video');
}
function rawDir(): string {
  return path.join(baseDir(), 'raw');
}

/** Создаёт каталоги видеосообщений (идемпотентно). */
export async function ensureDmVideoDir(): Promise<void> {
  await fs.mkdir(rawDir(), { recursive: true });
}

/** uploadId — временное имя сырого файла; проверяем безопасность (без путей). */
export function isValidUploadId(id: string): boolean {
  return /^[A-Za-z0-9_-]+\.(webm|mp4|mov|mkv)$/.test(id);
}

/** Публичен ли URL и указывает ли он на dm-video. */
export function isDmVideoUrl(url: string): boolean {
  return url.startsWith(`${PUBLIC_PREFIX}/`);
}

export interface SavedRawVideo {
  uploadId: string;
  bytes: number;
}

/**
 * Стримит сырое видео из multipart-потока прямо в файл (без буфера в памяти).
 * Возвращает uploadId (временное имя). Бросает 'too_large' при превышении потолка.
 */
export async function saveRawVideo(
  userId: string,
  stream: Readable & { truncated?: boolean },
  mime: string,
): Promise<SavedRawVideo> {
  await ensureDmVideoDir();
  const ext = EXT_BY_MIME[mime] ?? 'webm';
  const uploadId = `up_${userId}-${nanoid(12)}.${ext}`;
  const dest = path.join(rawDir(), uploadId);

  let bytes = 0;
  let tooLarge = false;
  stream.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > MAX_DM_VIDEO_BYTES && !tooLarge) {
      tooLarge = true;
      stream.destroy();
    }
  });

  try {
    await pipeline(stream, createWriteStream(dest));
  } catch (err) {
    await fs.unlink(dest).catch(() => {});
    if (tooLarge || stream.truncated) throw new Error('too_large');
    throw err;
  }
  if (tooLarge || stream.truncated) {
    await fs.unlink(dest).catch(() => {});
    throw new Error('too_large');
  }
  return { uploadId, bytes };
}

/** Путь маркера «ориентация уже финальная» (клиент сам зеркалил — не делать hflip). */
function noflipMarkerPath(messageId: string): string {
  return path.join(rawDir(), `${messageId}.noflip`);
}

/**
 * Привязать сырой файл к сообщению: переименовать `up_*` → `<messageId>.<ext>`.
 * После этого раскодирование и восстановление работают только по messageId.
 * При `mirrored` создаём on-disk маркер `<messageId>.noflip` (переживает рестарт),
 * чтобы транскод не зеркалил уже правильно ориентированное видео. Возвращает false,
 * если исходного файла нет.
 */
export async function promoteRawToMessage(
  uploadId: string,
  messageId: string,
  mirrored = false,
): Promise<boolean> {
  if (!isValidUploadId(uploadId)) return false;
  const ext = uploadId.split('.').pop() ?? 'webm';
  const from = path.join(rawDir(), uploadId);
  const to = path.join(rawDir(), `${messageId}.${ext}`);
  try {
    await fs.rename(from, to);
    if (mirrored) await fs.writeFile(noflipMarkerPath(messageId), '').catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Является ли файл видео-сырьём (а не маркером `.noflip`). */
function isRawVideoFile(name: string): boolean {
  return /\.(webm|mp4|mov|mkv)$/.test(name);
}

/** Найти сырой файл сообщения (`<messageId>.<ext>`), либо null. */
export async function findRawForMessage(messageId: string): Promise<string | null> {
  try {
    const files = await fs.readdir(rawDir());
    const hit = files.find((f) => isRawVideoFile(f) && f.replace(/\.[^.]+$/, '') === messageId);
    return hit ? path.join(rawDir(), hit) : null;
  } catch {
    return null;
  }
}

/** messageId всех сырых файлов в очереди (для восстановления на старте). */
export async function listRawMessageIds(): Promise<string[]> {
  try {
    const files = await fs.readdir(rawDir());
    return files
      .filter((f) => !f.startsWith('up_') && isRawVideoFile(f))
      .map((f) => f.replace(/\.[^.]+$/, ''));
  } catch {
    return [];
  }
}

export interface TranscodeResult {
  videoUrl: string;
  thumbUrl: string;
  durationSec: number;
}

/**
 * Транскодирует сырое видео сообщения в квадратный mp4/h264 + jpg первого кадра,
 * замеряет длительность, удаляет сырой файл. Возвращает публичные URL.
 */
export async function transcodeVideoNote(messageId: string): Promise<TranscodeResult> {
  const raw = await findRawForMessage(messageId);
  if (!raw) throw new Error('raw_not_found');
  const mp4Name = `${messageId}.mp4`;
  const jpgName = `${messageId}.jpg`;
  const mp4Path = path.join(baseDir(), mp4Name);
  const jpgPath = path.join(baseDir(), jpgName);

  // Зеркалим (hflip) только если клиент НЕ применил ориентацию сам. При записи со
  // сменой камеры (canvas-конвейер) фронт уже отзеркален, а задняя — нет, по кадрам:
  // единый серверный hflip там был бы неверен, поэтому клиент ставит маркер .noflip.
  const alreadyOriented = await fs
    .access(noflipMarkerPath(messageId))
    .then(() => true)
    .catch(() => false);
  const filter = `${alreadyOriented ? '' : 'hflip,'}crop='min(iw,ih)':'min(iw,ih)',scale=${TARGET_SIZE}:${TARGET_SIZE}`;

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i', raw,
      '-vf', filter,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      mp4Path,
    ],
    { timeout: 20 * 60_000, maxBuffer: 1024 * 1024 },
  );

  await execFileAsync(
    'ffmpeg',
    ['-y', '-i', mp4Path, '-vframes', '1', '-q:v', '4', jpgPath],
    { timeout: 60_000, maxBuffer: 1024 * 1024 },
  ).catch((err) => logger.warn({ err, messageId }, 'dm-video: thumb extraction failed'));

  const durationSec = await probeDuration(mp4Path);
  await fs.unlink(raw).catch(() => {});
  await fs.unlink(noflipMarkerPath(messageId)).catch(() => {});

  return { videoUrl: `${PUBLIC_PREFIX}/${mp4Name}`, thumbUrl: `${PUBLIC_PREFIX}/${jpgName}`, durationSec };
}

/** Длительность через ffprobe (сек). 0 при ошибке. */
async function probeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
      { timeout: 30_000 },
    );
    const v = parseFloat(stdout.trim());
    return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0;
  } catch {
    return 0;
  }
}

/** Удалить сырой файл сообщения + маркер ориентации (при ошибке/отмене). */
export async function deleteRawForMessage(messageId: string): Promise<void> {
  const raw = await findRawForMessage(messageId);
  if (raw) await fs.unlink(raw).catch(() => {});
  await fs.unlink(noflipMarkerPath(messageId)).catch(() => {});
}

/** Удалить временный сырой файл по uploadId (если сообщение не создалось). */
export async function deleteRawUpload(uploadId: string): Promise<void> {
  if (!isValidUploadId(uploadId)) return;
  await fs.unlink(path.join(rawDir(), uploadId)).catch(() => {});
}
