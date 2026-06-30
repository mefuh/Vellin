import { Prisma } from '@prisma/client';
import type { PushNotificationType, PushPayload } from '@vellin/shared';
import { prisma } from '../db/prisma.js';

/** Claim-результат: ровно то, что нужно воркеру для отправки. */
export interface ClaimedJob {
  id: string;
  userId: string;
  subscriptionId: string;
  type: PushNotificationType;
  payloadJson: string;
  attempts: number;
  maxAttempts: number;
}

const BACKOFF_BASE_MS = 30_000; // 30с
const BACKOFF_MAX_MS = 30 * 60_000; // 30 мин

/**
 * Поставить доставку в очередь (одна запись = один payload на одну подписку).
 * Если задан dedupeKey и уже есть pending-джоб с ним — обновляем его (свежий
 * payload, сброс попыток, немедленная готовность), а не плодим дубль.
 */
export async function enqueue(
  userId: string,
  subscriptionId: string,
  type: PushNotificationType,
  payload: PushPayload,
  dedupeKey?: string,
): Promise<void> {
  const payloadJson = JSON.stringify(payload);
  if (dedupeKey) {
    const updated = await prisma.pushJob.updateMany({
      where: { dedupeKey, subscriptionId, status: 'pending' },
      data: { payloadJson, attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    if (updated.count > 0) return;
  }
  await prisma.pushJob.create({
    data: { userId, subscriptionId, type, payloadJson, dedupeKey: dedupeKey ?? null },
  });
}

/**
 * Атомарно забрать батч готовых джобов: одним UPDATE … RETURNING с
 * `FOR UPDATE SKIP LOCKED` — параллельные воркеры не возьмут одни и те же строки.
 */
export async function claimBatch(limit: number): Promise<ClaimedJob[]> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
    UPDATE "PushJob" SET status = 'sending', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "PushJob"
      WHERE status = 'pending' AND "nextAttemptAt" <= NOW()
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "userId", "subscriptionId", type, "payloadJson", attempts, "maxAttempts";
  `);
  return rows;
}

/** Успешная отправка — закрыть джоб. */
export async function markSent(id: string): Promise<void> {
  await prisma.pushJob.update({
    where: { id },
    data: { status: 'sent', sentAt: new Date(), lastError: null },
  }).catch(() => {});
}

/** Подписка мертва (404/410) — ретраить бессмысленно, закрываем как dead. */
export async function markDead(id: string, error: string): Promise<void> {
  await prisma.pushJob.update({
    where: { id },
    data: { status: 'dead', lastError: error.slice(0, 300) },
  }).catch(() => {});
}

/**
 * Временная ошибка — перенести с экспоненциальным бэкоффом (+джиттер). Если
 * попытки исчерпаны (attempts ≥ maxAttempts) — пометить dead.
 */
export async function reschedule(job: ClaimedJob, error: string): Promise<void> {
  if (job.attempts >= job.maxAttempts) {
    await markDead(job.id, error);
    return;
  }
  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (job.attempts - 1), BACKOFF_MAX_MS);
  const jitter = Math.floor(Math.random() * 5000);
  await prisma.pushJob.update({
    where: { id: job.id },
    data: {
      status: 'pending',
      nextAttemptAt: new Date(Date.now() + backoff + jitter),
      lastError: error.slice(0, 300),
    },
  }).catch(() => {});
}

/** Удалить старые завершённые джобы (sent/dead) — чтобы таблица не пухла. */
export async function pruneJobs(olderThanMs = 7 * 24 * 60 * 60_000): Promise<number> {
  const res = await prisma.pushJob.deleteMany({
    where: { status: { in: ['sent', 'dead'] }, createdAt: { lt: new Date(Date.now() - olderThanMs) } },
  });
  return res.count;
}

/**
 * Восстановление после краша: на старте воркера всё, что зависло в `sending`
 * (процесс упал в момент отправки), возвращаем в `pending` для повторной попытки.
 * Батч обрабатывается синхронно в одном тике, поэтому штатно `sending` не висит.
 */
export async function reclaimSending(): Promise<number> {
  const res = await prisma.pushJob.updateMany({
    where: { status: 'sending' },
    data: { status: 'pending' },
  });
  return res.count;
}
