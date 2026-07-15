import type {
  AnalyticsOverview,
  AnalyticsRange,
  RoomsAnalytics,
  SharedWatchAnalytics,
  SocialAnalytics,
  UsersAnalytics,
} from '@vellin/shared';
import { apiFetch } from './client';

const r = (range: AnalyticsRange) => `?range=${range}`;

export const adminAnalyticsApi = {
  overview: () => apiFetch<AnalyticsOverview>('/admin/analytics/overview'),
  users: (range: AnalyticsRange) => apiFetch<UsersAnalytics>(`/admin/analytics/users${r(range)}`),
  rooms: (range: AnalyticsRange) => apiFetch<RoomsAnalytics>(`/admin/analytics/rooms${r(range)}`),
  sharedWatch: () => apiFetch<SharedWatchAnalytics>('/admin/analytics/shared-watch'),
  social: (range: AnalyticsRange) => apiFetch<SocialAnalytics>(`/admin/analytics/social${r(range)}`),
};
