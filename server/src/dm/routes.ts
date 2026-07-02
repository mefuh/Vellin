import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  ConversationThreadResponse,
  ListConversationsResponse,
  UploadDmImageResponse,
  UploadDmVoiceResponse,
} from '@vellin/shared';
import type { Principal } from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';
import { getThreadByUsername, listConversations } from './service.js';
import { ALLOWED_DM_IMAGE_MIME, MAX_DM_IMAGE_BYTES, processAndSaveDmImage } from './image.js';
import { ALLOWED_DM_VOICE_MIME, MAX_DM_VOICE_BYTES, saveDmVoice } from './voice.js';
import { ALLOWED_DM_VIDEO_MIME, MAX_DM_VIDEO_BYTES, saveRawVideo } from './videoNote.js';

function deny(reply: FastifyReply, status: number, error: string, message: string): void {
  reply.code(status).send({ error, message, statusCode: status });
}

function requireUser(req: FastifyRequest, reply: FastifyReply): Extract<Principal, { kind: 'user' }> | null {
  const principal = req.principal!;
  if (principal.kind !== 'user') {
    deny(reply, 403, 'Forbidden', 'Личные сообщения доступны только зарегистрированным пользователям');
    return null;
  }
  return principal;
}

/**
 * Личные сообщения. Загрузка списка диалогов и истории треда — по REST;
 * сама доставка/печать/прочтение идут по пользовательскому WS-каналу.
 * Отдельный плагин с собственным preHandler (по образцу friendRoutes).
 */
export async function dmRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/dm/conversations', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    reply.send((await listConversations(p.userId)) satisfies ListConversationsResponse);
  });

  app.get<{ Params: { username: string }; Querystring: { before?: string } }>(
    '/dm/with/:username',
    async (req, reply) => {
      const p = requireUser(req, reply);
      if (!p) return;
      const thread = await getThreadByUsername(p.userId, req.params.username, req.query.before);
      reply.send(thread satisfies ConversationThreadResponse);
    },
  );

  // Загрузка изображения для ЛС (multipart). Сама отправка идёт по WS с
  // полученным здесь url.
  app.post('/dm/image', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    const file = await req.file({ limits: { fileSize: MAX_DM_IMAGE_BYTES, files: 1 } });
    if (!file) {
      deny(reply, 400, 'BadRequest', 'Файл не получен');
      return;
    }
    if (!ALLOWED_DM_IMAGE_MIME.has(file.mimetype)) {
      deny(reply, 400, 'BadRequest', 'Поддерживаются только JPEG, PNG и WebP');
      return;
    }
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      deny(reply, 400, 'BadRequest', 'Файл слишком большой (макс. 10 МБ)');
      return;
    }
    if (file.file.truncated) {
      deny(reply, 400, 'BadRequest', 'Файл слишком большой (макс. 10 МБ)');
      return;
    }
    try {
      const saved = await processAndSaveDmImage(p.userId, buffer);
      reply.send(saved satisfies UploadDmImageResponse);
    } catch {
      deny(reply, 400, 'BadRequest', 'Не удалось обработать изображение');
    }
  });

  // Загрузка голосового сообщения (multipart). Аудио не перекодируем — кладём
  // исходный blob; длительность/волну считает клиент и шлёт в dm_send.
  app.post('/dm/voice', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    const file = await req.file({ limits: { fileSize: MAX_DM_VOICE_BYTES, files: 1 } });
    if (!file) {
      deny(reply, 400, 'BadRequest', 'Файл не получен');
      return;
    }
    // MediaRecorder отдаёт mime вида `audio/webm;codecs=opus` — берём базовый тип.
    const baseMime = file.mimetype.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_DM_VOICE_MIME.has(baseMime)) {
      deny(reply, 400, 'BadRequest', 'Неподдерживаемый формат аудио');
      return;
    }
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      deny(reply, 400, 'BadRequest', 'Файл слишком большой (макс. 25 МБ)');
      return;
    }
    if (file.file.truncated) {
      deny(reply, 400, 'BadRequest', 'Файл слишком большой (макс. 25 МБ)');
      return;
    }
    try {
      const saved = await saveDmVoice(p.userId, buffer, baseMime);
      reply.send(saved satisfies UploadDmVoiceResponse);
    } catch {
      deny(reply, 400, 'BadRequest', 'Не удалось сохранить голосовое');
    }
  });

  // Видеосообщение («кружок»). Сырое видео СТРИМИТСЯ на диск (без буфера в RAM),
  // потолок 128 МБ. Возвращает uploadId; транскод в mp4 идёт в фоне после dm_send.
  app.post('/dm/video-note', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    const file = await req.file({ limits: { fileSize: MAX_DM_VIDEO_BYTES, files: 1 } });
    if (!file) {
      deny(reply, 400, 'BadRequest', 'Файл не получен');
      return;
    }
    const baseMime = file.mimetype.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_DM_VIDEO_MIME.has(baseMime)) {
      deny(reply, 400, 'BadRequest', 'Неподдерживаемый формат видео');
      return;
    }
    try {
      const saved = await saveRawVideo(p.userId, file.file, baseMime);
      reply.send({ uploadId: saved.uploadId });
    } catch (err) {
      if ((err as Error).message === 'too_large') {
        deny(reply, 413, 'PayloadTooLarge', 'Видео слишком большое (макс. 128 МБ)');
        return;
      }
      deny(reply, 400, 'BadRequest', 'Не удалось сохранить видео');
    }
  });
}
