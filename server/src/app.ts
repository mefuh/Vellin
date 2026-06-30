import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { loadEnv } from './env.js';
import { authRoutes } from './auth/routes.js';
import { roomRoutes } from './rooms/routes.js';
import { adminRoutes } from './admin/routes.js';
import { friendRoutes } from './friends/routes.js';
import { dmRoutes } from './dm/routes.js';
import { geoRoutes } from './geo/routes.js';
import { titleRoutes } from './titles/routes.js';
import { pushRoutes } from './push/routes.js';
import { pushPublicRoutes } from './push/clickBeacon.js';
import { adminPushRoutes } from './push/admin.js';
import { seedDefaultTemplates } from './push/templates.js';
import { startPushWorker } from './push/worker.js';
import { ensureUploadsDir } from './auth/avatar.js';
import { ensureDmImagesDir } from './dm/image.js';
import { ensureDmVoiceDir, MAX_DM_VOICE_BYTES } from './dm/voice.js';
import { registerWebSocket } from './ws/server.js';
import { userHub } from './realtime/UserHub.js';
import { getAcceptedFriendIds } from './friends/service.js';
import { parsePrivacy } from './privacy/privacy.js';
import { logger } from './utils/logger.js';
import { prisma } from './db/prisma.js';

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();

  // Cast back to the abstract FastifyInstance: passing a real pino instance via
  // `loggerInstance` narrows the inferred logger type to `Logger<...>` which is
  // incompatible with route handlers expecting FastifyBaseLogger. The runtime
  // surface is identical — we just want the default generic for downstream code.
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 1024 * 256, // 256 KB
    trustProxy: true,
  }) as unknown as FastifyInstance & {
    log: FastifyBaseLogger;
  };

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1'],
  });
  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });
  await app.register(multipart, {
    // Глобальный потолок — максимум из всех загрузок (голосовое — 25 МБ);
    // конкретные лимиты enforce'ятся в маршрутах (аватар — 5 МБ, картинка ЛС —
    // 10 МБ, голосовое — 25 МБ) через req.file({ limits }).
    limits: { fileSize: MAX_DM_VOICE_BYTES, files: 1 },
  });

  // Статика загруженных файлов (аватары). Отдаётся по /api/uploads/... —
  // существующие прокси-правила /api/ в nginx/Caddy уже её проксируют. Каталог
  // создаётся заранее, чтобы @fastify/static не упал на старте.
  await ensureUploadsDir();
  await ensureDmImagesDir();
  await ensureDmVoiceDir();
  await app.register(fastifyStatic, {
    root: path.resolve(env.UPLOADS_DIR),
    prefix: '/api/uploads/',
    decorateReply: false,
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({
        error: 'BadRequest',
        message: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') || 'Validation failed',
        statusCode: 400,
      });
      return;
    }
    if ((err as { statusCode?: number }).statusCode) {
      const sc = (err as { statusCode: number }).statusCode;
      const e = err as Error;
      reply.code(sc).send({
        error: e.name,
        message: e.message,
        statusCode: sc,
      });
      return;
    }
    app.log.error({ err }, 'Unhandled error');
    reply.code(500).send({ error: 'InternalServerError', message: 'Internal error', statusCode: 500 });
  });

  app.get('/health', async () => ({ ok: true, version: '0.20.0' }));

  await app.register(
    async (api) => {
      // КАЖДЫЙ из этих register() — отдельный плагин-контекст. roomRoutes и
      // adminRoutes навешивают свой preHandler через addHook, поэтому их
      // нельзя объединять в один колбэк — иначе хук протечёт на auth-роуты.
      await api.register(authRoutes);
      await api.register(roomRoutes);
      await api.register(adminRoutes);
      await api.register(friendRoutes);
      await api.register(dmRoutes);
      await api.register(geoRoutes);
      await api.register(titleRoutes);
      await api.register(pushRoutes);
      await api.register(pushPublicRoutes);
      await api.register(adminPushRoutes);
    },
    { prefix: '/api' },
  );

  // Хаб presence не знает про БД — отдаём ему резолвер друзей для рассылки и
  // writer «был в сети» (персистится при уходе пользователя в офлайн).
  userHub.setFriendResolver(getAcceptedFriendIds);
  userHub.setLastSeenWriter((userId, at) => {
    void prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: at } })
      .catch((err: unknown) => logger.error({ err, userId }, 'lastSeen write failed'));
  });
  // Презенс «online/был в сети» уважает настройку приватности владельца.
  userHub.setOnlinePrivacyResolver(async (userId) => {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { privacyJson: true },
    });
    return parsePrivacy(u?.privacyJson).online;
  });

  await registerWebSocket(app);

  // Засеять дефолтные шаблоны push (идемпотентно) и запустить фоновый воркер
  // очереди отправки (no-op, если push выключен — нет VAPID-ключей).
  void seedDefaultTemplates()
    .then(() => startPushWorker())
    .catch((err) => logger.error({ err }, 'push: init failed'));

  return app;
}
