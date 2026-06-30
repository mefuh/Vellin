import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  PreferencesResponse,
  SubscribeResponse,
  VapidKeyResponse,
} from '@vellin/shared';
import type { Principal } from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';
import { getVapidPublicKey } from './vapid.js';
import { registerDevice, removeByEndpoint, listDevices } from './deviceRegistry.js';
import { getPreferences, updatePreferences } from './preferences.js';
import { sendTestPush } from './notificationService.js';

function deny(reply: FastifyReply, status: number, error: string, message: string): void {
  reply.code(status).send({ error, message, statusCode: status });
}

function requireUser(req: FastifyRequest, reply: FastifyReply): Extract<Principal, { kind: 'user' }> | null {
  const principal = req.principal!;
  if (principal.kind !== 'user') {
    deny(reply, 403, 'Forbidden', 'Уведомления доступны только зарегистрированным пользователям');
    return null;
  }
  return principal;
}

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2048),
    keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
  }),
  device: z.object({
    browser: z.string().max(64).default(''),
    os: z.string().max(64).default(''),
    deviceLabel: z.string().max(128).default(''),
  }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });

const updatePrefsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  categories: z.record(z.string(), z.boolean()).optional(),
});

/**
 * Web-Push: реестр подписок устройств + настройки уведомлений + тест. Отдельный
 * плагин с requireAuth (как dmRoutes/friendRoutes). Все операции строго в рамках
 * своего аккаунта (подписки/настройки/тест — только для себя).
 */
export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Публичный VAPID-ключ для PushManager.subscribe (null = push выключен на сервере).
  app.get('/push/vapid-key', async (req, reply) => {
    if (!requireUser(req, reply)) return;
    reply.send({ publicKey: getVapidPublicKey() } satisfies VapidKeyResponse);
  });

  // Зарегистрировать/обновить подписку текущего устройства.
  app.post('/push/subscribe', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    const parsed = subscribeSchema.parse(req.body);
    const deviceId = await registerDevice(
      p.userId,
      parsed.subscription,
      parsed.device,
      req.headers['user-agent'] ?? null,
    );
    reply.send({ ok: true, deviceId } satisfies SubscribeResponse);
  });

  // Явная отписка устройства (удаляем подписку).
  app.delete('/push/subscribe', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    const { endpoint } = unsubscribeSchema.parse(req.body);
    await removeByEndpoint(p.userId, endpoint);
    reply.send({ ok: true });
  });

  // Список устройств пользователя (для страницы настроек).
  app.get('/push/devices', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    reply.send({ devices: await listDevices(p.userId) });
  });

  // Текущие настройки уведомлений.
  app.get('/push/preferences', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    reply.send({ preferences: await getPreferences(p.userId) } satisfies PreferencesResponse);
  });

  // Обновить настройки (частично).
  app.put('/push/preferences', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    const patch = updatePrefsSchema.parse(req.body);
    const preferences = await updatePreferences(p.userId, patch);
    reply.send({ preferences } satisfies PreferencesResponse);
  });

  // Тестовое push самому себе.
  app.post('/push/test', async (req, reply) => {
    const p = requireUser(req, reply);
    if (!p) return;
    const sent = await sendTestPush(p.userId);
    reply.send({ ok: true, sent });
  });
}
