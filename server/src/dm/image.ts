import { promises as fs } from 'node:fs';
import path from 'node:path';
import Jimp from 'jimp';
import { nanoid } from 'nanoid';
import { loadEnv } from '../env.js';

/**
 * Обработка и хранение изображений для личных сообщений. Файлы кладём в
 * `UPLOADS_DIR/dm`, отдаём по `/api/uploads/dm/...` (общий @fastify/static).
 * Большие картинки ужимаем до 1600px по большей стороне; без альфа-канала
 * сохраняем как JPEG (легче), с прозрачностью — PNG.
 */

const PUBLIC_PREFIX = '/api/uploads/dm';
const MAX_DIM = 1600;

export const ALLOWED_DM_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Максимальный размер исходного файла. */
export const MAX_DM_IMAGE_BYTES = 10 * 1024 * 1024;

function dmDir(): string {
  return path.resolve(loadEnv().UPLOADS_DIR, 'dm');
}

/** Создаёт каталог для картинок ЛС (идемпотентно). */
export async function ensureDmImagesDir(): Promise<void> {
  await fs.mkdir(dmDir(), { recursive: true });
}

export interface SavedImage {
  url: string;
  width: number;
  height: number;
}

/** Обрабатывает буфер, сохраняет файл и возвращает публичный URL + размеры. */
export async function processAndSaveDmImage(userId: string, buffer: Buffer): Promise<SavedImage> {
  const image = await Jimp.read(buffer);
  if (image.getWidth() > MAX_DIM || image.getHeight() > MAX_DIM) {
    image.scaleToFit(MAX_DIM, MAX_DIM);
  }
  const hasAlpha = image.hasAlpha();
  const mime = hasAlpha ? Jimp.MIME_PNG : Jimp.MIME_JPEG;
  const ext = hasAlpha ? 'png' : 'jpg';
  if (!hasAlpha) image.quality(85);
  const out = await image.getBufferAsync(mime);

  await ensureDmImagesDir();
  const filename = `${userId}-${nanoid(10)}.${ext}`;
  await fs.writeFile(path.join(dmDir(), filename), out);
  return { url: `${PUBLIC_PREFIX}/${filename}`, width: image.getWidth(), height: image.getHeight() };
}

/** Принадлежит ли URL нашему каталогу картинок ЛС (для валидации dm_send). */
export function isDmImageUrl(url: string): boolean {
  return url.startsWith(`${PUBLIC_PREFIX}/`);
}
