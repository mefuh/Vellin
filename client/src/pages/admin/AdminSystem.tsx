import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  HealthSnapshot,
  HealthStatus,
  PerfSnapshot,
  RecentError,
  SystemJobsResponse,
  WsSnapshot,
} from '@vellin/shared';
import { adminSystemApi } from '../../api/adminSystem';
import { ApiHttpError } from '../../api/client';
import { Button, Chip, Icon } from '../../shared';
import { AdminPage, AdminSurface, AdminEmpty, StatTile } from './components/AdminPage';
import { useAdminAccess } from './AdminAccessContext';

type Tab = 'health' | 'ws' | 'perf' | 'jobs';
const TABS: { key: Tab; label: string }[] = [
  { key: 'health', label: 'Health' },
  { key: 'ws', label: 'WebSocket' },
  { key: 'perf', label: 'Производительность' },
  { key: 'jobs', label: 'Задачи' },
];

/** Простой поллинг: тянет данные на монтировании и каждые intervalMs. */
function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[] = []): { data: T | null; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savedFetcher = useRef(fetcher);
  savedFetcher.current = fetcher;

  const run = useCallback(() => {
    savedFetcher.current()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка загрузки'));
  }, []);

  useEffect(() => {
    run();
    const t = window.setInterval(run, intervalMs);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, refetch: run };
}

export function AdminSystem() {
  const [tab, setTab] = useState<Tab>('health');
  return (
    <AdminPage eyebrow="Система" title="Мониторинг" glow="rgba(53,208,127,0.14)" subtitle="Состояние сервера в реальном времени: подключения, нагрузка, зависимости и фоновые задачи.">
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500,
              background: active ? 'var(--bg-3)' : 'var(--bg-1)', color: active ? 'var(--text-0)' : 'var(--text-2)',
              boxShadow: active ? 'inset 0 0 0 1px var(--line-2)' : 'inset 0 0 0 1px var(--line-1)',
            }}>{t.label}</button>
          );
        })}
      </div>
      {tab === 'health' && <HealthTab />}
      {tab === 'ws' && <WsTab />}
      {tab === 'perf' && <PerfTab />}
      {tab === 'jobs' && <JobsTab />}
    </AdminPage>
  );
}

const STATUS_TONE: Record<HealthStatus, { color: string; label: string }> = {
  ok: { color: 'var(--ok)', label: 'OK' },
  degraded: { color: 'var(--warn)', label: 'деградация' },
  down: { color: 'var(--accent-hi)', label: 'недоступно' },
  disabled: { color: 'var(--text-3)', label: 'выключено' },
};

function StatusDot({ status }: { status: HealthStatus }) {
  return <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_TONE[status].color, flexShrink: 0, boxShadow: `0 0 8px ${STATUS_TONE[status].color}` }} />;
}

function HealthTab() {
  const { data, error } = usePoll<HealthSnapshot>(() => adminSystemApi.health(), 10000);
  if (error) return <AdminSurface><AdminEmpty>{error}</AdminEmpty></AdminSurface>;
  if (!data) return <AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdminSurface style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <StatusDot status={data.overall} />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {data.overall === 'ok' ? 'Всё работает' : data.overall === 'degraded' ? 'Частичная деградация' : 'Есть проблемы'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{new Date(data.serverTime).toLocaleString('ru-RU')}</div>
        </div>
      </AdminSurface>
      <AdminSurface>
        {data.checks.map((c) => (
          <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid var(--line-1)' }}>
            <StatusDot status={c.status} />
            <span style={{ flex: 1, fontSize: 14, color: 'var(--text-0)', fontWeight: 500 }}>{c.name}</span>
            {c.detail && <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.detail}</span>}
            {c.latencyMs != null && <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{c.latencyMs} мс</span>}
            <span style={{ fontSize: 11.5, color: STATUS_TONE[c.status].color, fontWeight: 600, minWidth: 84, textAlign: 'right' }}>{STATUS_TONE[c.status].label}</span>
          </div>
        ))}
      </AdminSurface>
    </div>
  );
}

