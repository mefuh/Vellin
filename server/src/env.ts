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
  /** Optional JSON-encoded RTCIceServer[] appended to the default STUN. */
  ICE_SERVERS: z.string().optional(),
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

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

let cachedRtc: RtcConfig | null = null;

/** ICE config exposed to clients — default STUN plus any user-supplied servers. */
export function getRtcConfig(): RtcConfig {
  if (cachedRtc) return cachedRtc;
  const raw = loadEnv().ICE_SERVERS;
  const extra: IceServerConfig[] = (() => {
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
  cachedRtc = { iceServers: [...DEFAULT_ICE_SERVERS, ...extra] };
  return cachedRtc;
}
