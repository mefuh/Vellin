import { promises as fs } from 'node:fs';
import path from 'node:path';
import Jimp from 'jimp';
import { nanoid } from 'nanoid';
import { loadEnv } from '../env.js';

/**
 * Обработка и хранение загруженных аватаров. Файлы кладём в
 * `UPLOADS_DIR/avatars`, отдаём по публичному пути `/api/uploads/avatars/...`
 * (см. @fastify/static в app.ts). Картинку приводим к квадрату 256×256 PNG.
 */

const PUBLIC_PREFIX = '/api/uploads/avatars';
const SIZE = 256;

export const ALLOWED_AVATAR_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Максимальный размер файла аватара. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function avatarsDir(): string {
  return path.resolve(loadEnv().UPLOADS_DIR, 'avatars');
}

/** Создаёт каталог для аватаров (идемпотентно). Вызывать при старте сервера. */
export async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(avatarsDir(), { recursive: true });
}

/**
 * Обрабатывает буфер изображения (кроп в квадрат + ресайз), сохраняет PNG и
 * возвращает публичный URL для поля User.avatarUrl.
 */
export async function processAndSaveAvatar(userId: string, buffer: Buffer): Promise<string> {
  const image = await Jimp.read(buffer);
  // cover = заполнить квадрат с сохранением пропорций и обрезкой лишнего.
  image.cover(SIZE, SIZE);
  const out = await image.getBufferAsync(Jimp.MIME_PNG);

  await ensureUploadsDir();
  const filename = `${userId}-${nanoid(8)}.png`;
  await fs.writeFile(path.join(avatarsDir(), filename), out);
  return `${PUBLIC_PREFIX}/${filename}`;
}

/**
 * Удаляет файл аватара по сохранённому публичному URL. Тихо игнорирует, если
 * URL не указывает на наш каталог или файла нет.
 */
export async function deleteAvatarFile(avatarUrl: string | null | undefined): Promise<void> {
  if (!avatarUrl || !avatarUrl.startsWith(`${PUBLIC_PREFIX}/`)) return;
  const filename = path.basename(avatarUrl);
  // basename отсекает любые попытки выхода из каталога (../).
  try {
    await fs.unlink(path.join(avatarsDir(), filename));
  } catch {
    // файла уже нет — не страшно
  }
}
