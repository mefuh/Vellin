import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { loadEnv } from './env.js';
import { authRoutes } from './auth/routes.js';
import { roomRoutes } from './rooms/routes.js';
import { registerWebSocket } from './ws/server.js';
import { logger } from './utils/logger.js';

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();

  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 1024 * 256, // 256 KB
    trustProxy: true,
  });

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
      reply.code((err as { statusCode: number }).statusCode).send({
        error: err.name,
        message: err.message,
        statusCode: (err as { statusCode: number }).statusCode,
      });
      return;
    }
    app.log.error({ err }, 'Unhandled error');
    reply.code(500).send({ error: 'InternalServerError', message: 'Internal error', statusCode: 500 });
  });

  app.get('/health', async () => ({ ok: true, version: '0.1.0' }));

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(roomRoutes);
    },
    { prefix: '/api' },
  );

  await registerWebSocket(app);

  return app;
}
