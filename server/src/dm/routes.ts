import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ConversationThreadResponse, ListConversationsResponse } from '@vellin/shared';
import type { Principal } from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';
import { getThreadByUsername, listConversations } from './service.js';

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
}
