import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { HealthSnapshot, PerfSnapshot, SystemJobsResponse, WsSnapshot } from '@vellin/shared';
import { requirePermission } from '../rbac/middleware.js';
import { writeAudit } from '../audit/audit.js';
import {
  cancelJob,
  getHealth,
  getPerfSnapshot,
  getWsSnapshot,
  listJobs,
  purgePushJobs,
  retryJob,
} from './service.js';

const kindSchema = z.enum(['push', 'transcode']);

/**
 * Системный мониторинг: WebSocket, производительность, health-checks и фоновые
 * задачи. Просмотр — за system.view; действия над задачами — за jobs.manage.
 */
export async function adminSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/system/ws', { preHandler: requirePermission('system.view') }, async (_req, reply) => {
    reply.send(getWsSnapshot() satisfies WsSnapshot);
  });

  app.get('/admin/system/perf', { preHandler: requirePermission('system.view') }, async (_req, reply) => {
    reply.send(getPerfSnapshot() satisfies PerfSnapshot);
  });

  app.get('/admin/system/health', { preHandler: requirePermission('system.view') }, async (_req, reply) => {
    reply.send((await getHealth()) satisfies HealthSnapshot);
  });

  app.get('/admin/system/jobs', { preHandler: requirePermission('system.view') }, async (_req, reply) => {
    reply.send((await listJobs()) satisfies SystemJobsResponse);
  });

  app.post<{ Params: { kind: string; id: string } }>(
    '/admin/system/jobs/:kind/:id/retry',
    { preHandler: requirePermission('jobs.manage') },
    async (req, reply) => {
      const kind = kindSchema.parse(req.params.kind);
      const ok = await retryJob(kind, req.params.id);
      if (!ok) {
        reply.code(404).send({ error: 'NotFound', message: 'Задача не найдена', statusCode: 404 });
        return;
      }
      await writeAudit(req, 'jobs.retry', { type: 'job', id: req.params.id, label: kind });
      reply.code(204).send();
    },
  );

  app.post<{ Params: { kind: string; id: string } }>(
    '/admin/system/jobs/:kind/:id/cancel',
    { preHandler: requirePermission('jobs.manage') },
    async (req, reply) => {
      const kind = kindSchema.parse(req.params.kind);
      const ok = await cancelJob(kind, req.params.id);
      if (!ok) {
        reply.code(404).send({ error: 'NotFound', message: 'Задача не найдена', statusCode: 404 });
        return;
      }
      await writeAudit(req, 'jobs.cancel', { type: 'job', id: req.params.id, label: kind });
      reply.code(204).send();
    },
  );

  app.post('/admin/system/jobs/purge', { preHandler: requirePermission('jobs.manage') }, async (req, reply) => {
    const count = await purgePushJobs();
    await writeAudit(req, 'jobs.purge', { type: 'job' }, { meta: { count } });
    reply.send({ count });
  });
}
