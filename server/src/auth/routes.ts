import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  AuthResponse,
  AuthUser,
  ChangeEmailRequest,
  ChangePasswordRequest,
  Gender,
  GuestRequest,
  ListSessionsResponse,
  LoginRequest,
  MeResponse,
  PrivacyResponse,
  ProfileMutationResponse,
  RealtimeTicketResponse,
  RegisterRequest,
  RevokeOtherSessionsResponse,
  RevokeSessionResponse,
  UpdatePrivacyRequest,
  UpdatePrivacyResponse,
  UpdateProfileRequest,
  UploadAvatarResponse,
} from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { parsePrivacy, serializePrivacy } from '../privacy/privacy.js';
import { userHub } from '../realtime/UserHub.js';
import { hashPassword, verifyPassword } from './password.js';
import { signSession, signUserTicket, type Principal } from './jwt.js';
import { generateAvatarSeed, generateGuestId, generatePublicId } from '../utils/ids.js';
import { requireAuth } from './middleware.js';
import { isAdminEmail } from '../env.js';
import { createSession, forgetTouch, toDeviceSession, type DbSession } from './sessions.js';
import { isKnownCity } from '../geo/cities.js';
import {
  ALLOWED_AVATAR_MIME,
  MAX_AVATAR_BYTES,
  deleteAvatarFile,
  processAndSaveAvatar,
} from './avatar.js';

const registerSchema = z.object({
  email: z.string().email().max(254),
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[\p{L}\p{N}_\-.]+$/u, 'имя может содержать буквы (в т.ч. кириллицу), цифры, _ - .'),
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

const usernameSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[\p{L}\p{N}_\-.]+$/u, 'имя может содержать буквы (в т.ч. кириллицу), цифры, _ - .');

const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'дата должна быть в формате YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return false;
    const year = d.getUTCFullYear();
    return year >= 1900 && d.getTime() <= Date.now();
  }, 'некорректная дата рождения');

const citySchema = z
  .string()
  .max(120)
  .refine((v) => v.trim().length === 0 || isKnownCity(v), 'выберите город из списка');

const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  bio: z.string().max(300).nullable().optional(),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  birthDate: birthDateSchema.nullable().optional(),
  city: citySchema.nullable().optional(),
  avatarSeed: z.string().max(64).nullable().optional(),
}) satisfies z.ZodType<UpdateProfileRequest>;

const changeEmailSchema = z.object({
  email: z.string().email().max(254),
  currentPassword: z.string().min(1).max(128),
}) satisfies z.ZodType<ChangeEmailRequest>;

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
}) satisfies z.ZodType<ChangePasswordRequest>;

const privacyRuleSchema = z.object({
  visibility: z.enum(['everyone', 'friends', 'nobody']),
  allow: z.array(z.string().max(64)).max(200),
  deny: z.array(z.string().max(64)).max(200),
});
const updatePrivacySchema = z.object({
  privacy: z.object({
    online: privacyRuleSchema,
    friends: privacyRuleSchema,
    personalInfo: privacyRuleSchema,
    favorites: privacyRuleSchema,
    messages: privacyRuleSchema,
  }),
}) satisfies z.ZodType<UpdatePrivacyRequest>;

interface DbUserCore {
  id: string;
  publicId: string;
  email: string;
  username: string;
  avatarSeed: string;
  avatarUrl: string | null;
  bio: string | null;
  gender: string | null;
  birthDate: Date | null;
  city: string | null;
  createdAt: Date;
}

function toAuthUser(u: DbUserCore): AuthUser {
  return {
    id: u.id,
    publicId: u.publicId,
    email: u.email,
    username: u.username,
    avatarSeed: u.avatarSeed,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    gender: (u.gender as Gender | null) ?? null,
    birthDate: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : null,
    city: u.city ?? null,
    kind: 'user',
    createdAt: u.createdAt.toISOString(),
    isAdmin: isAdminEmail(u.email),
  };
}

