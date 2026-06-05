import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { IceServerConfig, RtcConfig } from '@vellin/shared';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  WS_TICKET_TTL_SEC: z.coerce.number().int().positive().default(60),
  /**
   * Каталог для загруженных файлов (аватары). В dev — локальная папка рядом с
   * сервером; в Docker монтируется на volume, чтобы пережить рестарт.
   */
  UPLOADS_DIR: z.string().default('./uploads'),
  /** Optional JSON-encoded RTCIceServer[] appended to the default STUN. */
  ICE_SERVERS: z.string().optional(),
  /**
   * TURN (coturn) для прохождения симметричного NAT/CGNAT — без него звонки
   * между разными сетями не устанавливаются. Если оба заданы, сервер выдаёт
   * клиенту эфемерные креды (TURN REST: username=expiry, credential=HMAC-SHA1).
   * TURN_SECRET = static-auth-secret из turnserver.conf.
   * TURN_URLS = список turn:-URL через запятую, напр.
   *   turn:vellin.ru:3478?transport=udp,turn:vellin.ru:3478?transport=tcp
   */
  TURN_SECRET: z.string().optional(),
  TURN_URLS: z.string().optional(),
  /** Время жизни эфемерных TURN-кредов в секундах (по умолчанию 1 час). */
  TURN_TTL_SEC: z.coerce.number().int().positive().default(3600),
  /**
   * Токен kinopoisk.dev для поиска фильмов/сериалов (избранное в профиле).
   * Выдаётся бесплатно ботом @kinopoiskdev_bot. Без него эндпоинт поиска
   * возвращает 503 — остальное приложение работает как обычно.
   */
  KINOPOISK_TOKEN: z.string().optional(),
  /**
   * Email главного администратора сервиса. Любой пользователь с таким email
   * автоматически получает isAdmin=true и доступ к /api/admin/*.
   * Сравнение case-insensitive с trim. Без значения панель недоступна никому.
   * Принимает пустую строку — docker compose `${VAR:-}` всегда пробрасывает
   * значение, даже когда переменная не задана.
   */
  ADMIN_EMAIL: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase())
    .pipe(z.union([z.literal(''), z.string().email()]))
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type AppEnv = z.infer<typeof schema>;

let cached: AppEnv | null = null;

export function loadEnv(): AppEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:\n', parsed.error.format());
    throw new Error('Failed to load environment');
  }
  cached = parsed.data;
  return cached;
}

/** Главный администратор задаётся через email в .env. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const target = loadEnv().ADMIN_EMAIL;
  if (!target) return false;
  return email.trim().toLowerCase() === target;
}

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

// Статичные extra-серверы из ICE_SERVERS парсим один раз.
let cachedExtra: IceServerConfig[] | null = null;
function parseExtraIceServers(): IceServerConfig[] {
  if (cachedExtra) return cachedExtra;
  const raw = loadEnv().ICE_SERVERS;
  cachedExtra = (() => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) throw new Error('not an array');
      return parsed as IceServerConfig[];
    } catch (err) {
      console.warn(`ICE_SERVERS env is not valid JSON array — ignoring (${(err as Error).message})`);
      return [];
    }
  })();
  return cachedExtra;
}

/**
 * Эфемерные TURN-креды по схеме TURN REST (coturn `use-auth-secret`):
 *   username   = <unix-время-истечения>
 *   credential = base64(HMAC-SHA1(static-auth-secret, username))
 * Креды короткоживущие, поэтому их нельзя «украсть» и гонять релей бесконечно.
 */
function buildTurnServer(): IceServerConfig | null {
  const env = loadEnv();
  if (!env.TURN_SECRET || !env.TURN_URLS) return null;
  const urls = env.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean);
  if (urls.length === 0) return null;
  const username = String(Math.floor(Date.now() / 1000) + env.TURN_TTL_SEC);
  const credential = createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
  return { urls, username, credential };
}

/**
 * ICE config exposed to clients — default STUN, any user-supplied servers, and
 * (if configured) a TURN server with freshly-minted ephemeral credentials.
 * NOT cached: TURN creds are time-limited and re-minted per call.
 */
export function getRtcConfig(): RtcConfig {
  const turn = buildTurnServer();
  return {
    iceServers: [...DEFAULT_ICE_SERVERS, ...parseExtraIceServers(), ...(turn ? [turn] : [])],
  };
}