function WsTab() {
  const { data, error } = usePoll<WsSnapshot>(() => adminSystemApi.ws(), 3000);
  if (error) return <AdminSurface><AdminEmpty>{error}</AdminEmpty></AdminSurface>;
  if (!data) return <AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <StatTile label="Подключений" value={data.connections} accent />
        <StatTile label="Онлайн" value={data.online} />
        <StatTile label="Активных комнат" value={data.activeRooms} />
        <StatTile label="Сессий в комнатах" value={data.roomSessions} />
        <StatTile label="Событий/сек" value={data.eventPerSec} />
      </div>
      <div>
        <SectionH>Комнаты</SectionH>
        <AdminSurface>
          {data.rooms.length === 0 ? <AdminEmpty>Нет активных комнат</AdminEmpty> : data.rooms.map((r) => (
            <div key={r.roomId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
              <Icon name="film" size={15} style={{ color: 'var(--text-2)' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-3)' }}>{r.slug}</span>
              <Chip tone="neutral" icon="users">{r.participants}</Chip>
            </div>
          ))}
        </AdminSurface>
      </div>
      <ErrorsBlock errors={data.recentErrors} />
    </div>
  );
}

function PerfTab() {
  const { data, error } = usePoll<PerfSnapshot>(() => adminSystemApi.perf(), 4000);
  if (error) return <AdminSurface><AdminEmpty>{error}</AdminEmpty></AdminSurface>;
  if (!data) return <AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface>;
  const upH = Math.floor(data.uptimeSec / 3600);
  const upM = Math.floor((data.uptimeSec % 3600) / 60);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <StatTile label="CPU" value={`${data.cpuPercent}%`} accent={data.cpuPercent > 80} />
        <StatTile label="RSS память" value={`${data.memory.rssMb} МБ`} />
        <StatTile label="Heap" value={`${data.memory.heapUsedMb} МБ`} hint={`из ${data.memory.heapTotalMb} МБ`} />
        <StatTile label="Аптайм" value={`${upH}ч ${upM}м`} />
        <StatTile label="RPS" value={data.requests.rps} />
        <StatTile label="Ошибки" value={`${data.requests.errorRate}%`} accent={data.requests.errorRate > 1} />
        <StatTile label="Средн. ответ" value={`${data.requests.avgMs} мс`} />
        <StatTile label="P95" value={`${data.requests.p95Ms} мс`} />
      </div>
      <div>
        <SectionH>По маршрутам (последняя минута)</SectionH>
        <AdminSurface>
          {data.byRoute.length === 0 ? <AdminEmpty>Нет запросов</AdminEmpty> : data.byRoute.map((r) => (
            <div key={r.route} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 90px', gap: 10, alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--line-1)', fontSize: 12.5 }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.route}</span>
              <span style={{ color: 'var(--text-2)', textAlign: 'right' }}>{r.count}×</span>
              <span style={{ color: 'var(--text-2)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.avgMs} мс</span>
              <span style={{ color: 'var(--text-3)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>max {r.maxMs}</span>
            </div>
          ))}
        </AdminSurface>
      </div>
      <div>
        <SectionH>Самые долгие запросы</SectionH>
        <AdminSurface>
          {data.slowest.length === 0 ? <AdminEmpty>—</AdminEmpty> : data.slowest.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: '1px solid var(--line-1)', fontSize: 12.5 }}>
              <span style={{ flex: 1, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.route}</span>
              <Chip tone={s.status >= 500 ? 'accent' : 'neutral'}>{s.status}</Chip>
              <span style={{ fontFamily: 'var(--font-mono)', color: s.ms > 1000 ? 'var(--warn)' : 'var(--text-2)' }}>{s.ms} мс</span>
            </div>
          ))}
        </AdminSurface>
      </div>
      <ErrorsBlock errors={data.recentErrors} />
    </div>
  );
}

