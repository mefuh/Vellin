import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  AuthResponse,
  AuthUser,
  GuestRequest,
  LoginRequest,
  MeResponse,
  RegisterRequest,
} from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { hashPassword, verifyPassword } from './password.js';
import { signSession, type Principal } from './jwt.js';
import { generateAvatarSeed, generateGuestId } from '../utils/ids.js';
import { requireAuth } from './middleware.js';

const registerSchema = z.object({
  email: z.string().email().max(254),
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9_\-.]+$/u, 'username may contain letters, digits, _ - .'),
  password: z.string().min(8).max(128),
}) satisfies z.ZodType<RegisterRequest>;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
}) satisfies z.ZodType<LoginRequest>;

const guestSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(24)
    .regex(/^[\p{L}\p{N}_\- ]+$/u, 'invalid characters'),
}) satisfies z.ZodType<GuestRequest>;

function toAuthUser(u: { id: string; email: string; username: string; avatarSeed: string; createdAt: Date }): AuthUser {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    avatarSeed: u.avatarSeed,
    kind: 'user',
    createdAt: u.createdAt.toISOString(),
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const body = registerSchema.parse(req.body);
      const existing = await prisma.user.findFirst({
        where: { OR: [{ email: body.email }, { username: body.username }] },
        select: { email: true, username: true },
      });
      if (existing) {
        reply.code(409).send({
          error: 'Conflict',
          message: existing.email === body.email ? 'Email already in use' : 'Username already taken',
          statusCode: 409,
        });
        return;
      }
      const passwordHash = await hashPassword(body.password);
      const user = await prisma.user.create({
        data: {
          email: body.email,
          username: body.username,
          passwordHash,
          avatarSeed: generateAvatarSeed(),
        },
      });
      const principal: Principal = {
        kind: 'user',
        userId: user.id,
        username: user.username,
        avatarSeed: user.avatarSeed,
      };
      const token = signSession(app, principal);
      const response: AuthResponse = { token, user: toAuthUser(user) };
      reply.code(201).send(response);
    },
  });

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const body = loginSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        reply.code(401).send({ error: 'Unauthorized', message: 'Invalid email or password', statusCode: 401 });
        return;
      }
      const principal: Principal = {
        kind: 'user',
        userId: user.id,
        username: user.username,
        avatarSeed: user.avatarSeed,
      };
      const token = signSession(app, principal);
      const response: AuthResponse = { token, user: toAuthUser(user) };
      reply.send(response);
    },
  });

  app.post('/auth/guest', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const body = guestSchema.parse(req.body);
      const guestId = generateGuestId();
      const avatarSeed = generateAvatarSeed();
      const principal: Principal = {
        kind: 'guest',
        userId: guestId,
        username: body.username.trim(),
        avatarSeed,
      };
      const token = signSession(app, principal);
      const user: AuthUser = {
        id: guestId,
        email: null,
        username: principal.username,
        avatarSeed,
        kind: 'guest',
        createdAt: new Date().toISOString(),
      };
      reply.send({ token, user } satisfies AuthResponse);
    },
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const principal = req.principal!;
    if (principal.kind === 'guest') {
      const user: AuthUser = {
        id: principal.userId,
        email: null,
        username: principal.username,
        avatarSeed: principal.avatarSeed,
        kind: 'guest',
        createdAt: new Date(0).toISOString(),
      };
      reply.send({ user } satisfies MeResponse);
      return;
    }
    const dbUser = await prisma.user.findUnique({ where: { id: principal.userId } });
    if (!dbUser) {
      reply.code(401).send({ error: 'Unauthorized', message: 'User no longer exists', statusCode: 401 });
      return;
    }
    reply.send({ user: toAuthUser(dbUser) } satisfies MeResponse);
  });
}
