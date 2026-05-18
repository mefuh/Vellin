import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Principal } from './jwt.js';
import { isWsTicket } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const payload = await request.jwtVerify<Principal | { ticket: true }>();
    if (isWsTicket(payload as never)) {
      reply.code(401).send({ error: 'Unauthorized', message: 'WS ticket not allowed for REST', statusCode: 401 });
      return;
    }
    request.principal = payload as Principal;
  } catch {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing token', statusCode: 401 });
  }
}
