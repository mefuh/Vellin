import { promises as fs } from 'node:fs';
import path from 'node:path';
import Jimp from 'jimp';
import exifr from 'exifr';
import { nanoid } from 'nanoid';
import { loadEnv } from '../env.js';

/**
 * Обработка и хранение изображений для личных сообщений. Файлы кладём в
 * `UPLOADS_DIR/dm`, отдаём по `/api/uploads/dm/...` (общий @fastify/static).
 * Большие картинки ужимаем до 1600px по большей стороне; без альфа-канала
 * сохраняем как JPEG (легче), с прозрачностью — PNG.
 */

/**
 * Jimp пытается сам повернуть изображение по EXIF-ориентации при чтении
 * (`@jimp/core` вызывает `exif-parser` и молча проглатывает любую ошибку —
 * см. `_exifParser...parse()` в catch без обработки). `exif-parser` заметно
 * менее устойчив к «нестандартному» EXIF с реальных телефонов, чем более
 * активно поддерживаемый `exifr` — отсюда баг «некоторые фото отправляются
 * перевёрнутыми»: для части снимков jimp тихо не смог распарсить EXIF и
 * ничего не повернул, для остальных — смог и повернул как надо.
 *
 * Чиним точечно: если после `Jimp.read()` у картинки НЕТ `_exif` (jimp сам
 * не справился — `_exif` не выставляется, пока парсинг не завершится
 * успешно), перечитываем ориентацию через exifr и поворачиваем/отражаем
 * вручную. Если jimp справился сам — трогать нельзя, иначе повернём дважды.
 */
async function applyExifOrientationFallback(image: Jimp, buffer: Buffer): Promise<void> {
  if ((image as unknown as { _exif?: unknown })._exif) return; // jimp уже справился сам
  let orientation: number | undefined;
  try {
    orientation = await exifr.orientation(buffer);
  } catch {
    return; // EXIF нечитаем (или отсутствует) ни для одной из двух библиотек — оставляем как есть
  }
  // jimp.rotate(deg) крутит ПРОТИВ часовой (задокументировано в самом
  // плагине), а стандартные описания EXIF-ориентаций — «rotate N CW». Отсюда
  // 90°CW = jimp rotate(270), 270°CW = jimp rotate(90). Mode не передаём —
  // по умолчанию true, а для кратных 90° это быстрый точный поворот без
  // интерполяции (см. matrixRotateAllowed в @jimp/plugin-rotate) с
  // корректной сменой width/height местами.
  switch (orientation) {
    case 2: // отражение по горизонтали
      image.flip(true, false);
      break;
    case 3: // поворот 180°
      image.rotate(180);
      break;
    case 4: // отражение по вертикали
      image.flip(false, true);
      break;
    case 5: // отражение по горизонтали + поворот 270°CW
      image.flip(true, false).rotate(90);
      break;
    case 6: // поворот 90°CW
      image.rotate(270);
      break;
    case 7: // отражение по горизонтали + поворот 90°CW
      image.flip(true, false).rotate(270);
      break;
    case 8: // поворот 270°CW
      image.rotate(90);
      break;
    default:
      break; // 1/undefined — уже нормальная ориентация
  }
}

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
  await applyExifOrientationFallback(image, buffer);
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
