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
import { LiveArea } from './components/Chart';
import { useAdminAccess } from './AdminAccessContext';
import { PERF_HINTS, describeRoute, jobStatus } from './systemMeta';
import { typeLabel } from './pushMeta';

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

const HISTORY_CAP = 45; // ~3 минуты при опросе раз в 4 сек
interface PerfSample { cpu: number; rss: number; heap: number }

function PerfTab() {
  const { data, error } = usePoll<PerfSnapshot>(() => adminSystemApi.perf(), 4000);
  const [history, setHistory] = useState<PerfSample[]>([]);

  useEffect(() => {
    if (!data) return;
    setHistory((prev) => [
      ...prev.slice(-(HISTORY_CAP - 1)),
      { cpu: data.cpuPercent, rss: data.memory.rssMb, heap: data.memory.heapUsedMb },
    ]);
  }, [data]);

  if (error) return <AdminSurface><AdminEmpty>{error}</AdminEmpty></AdminSurface>;
  if (!data) return <AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface>;
  const upH = Math.floor(data.uptimeSec / 3600);
  const upM = Math.floor((data.uptimeSec % 3600) / 60);
  const cpuPoints = history.map((h) => ({ value: h.cpu }));
  const memPoints = history.map((h) => ({ value: h.rss }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Графики нагрузки в реальном времени */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <ChartCard
          title="Загрузка процессора"
          hint={PERF_HINTS.cpu}
          value={`${data.cpuPercent}%`}
          accent={data.cpuPercent > 80}
        >
          <LiveArea points={cpuPoints} color="accent" unit="%" yMax={100} />
        </ChartCard>
        <ChartCard
          title="Оперативная память"
          hint={PERF_HINTS.rss}
          value={`${data.memory.rssMb} МБ`}
        >
          <LiveArea points={memPoints} color="ok" unit="МБ" />
        </ChartCard>
      </div>

      {/* Мгновенные показатели с расшифровками */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <StatTile label="Память процесса" value={`${data.memory.rssMb} МБ`} hint={PERF_HINTS.rss} />
        <StatTile label="Память JS (куча)" value={`${data.memory.heapUsedMb} МБ`} hint={`из ${data.memory.heapTotalMb} МБ · ${PERF_HINTS.heap}`} />
        <StatTile label="Время работы" value={`${upH}ч ${upM}м`} hint={PERF_HINTS.uptime} />
        <StatTile label="Запросов/сек" value={data.requests.rps} hint={PERF_HINTS.rps} />
        <StatTile label="Ошибки" value={`${data.requests.errorRate}%`} accent={data.requests.errorRate > 1} hint={PERF_HINTS.errors} />
        <StatTile label="Среднее время ответа" value={`${data.requests.avgMs} мс`} hint={PERF_HINTS.avg} />
        <StatTile label="Медленный ответ (P95)" value={`${data.requests.p95Ms} мс`} hint={PERF_HINTS.p95} />
      </div>

      {/* Активность по разделам (человеческие названия, техничка — под спойлером) */}
      <div>
        <SectionH>Активность по разделам (последняя минута)</SectionH>
        <AdminSurface>
          {data.byRoute.length === 0 ? <AdminEmpty>Нет запросов</AdminEmpty> : data.byRoute.map((r) => {
            const info = describeRoute(r.route);
            return (
              <div key={r.route} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 84px 84px', gap: 10, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--line-1)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.label}</span>
                <span style={{ color: 'var(--text-2)', textAlign: 'right' }}>{r.count} раз</span>
                <span style={{ color: 'var(--text-2)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.avgMs} мс</span>
                <span style={{ color: 'var(--text-3)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }} title="Максимальное время">пик {r.maxMs}</span>
              </div>
            );
          })}
          <Spoiler summary="Технические данные (маршруты)">
            {data.byRoute.map((r) => (
              <div key={r.route} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 70px', gap: 8, padding: '5px 0', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-3)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.route}</span>
                <span style={{ textAlign: 'right' }}>{r.count}×</span>
                <span style={{ textAlign: 'right' }}>{r.avgMs}ms</span>
                <span style={{ textAlign: 'right' }}>max{r.maxMs}</span>
              </div>
            ))}
          </Spoiler>
        </AdminSurface>
      </div>

      <div>
        <SectionH>Самые долгие запросы</SectionH>
        <AdminSurface>
          {data.slowest.length === 0 ? <AdminEmpty>—</AdminEmpty> : data.slowest.map((s, i) => {
            const info = describeRoute(s.route);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line-1)', fontSize: 13 }}>
                <span style={{ flex: 1, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.label}</span>
                <Chip tone={s.status >= 500 ? 'accent' : s.status >= 400 ? 'neutral' : 'success'}>{s.status < 400 ? 'успех' : `код ${s.status}`}</Chip>
                <span style={{ fontFamily: 'var(--font-mono)', color: s.ms > 1000 ? 'var(--warn)' : 'var(--text-2)' }}>{s.ms} мс</span>
              </div>
            );
          })}
          {data.slowest.length > 0 && (
            <Spoiler summary="Технические данные (запросы)">
              {data.slowest.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-3)' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.route}</span>
                  <span>HTTP {s.status}</span>
                  <span>{s.ms}ms</span>
                </div>
              ))}
            </Spoiler>
          )}
        </AdminSurface>
      </div>

      <ErrorsBlock errors={data.recentErrors} />
    </div>
  );
}

/** Карточка метрики с встроенным live-графиком. */
function ChartCard({ title, hint, value, accent, children }: { title: string; hint: string; value: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <AdminSurface style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-0)' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>{hint}</div>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: accent ? 'var(--accent-hi)' : 'var(--text-0)' }}>{value}</div>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </AdminSurface>
  );
}

/** Спойлер для технических данных (по умолчанию свёрнут). */
function Spoiler({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details style={{ padding: '10px 16px', borderTop: '1px solid var(--line-1)' }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-3)', userSelect: 'none' }}>{summary}</summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  );
}

function JobsTab() {
  const { can } = useAdminAccess();
  const { data, error, refetch } = usePoll<SystemJobsResponse>(() => adminSystemApi.jobs(), 5000);
  const canManage = can('jobs.manage');
  const [busy, setBusy] = useState(false);
  const [showTech, setShowTech] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); refetch(); } finally { setBusy(false); }
  };

  if (error) return <AdminSurface><AdminEmpty>{error}</AdminEmpty></AdminSurface>;
  if (!data) return <AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>
        Уведомления и обработка видео выполняются в фоне. Здесь видно, что доставлено, что ждёт очереди и что не удалось.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(data.push.counts).map(([status, n]) => {
          const st = jobStatus(status);
          return <Chip key={status} tone={st.tone}>{st.label}: {n}</Chip>;
        })}
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={() => setShowTech((v) => !v)}>
          {showTech ? 'Скрыть тех. данные' : 'Тех. данные'}
        </Button>
        {canManage && <Button variant="secondary" size="sm" icon="trash" disabled={busy} onClick={() => void act(() => adminSystemApi.purgeJobs())}>Очистить завершённые</Button>}
      </div>

      <div>
        <SectionH>Очередь уведомлений</SectionH>
        <AdminSurface>
          {data.push.jobs.length === 0 ? <AdminEmpty>Очередь пуста</AdminEmpty> : data.push.jobs.map((j) => (
            <JobRow key={j.id} job={j} canManage={canManage} busy={busy} showTech={showTech} onRetry={() => void act(() => adminSystemApi.retryJob('push', j.id))} onCancel={() => void act(() => adminSystemApi.cancelJob('push', j.id))} />
          ))}
        </AdminSurface>
      </div>

      <div>
        <SectionH>Обработка видео{data.transcode.processing > 0 ? ` · ${data.transcode.processing} в работе` : ''}</SectionH>
        <AdminSurface>
          {data.transcode.jobs.length === 0 ? <AdminEmpty>Нет задач обработки видео</AdminEmpty> : data.transcode.jobs.map((j) => (
            <JobRow key={j.id} job={j} canManage={canManage} busy={busy} showTech={showTech} onRetry={() => void act(() => adminSystemApi.retryJob('transcode', j.id))} onCancel={() => void act(() => adminSystemApi.cancelJob('transcode', j.id))} />
          ))}
        </AdminSurface>
      </div>
    </div>
  );
}

function JobRow({ job: j, canManage, busy, showTech, onRetry, onCancel }: { job: SystemJobsResponse['push']['jobs'][number]; canManage: boolean; busy: boolean; showTech: boolean; onRetry: () => void; onCancel: () => void }) {
  const dead = j.status === 'dead' || j.status === 'failed';
  const done = j.status === 'sent';
  const st = jobStatus(j.status);
  // Для пушей человекочитаем тип (заявка в друзья и т.п.); для видео — как есть.
  const humanLabel = j.kind === 'push' ? typeLabel(j.label) : j.label;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
      <Chip tone={st.tone}>{st.label}</Chip>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text-0)' }}>
          {humanLabel}
          {j.maxAttempts > 1 && j.attempts > 0 && <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}> · попытка {j.attempts} из {j.maxAttempts}</span>}
        </div>
        {j.lastError && <div style={{ fontSize: 11.5, color: 'var(--accent-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>{j.lastError}</div>}
        {showTech && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {j.kind} · {j.label} · {j.status} · id {j.id}{j.nextAttemptAt ? ` · след. попытка ${new Date(j.nextAttemptAt).toLocaleTimeString('ru-RU')}` : ''}
          </div>
        )}
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
