import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  AnalyticsPair,
  AnalyticsRange,
  RoomsAnalytics,
  SharedWatchAnalytics,
  SocialAnalytics,
  UsersAnalytics,
} from '@vellin/shared';
import { adminAnalyticsApi } from '../../api/adminAnalytics';
import { ApiHttpError } from '../../api/client';
import { Chip, Icon } from '../../shared';
import { AdminPage, AdminSurface, AdminEmpty, StatTile } from './components/AdminPage';
import { AreaTrend, BarSeries } from './components/Chart';
import { DateRangePicker } from './components/DateRangePicker';

type Tab = 'users' | 'rooms' | 'shared' | 'social';
const TABS: { key: Tab; label: string; icon: 'users' | 'film' | 'heart' | 'chat' }[] = [
  { key: 'users', label: 'Пользователи', icon: 'users' },
  { key: 'rooms', label: 'Комнаты', icon: 'film' },
  { key: 'shared', label: 'Совместный просмотр', icon: 'heart' },
  { key: 'social', label: 'Социальное', icon: 'chat' },
];

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} ч ${m} м`;
  if (m > 0) return `${m} м`;
  return `${sec} с`;
}

export function AdminAnalytics() {
  const [tab, setTab] = useState<Tab>('users');
  const [range, setRange] = useState<AnalyticsRange>('30d');

  return (
    <AdminPage
      eyebrow="Аналитика платформы"
      title="Аналитика"
      subtitle="Метрики роста, вовлечённости и совместного просмотра. Ряды из даты создания считаются исторически; DAU и число гостей копятся с момента внедрения."
      actions={tab !== 'shared' ? <DateRangePicker value={range} onChange={setRange} /> : undefined}
    >
      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', position: 'sticky', top: 8, zIndex: 5 }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999,
                border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500,
                background: active ? 'var(--bg-3)' : 'var(--bg-1)',
                color: active ? 'var(--text-0)' : 'var(--text-2)',
                boxShadow: active ? 'inset 0 0 0 1px var(--line-2)' : 'inset 0 0 0 1px var(--line-1)',
                transition: 'background .14s',
              }}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'users' && <UsersTab range={range} />}
      {tab === 'rooms' && <RoomsTab range={range} />}
      {tab === 'shared' && <SharedTab />}
      {tab === 'social' && <SocialTab range={range} />}
    </AdminPage>
  );
}

function useResource<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(fetcher, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    setLoading(true);
    run()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка загрузки'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [run]);
  return { data, loading, error };
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AdminSurface style={{ padding: 18 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </AdminSurface>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>{children}</div>;
}

function Loading() {
  return <AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface>;
}
function Err({ msg }: { msg: string }) {
  return <AdminSurface><AdminEmpty>{msg}</AdminEmpty></AdminSurface>;
}

// ── Users ─────────────────────────────────────────────────────────────────

function UsersTab({ range }: { range: AnalyticsRange }) {
  const { data, loading, error } = useResource<UsersAnalytics>(() => adminAnalyticsApi.users(range), [range]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Err msg={error ?? 'Нет данных'} />;
  return (
    <>
      <StatGrid>
        <StatTile label="Всего" value={data.totals.total} />
        <StatTile label="Онлайн" value={data.totals.online} accent />
        <StatTile label="Заблокировано" value={data.totals.blocked} />
        <StatTile label="Удалено" value={data.totals.deleted} />
        <StatTile label="Гости онлайн" value={data.totals.guestsOnline} />
      </StatGrid>
      <ChartCard title={`Новые регистрации · ${data.registrations.total} за период`}>
        <AreaTrend points={data.registrations.points} />
      </ChartCard>
      <ChartCard title="DAU (активные за день)">
        {data.dau.total === 0 ? (
          <AdminEmpty>Данные DAU копятся с момента внедрения аналитики</AdminEmpty>
        ) : (
          <AreaTrend points={data.dau.points} accent={false} unit="польз." />
        )}
      </ChartCard>
      <ChartCard title="Активность по часам (входы)">
        <BarSeries data={data.byHour as unknown as Array<Record<string, number>>} xKey="hour" xFormatter={(h) => `${h}ч`} unit="входов" />
      </ChartCard>
    </>
  );
}

// ── Rooms ─────────────────────────────────────────────────────────────────

function RoomsTab({ range }: { range: AnalyticsRange }) {
  const { data, loading, error } = useResource<RoomsAnalytics>(() => adminAnalyticsApi.rooms(range), [range]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Err msg={error ?? 'Нет данных'} />;
  return (
    <>
      <StatGrid>
        <StatTile label="Всего комнат" value={data.totals.total} />
        <StatTile label="Активны сейчас" value={data.totals.active} accent />
        <StatTile label="Приватных" value={data.totals.private} />
        <StatTile label="Ср. участников" value={data.totals.avgLiveParticipants} />
      </StatGrid>
      <ChartCard title={`Создано комнат · ${data.created.total} за период`}>
        <AreaTrend points={data.created.points} />
      </ChartCard>
      <div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>Популярные комнаты</h3>
        <AdminSurface>
          {data.topRooms.length === 0 ? (
            <AdminEmpty>Нет данных по сообщениям</AdminEmpty>
          ) : (
            data.topRooms.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-3)', width: 20 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                {r.isPrivate && <Chip tone="neutral" icon="lock">приват</Chip>}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>{r.members} уч.</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-0)', minWidth: 70, textAlign: 'right' }}>{r.messages} сообщ.</span>
              </div>
            ))
          )}
        </AdminSurface>
      </div>
    </>
  );
}

// ── Shared watch ──────────────────────────────────────────────────────────

function PairRow({ p, metric }: { p: AnalyticsPair; metric: 'total' | 'longest' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
        <Link to={`/admin/users/${p.userAId}`} style={{ color: 'var(--text-0)', textDecoration: 'none', fontWeight: 500 }}>{p.userAName}</Link>
        <Icon name="heart" size={12} style={{ color: 'var(--accent-hi)' }} />
        <Link to={`/admin/users/${p.userBId}`} style={{ color: 'var(--text-0)', textDecoration: 'none', fontWeight: 500 }}>{p.userBName}</Link>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>{p.sessionsCount} сессий</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-0)', minWidth: 92, textAlign: 'right' }}>
        {fmtDur(metric === 'total' ? p.totalSeconds : p.longestSessionSeconds)}
      </span>
    </div>
  );
}

function SharedTab() {
  const { data, loading, error } = useResource<SharedWatchAnalytics>(() => adminAnalyticsApi.sharedWatch(), []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Err msg={error ?? 'Нет данных'} />;
  return (
    <>
      <StatGrid>
        <StatTile label="Часов вместе" value={data.totals.totalHours} accent />
        <StatTile label="Совместных сессий" value={data.totals.sessions} />
        <StatTile label="Ср. сессия" value={`${data.totals.avgSessionMinutes} м`} />
        <StatTile label="Пар" value={data.totals.pairs} />
      </StatGrid>
      <div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>Самые активные пары</h3>
        <AdminSurface>
          {data.topPairs.length === 0 ? <AdminEmpty>Пока никто не смотрел вместе</AdminEmpty> : data.topPairs.map((p) => <PairRow key={`${p.userAId}-${p.userBId}`} p={p} metric="total" />)}
        </AdminSurface>
      </div>
      <div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>Самые длинные сессии</h3>
        <AdminSurface>
          {data.longestSessions.length === 0 ? <AdminEmpty>Нет данных</AdminEmpty> : data.longestSessions.map((p) => <PairRow key={`l-${p.userAId}-${p.userBId}`} p={p} metric="longest" />)}
        </AdminSurface>
      </div>
    </>
  );
}

// ── Social ────────────────────────────────────────────────────────────────

function SocialTab({ range }: { range: AnalyticsRange }) {
  const { data, loading, error } = useResource<SocialAnalytics>(() => adminAnalyticsApi.social(range), [range]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Err msg={error ?? 'Нет данных'} />;
  return (
    <>
      <StatGrid>
        <StatTile label="Сообщений" value={data.totals.messages} />
        <StatTile label="Фото" value={data.totals.photos} />
        <StatTile label="Голосовых" value={data.totals.voice} />
        <StatTile label="Видео" value={data.totals.video} />
        <StatTile label="Приглашений" value={data.totals.invites} />
        <StatTile label="Дружб" value={data.totals.friendships} accent />
        <StatTile label="Блокировок" value={data.totals.blocks} />
      </StatGrid>
      <ChartCard title={`Сообщения в комнатах · ${data.messages.total} за период`}>
        <AreaTrend points={data.messages.points} />
      </ChartCard>
      <ChartCard title={`Новые дружбы · ${data.friendships.total} за период`}>
        <AreaTrend points={data.friendships.points} accent={false} />
      </ChartCard>
    </>
  );
}