function JobsTab() {
  const { can } = useAdminAccess();
  const { data, error, refetch } = usePoll<SystemJobsResponse>(() => adminSystemApi.jobs(), 5000);
  const canManage = can('jobs.manage');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); refetch(); } finally { setBusy(false); }
  };

  if (error) return <AdminSurface><AdminEmpty>{error}</AdminEmpty></AdminSurface>;
  if (!data) return <AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(data.push.counts).map(([status, n]) => (
          <Chip key={status} tone={status === 'dead' ? 'accent' : status === 'pending' ? 'neutral' : 'success'}>{status}: {n}</Chip>
        ))}
        <span style={{ flex: 1 }} />
        {canManage && <Button variant="secondary" size="sm" icon="trash" disabled={busy} onClick={() => void act(() => adminSystemApi.purgeJobs())}>Очистить завершённые</Button>}
      </div>

      <div>
        <SectionH>Push-очередь</SectionH>
        <AdminSurface>
          {data.push.jobs.length === 0 ? <AdminEmpty>Очередь пуста</AdminEmpty> : data.push.jobs.map((j) => (
            <JobRow key={j.id} job={j} canManage={canManage} busy={busy} onRetry={() => void act(() => adminSystemApi.retryJob('push', j.id))} onCancel={() => void act(() => adminSystemApi.cancelJob('push', j.id))} />
          ))}
        </AdminSurface>
      </div>

      <div>
        <SectionH>Транскодирование видео · {data.transcode.processing} в работе</SectionH>
        <AdminSurface>
          {data.transcode.jobs.length === 0 ? <AdminEmpty>Нет задач транскодирования</AdminEmpty> : data.transcode.jobs.map((j) => (
            <JobRow key={j.id} job={j} canManage={canManage} busy={busy} onRetry={() => void act(() => adminSystemApi.retryJob('transcode', j.id))} onCancel={() => void act(() => adminSystemApi.cancelJob('transcode', j.id))} />
          ))}
        </AdminSurface>
      </div>
    </div>
  );
}

function JobRow({ job: j, canManage, busy, onRetry, onCancel }: { job: SystemJobsResponse['push']['jobs'][number]; canManage: boolean; busy: boolean; onRetry: () => void; onCancel: () => void }) {
  const dead = j.status === 'dead' || j.status === 'failed';
  const done = j.status === 'sent';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
      <Chip tone={dead ? 'accent' : done ? 'success' : 'neutral'}>{j.status}</Chip>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text-0)' }}>{j.label} {j.maxAttempts > 1 && <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>· попытка {j.attempts}/{j.maxAttempts}</span>}</div>
        {j.lastError && <div style={{ fontSize: 11.5, color: 'var(--accent-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>{j.lastError}</div>}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{new Date(j.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
      {canManage && (
        <span style={{ display: 'flex', gap: 4 }}>
          <Button variant="ghost" size="sm" icon="refresh" disabled={busy} onClick={onRetry} title="Повторить" />
          {!dead && !done && <Button variant="ghost" size="sm" icon="close" disabled={busy} onClick={onCancel} title="Отменить" />}
        </span>
      )}
    </div>
  );
}

function ErrorsBlock({ errors }: { errors: RecentError[] }) {
  if (errors.length === 0) return null;
  return (
    <div>
      <SectionH>Последние ошибки</SectionH>
      <AdminSurface>
        {errors.map((e, i) => (
          <div key={i} style={{ padding: '9px 16px', borderBottom: '1px solid var(--line-1)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>{new Date(e.ts).toLocaleTimeString('ru-RU')}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-2)' }}>{e.where}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--accent-hi)', marginTop: 2, wordBreak: 'break-word' }}>{e.message}</div>
          </div>
        ))}
      </AdminSurface>
    </div>
  );
}

function SectionH({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{children}</h3>;
}
