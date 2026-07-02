import { logger } from '../utils/logger.js';
import {
  markVideoFailed,
  markVideoReady,
  processingVideoMessageIds,
  type VideoNoteBroadcast,
} from './service.js';
import { deleteRawForMessage, listRawMessageIds, transcodeVideoNote } from './videoNote.js';

/**
 * Очередь транскода видеосообщений (in-process, ограниченная конкуррентность —
 * ffmpeg тяжёл). По завершении обновляет сообщение (processing→ready|failed) и
 * рассылает обновление через инъектируемый broadcaster (DI разрывает цикл
 * импортов realtime↔transcode). Масштабируется выносом в отдельный процесс.
 */

type Broadcaster = (b: VideoNoteBroadcast) => Promise<void>;
let broadcaster: Broadcaster | null = null;

/** Внедрить рассыльщик обновления сообщения (из realtime-слоя). */
export function setVideoNoteBroadcaster(fn: Broadcaster): void {
  broadcaster = fn;
}

const CONCURRENCY = 1;
const queue: string[] = [];
const queued = new Set<string>();
let active = 0;

/** Поставить сообщение в очередь транскода (идемпотентно). */
export function enqueueTranscode(messageId: string): void {
  if (queued.has(messageId)) return;
  queued.add(messageId);
  queue.push(messageId);
  pump();
}

function pump(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const id = queue.shift()!;
    active += 1;
    void processOne(id).finally(() => {
      active -= 1;
      queued.delete(id);
      pump();
    });
  }
}

async function processOne(messageId: string): Promise<void> {
  try {
    const res = await transcodeVideoNote(messageId);
    const b = await markVideoReady(messageId, res);
    if (b && broadcaster) await broadcaster(b);
    logger.info({ messageId, durationSec: res.durationSec }, 'dm-video: transcoded');
  } catch (err) {
    logger.error({ err: (err as Error).message, messageId }, 'dm-video: transcode failed');
    await deleteRawForMessage(messageId).catch(() => {});
    const b = await markVideoFailed(messageId);
    if (b && broadcaster) await broadcaster(b);
  }
}

/**
 * Восстановление после рестарта: сообщения в статусе processing, для которых
 * сырой файл ещё на диске, — заново ставим в очередь; если сырьё потеряно —
 * помечаем failed.
 */
export async function recoverPendingTranscodes(): Promise<void> {
  const [ids, rawIds] = await Promise.all([processingVideoMessageIds(), listRawMessageIds()]);
  const rawSet = new Set(rawIds);
  for (const id of ids) {
    if (rawSet.has(id)) enqueueTranscode(id);
    else {
      const b = await markVideoFailed(id);
      if (b && broadcaster) await broadcaster(b);
    }
  }
}

/** Запуск воркера транскода (восстановление незавершённых задач). */
export function startVideoTranscodeWorker(): void {
  void recoverPendingTranscodes().catch((err) => logger.error({ err }, 'dm-video: recovery failed'));
}
