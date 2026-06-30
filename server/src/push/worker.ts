import type { PushPayload } from '@vellin/shared';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { isPushEnabled } from './vapid.js';
import { sendToSubscription } from './webpush.js';
import { getTemplate } from './templates.js';
import { markUsed, markFailure } from './deviceRegistry.js';
import { recordDelivery } from './delivery.js';
import {
  claimBatch,
  markDead,
  markSent,
  pruneJobs,
  reclaimSending,
  reschedule,
  type ClaimedJob,
} from './queue.js';

const POLL_MS = 2000;
const BATCH = 50;
const PRUNE_EVERY_TICKS = 1800; // ~ каждый час при POLL_MS=2с

let timer: ReturnType<typeof setInterval> | null = null;
let ticks = 0;
let running = false;

/** Отправить один заклеймленный джоб: загрузить подписку, послать, залогировать. */
async function processJob(job: ClaimedJob): Promise<void> {
  const sub = await prisma.pushSubscription.findUnique({ where: { id: job.subscriptionId } });
  if (!sub || !sub.active) {
    await markDead(job.id, 'subscription inactive/missing');
    return;
  }
  const tpl = await getTemplate(job.type);
  const ttl = tpl?.ttl ?? 86400;
  const urgency = tpl?.urgency ?? 'normal';

  let payload: PushPayload;
  try {
    payload = JSON.parse(job.payloadJson) as PushPayload;
  } catch {
    await markDead(job.id, 'bad payload json');
    return;
  }
  // jobId — в payload для click-аналитики (Фаза 3 пометит clicked по нему).
  payload.data = { ...payload.data, jobId: job.id };

  const res = await sendToSubscription(sub, payload, { ttl, urgency });
  if (res.ok) {
    await markSent(job.id);
    await markUsed(sub.id);
    await recordDelivery({
      jobId: job.id,
      userId: job.userId,
      subscriptionId: sub.id,
      type: job.type,
      status: 'sent',
      browser: sub.browser,
      os: sub.os,
    });
    return;
  }
  if (res.gone) {
    await markDead(job.id, `gone (${res.statusCode})`);
    await markFailure(sub.id, true);
    await recordDelivery({
      jobId: job.id,
      userId: job.userId,
      subscriptionId: sub.id,
      type: job.type,
      status: 'expired',
      error: `gone ${res.statusCode}`,
      browser: sub.browser,
      os: sub.os,
    });
    return;
  }
  // Временная ошибка — ретрай с бэкоффом.
  await reschedule(job, `status ${res.statusCode ?? 'network'}`);
  await markFailure(sub.id, false);
  await recordDelivery({
    jobId: job.id,
    userId: job.userId,
    subscriptionId: sub.id,
    type: job.type,
    status: 'failed',
    error: `status ${res.statusCode ?? 'network'}`,
    browser: sub.browser,
    os: sub.os,
  });
}

/** Один проход воркера: забрать батч и отправить параллельно. */
async function tick(): Promise<void> {
  if (running || !isPushEnabled()) return;
  running = true;
  try {
    const jobs = await claimBatch(BATCH);
    if (jobs.length > 0) {
      await Promise.all(jobs.map((j) => processJob(j).catch((err) => logger.error({ err, jobId: j.id }, 'push job failed'))));
    }
    ticks += 1;
    if (ticks % PRUNE_EVERY_TICKS === 0) {
      const pruned = await pruneJobs();
      if (pruned > 0) logger.info({ pruned }, 'push: pruned old jobs');
    }
  } catch (err) {
    logger.error({ err }, 'push worker tick failed');
  } finally {
    running = false;
  }
}

/**
 * Запустить фоновый воркер очереди push. In-process, один таймер; масштабируется
 * выносом в отдельный процесс (та же таблица, claim через SKIP LOCKED безопасен
 * для нескольких воркеров). No-op, если push выключен (нет VAPID).
 */
export function startPushWorker(): void {
  if (timer || !isPushEnabled()) return;
  void reclaimSending().then((n) => {
    if (n > 0) logger.info({ reclaimed: n }, 'push: reclaimed stuck sending jobs');
  });
  timer = setInterval(() => void tick(), POLL_MS);
  logger.info('push worker started');
}

export function stopPushWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
