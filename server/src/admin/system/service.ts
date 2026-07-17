import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  HealthCheck,
  HealthSnapshot,
  HealthStatus,
  PerfSnapshot,
  RecentError,
  SystemJobDTO,
  SystemJobsResponse,
  WsSnapshot,
} from '@vellin/shared';
import { prisma } from '../../db/prisma.js';
import { userHub } from '../../realtime/UserHub.js';
import { roomStore } from '../../rooms/store.js';
import { loadEnv } from '../../env.js';
import { isPushEnabled } from '../../push/vapid.js';
import { enqueueTranscode } from '../../dm/videoTranscode.js';
import { getCpuPercent, getErrors, getRequests, getWsEventRate } from './metrics.js';

const execFileAsync = promisify(execFile);

function toRecentErrors(): RecentError[] {
  return getErrors().map((e) => ({ ts: new Date(e.ts).toISOString(), where: e.where, message: e.message }));
}

// ── WebSocket ────────────────────────────────────────────────────────────────
export function getWsSnapshot(): WsSnapshot {
  const hub = userHub.stats();
  const runtimes = roomStore.list();
  const rooms = runtimes
    .map((rt) => ({ roomId: rt.roomId, slug: rt.slug, name: rt.name, participants: rt.participants.size }))
    .sort((a, b) => b.participants - a.participants);
  const roomSessions = rooms.reduce((s, r) => s + r.participants, 0);
  const rate = getWsEventRate();
  return {
    connections: hub.connections,
    distinctUsers: hub.distinctUsers,
    online: hub.online,
    watchers: hub.watchers,
    librarySubs: hub.librarySubs,
    roomSessions,
    activeRooms: rooms.length,
    rooms: rooms.slice(0, 50),
    eventTotal: rate.total,
    eventPerSec: rate.perSec,
    recentErrors: toRecentErrors(),
  };
}

// ── Производительность ─────────────────────────────────────────────────────────
const MB = 1024 * 1024;
export function getPerfSnapshot(): PerfSnapshot {
  const now = Date.now();
  const ring = getRequests();
  const last1m = ring.filter((r) => now - r.ts < 60_000);
  const count = last1m.length;
  const errorCount = last1m.filter((r) => r.status >= 500).length;
  const sorted = [...last1m].map((r) => r.ms).sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
  const avg = count ? Math.round((last1m.reduce((s, r) => s + r.ms, 0) / count) * 10) / 10 : 0;

  const byRouteMap = new Map<string, { count: number; total: number; max: number }>();
  for (const r of last1m) {
    const cur = byRouteMap.get(r.route) ?? { count: 0, total: 0, max: 0 };
    cur.count += 1;
    cur.total += r.ms;
    cur.max = Math.max(cur.max, r.ms);
    byRouteMap.set(r.route, cur);
  }
  const byRoute = [...byRouteMap.entries()]
    .map(([route, v]) => ({ route, count: v.count, avgMs: Math.round((v.total / v.count) * 10) / 10, maxMs: Math.round(v.max) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const slowest = [...ring]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8)
    .map((r) => ({ route: `${r.method} ${r.route}`, ms: Math.round(r.ms), status: r.status, ts: new Date(r.ts).toISOString() }));

  const mem = process.memoryUsage();
  return {
    uptimeSec: Math.round(process.uptime()),
    memory: {
      rssMb: Math.round((mem.rss / MB) * 10) / 10,
      heapUsedMb: Math.round((mem.heapUsed / MB) * 10) / 10,
      heapTotalMb: Math.round((mem.heapTotal / MB) * 10) / 10,
      externalMb: Math.round((mem.external / MB) * 10) / 10,
    },
    cpuPercent: getCpuPercent(),
    requests: {
      last1m: count,
      rps: Math.round((count / 60) * 10) / 10,
      errorRate: count ? Math.round((errorCount / count) * 1000) / 10 : 0,
      avgMs: avg,
      p95Ms: Math.round(p95),
    },
    slowest,
    byRoute,
    recentErrors: toRecentErrors(),
  };
}

// ── Health ─────────────────────────────────────────────────────────────────────
let ffmpegCache: { at: number; ok: boolean; detail: string } | null = null;

async function checkFfmpeg(): Promise<HealthCheck> {
  if (ffmpegCache && Date.now() - ffmpegCache.at < 60_000) {
    return { name: 'ffmpeg', status: ffmpegCache.ok ? 'ok' : 'down', latencyMs: null, detail: ffmpegCache.detail };
  }
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version'], { timeout: 4000 });
    const ver = stdout.split('\n')[0]?.slice(0, 60) ?? 'ffmpeg';
    ffmpegCache = { at: Date.now(), ok: true, detail: ver };
    return { name: 'ffmpeg', status: 'ok', latencyMs: null, detail: ver };
  } catch {
    ffmpegCache = { at: Date.now(), ok: false, detail: 'ffmpeg не найден в PATH' };
    return { name: 'ffmpeg', status: 'down', latencyMs: null, detail: 'ffmpeg не найден в PATH' };
  }
}

async function checkDb(): Promise<HealthCheck> {
  const t = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - t;
    return { name: 'PostgreSQL', status: ms > 500 ? 'degraded' : 'ok', latencyMs: ms, detail: null };
  } catch (err) {
    return { name: 'PostgreSQL', status: 'down', latencyMs: null, detail: (err as Error).message.slice(0, 120) };
  }
}