function buildPrincipal(u: DbUserCore, sid: string): Principal {
  return {
    kind: 'user',
    userId: u.id,
    username: u.username,
    avatarSeed: u.avatarSeed,
    avatarUrl: u.avatarUrl,
    sid,
  };
}

/** Перевыпускает session-JWT с тем же sid и возвращает свежего пользователя. */
function issue(app: FastifyInstance, u: DbUserCore, sid: string): ProfileMutationResponse {
  const token = signSession(app, buildPrincipal(u, sid));
  return { token, user: toAuthUser(u) };
}

function deny(reply: FastifyReply, status: number, error: string, message: string): void {
  reply.code(status).send({ error, message, statusCode: status });
}

/**
 * Гарантирует, что запрос сделан зарегистрированным пользователем (не гостем),
 * и возвращает его принципала. Иначе отвечает 403 и возвращает null.
 */
function requireUser(req: FastifyRequest, reply: FastifyReply): Extract<Principal, { kind: 'user' }> | null {
  const principal = req.principal!;
  if (principal.kind !== 'user') {
    deny(reply, 403, 'Forbidden', 'Доступно только зарегистрированным пользователям');
    return null;
  }
  return principal;
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
          publicId: generatePublicId(),
        },
      });
      const session = await createSession(user.id, req);
      const token = signSession(app, buildPrincipal(user, session.id));
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
      if (user.isBlocked) {
        reply.code(403).send({
          error: 'Forbidden',
          message: 'Ваш аккаунт заблокирован',
          statusCode: 403,
        });
        return;
      }
      const session = await createSession(user.id, req);
      const token = signSession(app, buildPrincipal(user, session.id));
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
        publicId: guestId,
        email: null,
        username: principal.username,
        avatarSeed,
        avatarUrl: null,
        bio: null,
        gender: null,
        birthDate: null,
        city: null,
        kind: 'guest',
        createdAt: new Date().toISOString(),
        isAdmin: false,
      };
      reply.send({ token, user } satisfies AuthResponse);
    },
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const principal = req.principal!;
    if (principal.kind === 'guest') {
      const user: AuthUser = {
        id: principal.userId,
        publicId: principal.userId,
        email: null,
        username: principal.username,
        avatarSeed: principal.avatarSeed,
        avatarUrl: null,
        bio: null,
        gender: null,
        birthDate: null,
        city: null,
        kind: 'guest',
        createdAt: new Date(0).toISOString(),
        isAdmin: false,
      };
      reply.send({ user } satisfies MeResponse);
      return;
    }
    const dbUser = await prisma.user.findUnique({ where: { id: principal.userId } });
    if (!dbUser) {
      reply.code(401).send({ error: 'Unauthorized', message: 'User no longer exists', statusCode: 401 });
      return;
    }
    // Легаси-токен без серверной сессии: создаём Session и перевыпускаем токен
    // с sid, чтобы устройство появилось в списке без ручного перелогина.
    if (!principal.sid) {
      const session = await createSession(dbUser.id, req);
      const token = signSession(app, buildPrincipal(dbUser, session.id));
      reply.send({ user: toAuthUser(dbUser), token } satisfies MeResponse);
      return;
    }
    reply.send({ user: toAuthUser(dbUser) } satisfies MeResponse);
  });

  // ── Профиль: ник / bio / сброс аватара на градиент ─────────────────────
  app.patch('/auth/profile', { preHandler: requireAuth }, async (req, reply) => {
    const principal = requireUser(req, reply);
    if (!principal) return;
    const body = updateProfileSchema.parse(req.body);

    const data: {
      username?: string;
      bio?: string | null;
      gender?: string | null;
      birthDate?: Date | null;
      city?: string | null;
      avatarSeed?: string;
      avatarUrl?: null;
    } = {};

    if (body.username !== undefined) {
      const taken = await prisma.user.findFirst({
        where: { username: body.username, id: { not: principal.userId } },
        select: { id: true },
      });
      if (taken) {
        deny(reply, 409, 'Conflict', 'Username already taken');
        return;
      }
      data.username = body.username;
    }
    if (body.bio !== undefined) {
      const trimmed = body.bio?.trim() ?? '';
      data.bio = trimmed.length > 0 ? trimmed : null;
    }
    if (body.gender !== undefined) {
      data.gender = body.gender ?? null;
    }
    if (body.birthDate !== undefined) {
      data.birthDate = body.birthDate ? new Date(`${body.birthDate}T00:00:00.000Z`) : null;
    }
    if (body.city !== undefined) {
      const trimmed = body.city?.trim() ?? '';
      data.city = trimmed.length > 0 ? trimmed : null;
    }
    // avatarSeed присутствует в body → сброс на градиент: новый/указанный seed
    // и очистка загруженной картинки (с удалением файла).
    let oldAvatarToDelete: string | null = null;
    if (body.avatarSeed !== undefined) {
      const current = await prisma.user.findUnique({
        where: { id: principal.userId },
        select: { avatarUrl: true },
      });
      oldAvatarToDelete = current?.avatarUrl ?? null;
      data.avatarSeed = body.avatarSeed && body.avatarSeed.length > 0 ? body.avatarSeed : generateAvatarSeed();
      data.avatarUrl = null;
    }

    const updated = await prisma.user.update({ where: { id: principal.userId }, data });
    if (oldAvatarToDelete) await deleteAvatarFile(oldAvatarToDelete);
    reply.send(issue(app, updated, principal.sid!) satisfies ProfileMutationResponse);
  });

  // ── Настройки приватности ──────────────────────────────────────────────
  app.get('/auth/privacy', { preHandler: requireAuth }, async (req, reply) => {
    const principal = requireUser(req, reply);
    if (!principal) return;
    const u = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { privacyJson: true },
    });
    reply.send({ privacy: parsePrivacy(u?.privacyJson) } satisfies PrivacyResponse);
  });

  app.patch('/auth/privacy', { preHandler: requireAuth }, async (req, reply) => {
    const principal = requireUser(req, reply);
    if (!principal) return;
    const body = updatePrivacySchema.parse(req.body);
    const json = serializePrivacy(body.privacy);
    await prisma.user.update({ where: { id: principal.userId }, data: { privacyJson: json } });
    // Онлайн-статус мог стать видимым/скрытым для части людей — переразошлём
    // гейтнутый презенс, чтобы изменения применились без перезахода.
    userHub.republishPresence(principal.userId);
    reply.send({ privacy: parsePrivacy(json) } satisfies UpdatePrivacyResponse);
  });

  // ── Смена email (подтверждение текущим паролем) ────────────────────────
  app.post('/auth/email', { preHandler: requireAuth }, async (req, reply) => {
    const principal = requireUser(req, reply);
    if (!principal) return;
    const body = changeEmailSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: principal.userId } });
    if (!user) {
      deny(reply, 401, 'Unauthorized', 'User no longer exists');
      return;
    }
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      deny(reply, 401, 'Unauthorized', 'Неверный текущий пароль');
      return;
    }
    if (body.email !== user.email) {
      const taken = await prisma.user.findFirst({
        where: { email: body.email, id: { not: principal.userId } },
        select: { id: true },
      });
      if (taken) {
        deny(reply, 409, 'Conflict', 'Email already in use');
        return;
      }
    }
    const updated = await prisma.user.update({
      where: { id: principal.userId },
      data: { email: body.email },
    });
    reply.send(issue(app, updated, principal.sid!) satisfies ProfileMutationResponse);
  });

  // ── Смена пароля (по умолчанию завершает остальные сессии) ─────────────
  app.post('/auth/password', { preHandler: requireAuth }, async (req, reply) => {
    const principal = requireUser(req, reply);
    if (!principal) return;
    const body = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: principal.userId } });
    if (!user) {
      deny(reply, 401, 'Unauthorized', 'User no longer exists');
      return;
    }
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      deny(reply, 401, 'Unauthorized', 'Неверный текущий пароль');
      return;
    }
    const passwordHash = await hashPassword(body.newPassword);
    const updated = await prisma.user.update({
      where: { id: principal.userId },
      data: { passwordHash },
    });
    // Безопасность: завершаем все прочие сессии этого пользователя.
    if (principal.sid) {
      await prisma.session.deleteMany({
        where: { userId: principal.userId, id: { not: principal.sid } },
      });
    }
    reply.send(issue(app, updated, principal.sid!) satisfies ProfileMutationResponse);
  });

  // ── Загрузка аватара (multipart) ───────────────────────────────────────
  app.post('/auth/avatar', { preHandler: requireAuth }, async (req, reply) => {
    const principal = requireUser(req, reply);
    if (!principal) return;

    const file = await req.file({ limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });
    if (!file) {
      deny(reply, 400, 'BadRequest', 'Файл не получен');
      return;
    }
    if (!ALLOWED_AVATAR_MIME.has(file.mimetype)) {
      deny(reply, 400, 'BadRequest', 'Поддерживаются только JPEG, PNG и WebP');
      return;
    }
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      deny(reply, 400, 'BadRequest', 'Файл слишком большой (макс. 5 МБ)');
      return;
    }
    if (file.file.truncated) {
      deny(reply, 400, 'BadRequest', 'Файл слишком большой (макс. 5 МБ)');
      return;
    }

    let avatarUrl: string;
    try {
      avatarUrl = await processAndSaveAvatar(principal.userId, buffer);
    } catch {
      deny(reply, 400, 'BadRequest', 'Не удалось обработать изображение');
      return;
    }

    const current = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { avatarUrl: true },
    });
    const updated = await prisma.user.update({
      where: { id: principal.userId },
      data: { avatarUrl },
    });
    if (current?.avatarUrl) await deleteAvatarFile(current.avatarUrl);
    reply.send(issue(app, updated, principal.sid!) satisfies UploadAvatarResponse);
  });

  // ── Тикет для пользовательского realtime-канала (/ws/user) ────────────
  app.get('/auth/realtime-ticket', { preHandler: requireAuth }, async (req, reply) => {
    const principal = requireUser(req, reply);
    if (!principal) return;
    const ticket = signUserTicket(app, principal, 120);
    reply.send({ ticket } satisfies RealtimeTicketResponse);
  });

  // ── Список устройств/сессий ────────────────────────────────────────────
  app.get('/auth/sessions', { preHandler: requireAuth }, async (req, reply) => {
    const principal = requireUser(req, reply);
    if (!principal) return;
    const sessions = (await prisma.session.findMany({
      where: { userId: principal.userId },
      orderBy: { lastSeenAt: 'desc' },
    })) as DbSession[];
    const response: ListSessionsResponse = {
      sessions: sessions.map((s) => toDeviceSession(s, principal.sid)),
    };
    reply.send(response);
  });

  // ── Выход с конкретного устройства ─────────────────────────────────────
  app.delete('/auth/sessions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const principal = requireUser(req, reply);
    if (!principal) return;
    const { id } = req.params as { id: string };
    const result = await prisma.session.deleteMany({
      where: { id, userId: principal.userId },
    });
    if (result.count === 0) {
      deny(reply, 404, 'NotFound', 'Сессия не найдена');
      return;
    }
    forgetTouch(id);
    reply.send({ id } satisfies RevokeSessionResponse);
  });

  // ── Выход со всех устройств, кроме текущего ─────────────────────────────
  app.delete('/auth/sessions', { preHandler: requireAuth }, async (req, reply) => {
    const principal = requireUser(req, reply);
    if (!principal) return;
    const result = await prisma.session.deleteMany({
      where: { userId: principal.userId, ...(principal.sid ? { id: { not: principal.sid } } : {}) },
    });
    reply.send({ revoked: result.count } satisfies RevokeOtherSessionsResponse);
  });
}
