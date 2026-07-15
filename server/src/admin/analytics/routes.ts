import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  AnalyticsOverview,
  AnalyticsRange,
  RoomsAnalytics,
  SharedWatchAnalytics,
  SocialAnalytics,
  UsersAnalytics,
} from '@vellin/shared';
import { requirePermission } from '../rbac/middleware.js';
import {
  buildOverview,
  buildRoomsAnalytics,
  buildSharedWatchAnalytics,
  buildSocialAnalytics,
  buildUsersAnalytics,
} from './service.js';

const rangeSchema = z.object({ range: z.enum(['7d', '30d', '90d']).default('30d') });

function parseRange(query: unknown): AnalyticsRange {
  return rangeSchema.parse(query ?? {}).range;
}

/** Аналитика платформы. Все разделы — только за analytics.view. */
export async function adminAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/analytics/overview', { preHandler: requirePermission('analytics.view') }, async (_req, reply) => {
    reply.send((await buildOverview()) satisfies AnalyticsOverview);
  });

  app.get('/admin/analytics/users', { preHandler: requirePermission('analytics.view') }, async (req, reply) => {
    reply.send((await buildUsersAnalytics(parseRange(req.query))) satisfies UsersAnalytics);
  });

  app.get('/admin/analytics/rooms', { preHandler: requirePermission('analytics.view') }, async (req, reply) => {
    reply.send((await buildRoomsAnalytics(parseRange(req.query))) satisfies RoomsAnalytics);
  });

  app.get('/admin/analytics/shared-watch', { preHandler: requirePermission('analytics.view') }, async (_req, reply) => {
    reply.send((await buildSharedWatchAnalytics()) satisfies SharedWatchAnalytics);
  });

  app.get('/admin/analytics/social', { preHandler: requirePermission('analytics.view') }, async (req, reply) => {
    reply.send((await buildSocialAnalytics(parseRange(req.query))) satisfies SocialAnalytics);
  });
}