async function checkQueues(): Promise<HealthCheck> {
  const [pending, dead, processing] = await Promise.all([
    prisma.pushJob.count({ where: { status: 'pending' } }),
    prisma.pushJob.count({ where: { status: 'dead' } }),
    prisma.directMessage.count({ where: { videoStatus: 'processing' } }),
  ]);
  const status: HealthStatus = pending > 1000 || dead > 100 ? 'degraded' : 'ok';
  return { name: 'Очереди', status, latencyMs: null, detail: `push: ${pending} в ожидании, ${dead} мёртвых · транскод: ${processing}` };
}

export async function getHealth(): Promise<HealthSnapshot> {
  const env = loadEnv();
  const [db, queues, ffmpeg] = await Promise.all([checkDb(), checkQueues(), checkFfmpeg()]);
  const push: HealthCheck = isPushEnabled()
    ? { name: 'Web Push (VAPID)', status: 'ok', latencyMs: null, detail: 'VAPID настроен' }
    : { name: 'Web Push (VAPID)', status: 'disabled', latencyMs: null, detail: 'VAPID-ключи не заданы' };
  const kinopoisk: HealthCheck = env.KINOPOISK_TOKEN
    ? { name: 'kinopoisk.dev', status: 'ok', latencyMs: null, detail: 'токен задан' }
    : { name: 'kinopoisk.dev', status: 'disabled', latencyMs: null, detail: 'токен не задан' };
  const ws: HealthCheck = { name: 'WebSocket-хаб', status: 'ok', latencyMs: null, detail: `${userHub.stats().online} онлайн` };

  const checks = [db, ws, queues, ffmpeg, push, kinopoisk];
  // Итог: down если что-то критичное упало (БД/WS), иначе degraded/ok.
  const critical = [db, ws];
  const overall: HealthStatus = critical.some((c) => c.status === 'down')
    ? 'down'
    : checks.some((c) => c.status === 'degraded' || c.status === 'down')
      ? 'degraded'
      : 'ok';
  return { overall, checks, serverTime: new Date().toISOString() };
}

// ── Фоновые задачи ─────────────────────────────────────────────────────────────
export async function listJobs(): Promise<SystemJobsResponse> {
  const [counts, pushRows, transcodeRows, processingCount] = await Promise.all([
    prisma.pushJob.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.pushJob.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
    prisma.directMessage.findMany({
      where: { videoStatus: { in: ['processing', 'failed'] } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, videoStatus: true, createdAt: true },
    }),
    prisma.directMessage.count({ where: { videoStatus: 'processing' } }),
  ]);
  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c.status] = c._count._all;

  const pushJobs: SystemJobDTO[] = pushRows.map((j) => ({
    id: j.id,
    kind: 'push',
    status: j.status,
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    label: j.type,
    nextAttemptAt: j.nextAttemptAt.toISOString(),
    lastError: j.lastError,
    createdAt: j.createdAt.toISOString(),
  }));
  const transcodeJobs: SystemJobDTO[] = transcodeRows.map((m) => ({
    id: m.id,
    kind: 'transcode',
    status: m.videoStatus ?? 'unknown',
    attempts: 0,
    maxAttempts: 1,
    label: 'видеосообщение',
    nextAttemptAt: null,
    lastError: null,
    createdAt: m.createdAt.toISOString(),
  }));
  return {
    push: { counts: countMap, jobs: pushJobs },
    transcode: { processing: processingCount, jobs: transcodeJobs },
  };
}

/** Повторить задачу. push → сброс в pending; transcode → повторная постановка. */
export async function retryJob(kind: 'push' | 'transcode', id: string): Promise<boolean> {
  if (kind === 'push') {
    const res = await prisma.pushJob.updateMany({
      where: { id },
      data: { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    return res.count > 0;
  }
  const msg = await prisma.directMessage.findUnique({ where: { id }, select: { id: true } });
  if (!msg) return false;
  await prisma.directMessage.update({ where: { id }, data: { videoStatus: 'processing' } });
  enqueueTranscode(id);
  return true;
}

/** Отменить задачу. push → dead; transcode → failed. */
export async function cancelJob(kind: 'push' | 'transcode', id: string): Promise<boolean> {
  if (kind === 'push') {
    const res = await prisma.pushJob.updateMany({ where: { id }, data: { status: 'dead', lastError: 'отменено администратором' } });
    return res.count > 0;
  }
  const res = await prisma.directMessage.updateMany({ where: { id, videoStatus: 'processing' }, data: { videoStatus: 'failed' } });
  return res.count > 0;
}

/** Очистить завершённые push-джобы (sent + dead). Возвращает число удалённых. */
export async function purgePushJobs(): Promise<number> {
  const res = await prisma.pushJob.deleteMany({ where: { status: { in: ['sent', 'dead'] } } });
  return res.count;
}
