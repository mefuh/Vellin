import { useEffect, useState } from 'react';
import type {
  BroadcastAudience,
  NotificationTemplateDTO,
  PushBroadcastDTO,
  PushDashboardDTO,
  PushStatsDTO,
  PushNotificationType,
} from '@vellin/shared';
import { Link } from 'react-router-dom';
import { Button, Chip, Icon } from '../../shared';
import { adminPushApi } from '../../api/adminPush';
import { AdminPage, AdminSurface, AdminEmpty, StatTile } from './components/AdminPage';

type Tab = 'dashboard' | 'templates' | 'broadcasts';
const TAB_LABEL: Record<Tab, string> = { dashboard: 'Дашборд', templates: 'Шаблоны', broadcasts: 'Рассылки' };

export function AdminPush(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('dashboard');
  return (
    <AdminPage
      eyebrow="Push"
      title="Push-уведомления"
      subtitle="Дашборд доставок, редактор шаблонов и массовые рассылки."
      actions={
        <Link to="/admin/push/analytics" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" size="sm" icon="waveform">Аналитика</Button>
        </Link>
      }
    >
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['dashboard', 'templates', 'broadcasts'] as Tab[]).map((t) => {
          const active = t === tab;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500,
              background: active ? 'var(--bg-3)' : 'var(--bg-1)', color: active ? 'var(--text-0)' : 'var(--text-2)',
              boxShadow: active ? 'inset 0 0 0 1px var(--line-2)' : 'inset 0 0 0 1px var(--line-1)',
            }}>{TAB_LABEL[t]}</button>
          );
        })}
      </div>
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'broadcasts' && <BroadcastsTab />}
    </AdminPage>
  );
}

function SectionH({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{children}</h3>;
}

function DashboardTab(): React.ReactElement {
  const [data, setData] = useState<{ dashboard: PushDashboardDTO; stats: PushStatsDTO } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    adminPushApi.dashboard().then(setData).catch(() => setErr('Не удалось загрузить'));
  }, []);
  if (err) return <AdminSurface><AdminEmpty>{err}</AdminEmpty></AdminSurface>;
  if (!data) return <AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface>;
  const d = data.dashboard;
  const s = data.stats;
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 };
  const max = s.byBrowser.reduce((m, b) => Math.max(m, b.sent), 0) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={grid}>
        <StatTile label="Всего устройств" value={d.totalDevices} />
        <StatTile label="Активных устройств" value={d.activeDevices} />
        <StatTile label="С включёнными Push" value={d.usersWithPush} accent />
        <StatTile label="С отключёнными Push" value={d.usersPushDisabled} />
        <StatTile label="Opt-in" value={`${d.optInPercent}%`} accent />
        <StatTile label="В очереди" value={d.queuePending} />
      </div>
      <div>
        <SectionH>Отправлено</SectionH>
        <div style={grid}>
          <StatTile label="За день" value={d.sentDay} />
          <StatTile label="За неделю" value={d.sentWeek} />
          <StatTile label="За месяц" value={d.sentMonth} />
        </div>
      </div>
      <div>
        <SectionH>Доставки за 30 дней</SectionH>
        <div style={grid}>
          <StatTile label="Доставлено" value={s.sent} accent />
          <StatTile label="Ошибки" value={s.failed} />
          <StatTile label="Устаревшие" value={s.expired} />
          <StatTile label="Отклонено" value={s.rejected} />
          <StatTile label="Кликов" value={s.clicked} />
          <StatTile label="CTR" value={`${s.ctr}%`} accent />
        </div>
        {s.byBrowser.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <SectionH>По браузерам</SectionH>
            <AdminSurface style={{ padding: '10px 16px' }}>
              {s.byBrowser.map((b) => (
                <div key={b.browser} style={{ padding: '7px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-1)' }}>{b.browser}</span>
                    <span style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.sent}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(b.sent / max) * 100}%`, background: 'linear-gradient(90deg, var(--accent-lo), var(--accent-hi))' }} />
                  </div>
                </div>
              ))}
            </AdminSurface>
          </div>
        )}
      </div>
    </div>
  );
}

const field: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-2)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r-md)',
  color: 'var(--text-0)',
  fontSize: 13.5,
  fontFamily: 'inherit',
  padding: '9px 11px',
  boxSizing: 'border-box',
};

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '10px 0 5px' }}>{children}</div>;
}

function TemplatesTab(): React.ReactElement {
  const [templates, setTemplates] = useState<NotificationTemplateDTO[]>([]);
  const [editing, setEditing] = useState<NotificationTemplateDTO | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = (): void => {
    void adminPushApi.templates().then((r) => setTemplates(r.templates));
  };
  useEffect(load, []);

  const save = async (): Promise<void> => {
    if (!editing) return;
    const { type, updatedAt, ...patch } = editing;
    void updatedAt;
    try {
      await adminPushApi.updateTemplate(type, patch);
      setSaved(type);
      setTimeout(() => setSaved(null), 2000);
      load();
    } catch {
      setSaved('error');
    }
  };

  if (editing) {
    const e = editing;
    const set = (p: Partial<NotificationTemplateDTO>): void => setEditing({ ...e, ...p });
    return (
      <AdminSurface style={{ padding: 20, maxWidth: 580 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>Шаблон: {e.type}</div>
          <Button size="sm" variant="ghost" icon="arrow" onClick={() => setEditing(null)}>Назад</Button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
          Переменные: {'{{username}} {{message}} {{roomName}} {{movie}} {{title}}'}
        </div>
        <Label>Заголовок</Label>
        <input style={field} value={e.title} onChange={(ev) => set({ title: ev.target.value })} />
        <Label>Текст</Label>
        <textarea style={{ ...field, minHeight: 60, resize: 'vertical' }} value={e.body} onChange={(ev) => set({ body: ev.target.value })} />
        <Label>URL открытия</Label>
        <input style={field} value={e.url} onChange={(ev) => set({ url: ev.target.value })} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Label>Иконка</Label>
            <input style={field} value={e.icon} onChange={(ev) => set({ icon: ev.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Badge</Label>
            <input style={field} value={e.badge} onChange={(ev) => set({ badge: ev.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Label>TTL (сек)</Label>
            <input type="number" style={field} value={e.ttl} onChange={(ev) => set({ ttl: Number(ev.target.value) })} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Urgency</Label>
            <select style={field} value={e.urgency} onChange={(ev) => set({ urgency: ev.target.value as NotificationTemplateDTO['urgency'] })}>
              {(['very-low', 'low', 'normal', 'high'] as const).map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
        <Label>Tag (группировка ОС, может быть пустым)</Label>
        <input style={field} value={e.tag ?? ''} onChange={(ev) => set({ tag: ev.target.value || null })} />
        <div style={{ display: 'flex', gap: 16, margin: '14px 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={e.requireInteraction} onChange={(ev) => set({ requireInteraction: ev.target.checked })} />
            Require Interaction
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={e.silent} onChange={(ev) => set({ silent: ev.target.checked })} />
            Silent
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={e.enabled} onChange={(ev) => set({ enabled: ev.target.checked })} />
            Включён
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button size="sm" variant="primary" onClick={() => void save()}>Сохранить</Button>
          {saved === e.type && <Chip tone="success">Сохранено</Chip>}
          {saved === 'error' && <span style={{ fontSize: 12.5, color: 'var(--accent-hi)' }}>Ошибка</span>}
        </div>
      </AdminSurface>
    );
  }

  return (
    <AdminSurface>
      {templates.length === 0 ? <AdminEmpty>Шаблонов нет</AdminEmpty> : templates.map((t) => (
        <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line-1)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{t.type}</span>
              {!t.enabled && <Chip tone="neutral">выкл</Chip>}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.title} — {t.body}
            </div>
          </div>
          <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(t)}>Изменить</Button>
        </div>
      ))}
    </AdminSurface>
  );
}

function BroadcastsTab(): React.ReactElement {
  const [type, setType] = useState<PushNotificationType>('system');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [audienceKind, setAudienceKind] = useState<'all' | 'role' | 'users'>('all');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [userIds, setUserIds] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<PushBroadcastDTO[]>([]);

  const loadHistory = (): void => {
    void adminPushApi.broadcasts().then((r) => setHistory(r.broadcasts));
  };
  useEffect(loadHistory, []);

  const buildAudience = (): BroadcastAudience => {
    if (audienceKind === 'role') return { kind: 'role', role };
    if (audienceKind === 'users') {
      return { kind: 'users', userIds: userIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) };
    }
    return { kind: 'all' };
  };

  const send = async (): Promise<void> => {
    setSending(true);
    setResult(null);
    try {
      const res = await adminPushApi.sendBroadcast({ type, title, body, url, audience: buildAudience() });
      setResult(`Поставлено в очередь: ${res.queued} из ${res.totalTargets} получателей`);
      setTitle('');
      setBody('');
      loadHistory();
    } catch {
      setResult('Ошибка отправки');
    } finally {
      setSending(false);
    }
  };

  const canSend = title.trim() && body.trim() && !sending;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20 }}>
      <AdminSurface style={{ padding: 20, maxWidth: 580 }}>
        <SectionH>Новая рассылка</SectionH>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Label>Тип</Label>
            <select style={field} value={type} onChange={(e) => setType(e.target.value as PushNotificationType)}>
              <option value="system">Системное</option>
              <option value="news">Новости</option>
              <option value="marketing">Маркетинг</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <Label>Аудитория</Label>
            <select style={field} value={audienceKind} onChange={(e) => setAudienceKind(e.target.value as 'all' | 'role' | 'users')}>
              <option value="all">Все</option>
              <option value="role">По роли</option>
              <option value="users">Конкретные ID</option>
            </select>
          </div>
        </div>
        {audienceKind === 'role' && (
          <>
            <Label>Роль</Label>
            <select style={field} value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
              <option value="user">Пользователи</option>
              <option value="admin">Админы</option>
            </select>
          </>
        )}
        {audienceKind === 'users' && (
          <>
            <Label>ID пользователей (через запятую/пробел)</Label>
            <textarea style={{ ...field, minHeight: 50 }} value={userIds} onChange={(e) => setUserIds(e.target.value)} />
          </>
        )}
        <Label>Заголовок</Label>
        <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок уведомления" />
        <Label>Текст</Label>
        <textarea style={{ ...field, minHeight: 60 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Текст" />
        <Label>URL открытия</Label>
        <input style={field} value={url} onChange={(e) => setUrl(e.target.value)} />

        {/* Предпросмотр (обязателен по ТЗ). */}
        <Label>Предпросмотр</Label>
        <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 'var(--r-md)', background: 'var(--bg-2)', boxShadow: 'inset 0 0 0 1px var(--line-1)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-soft)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title || 'Заголовок'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{body || 'Текст уведомления'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <Button size="sm" variant="primary" disabled={!canSend} onClick={() => void send()}>
            {sending ? 'Отправка…' : 'Отправить'}
          </Button>
          {result && <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{result}</span>}
        </div>
      </AdminSurface>

      <div>
        <SectionH>История рассылок</SectionH>
        <AdminSurface>
          {history.length === 0 ? <AdminEmpty>Пока нет рассылок</AdminEmpty> : history.map((b) => (
            <div key={b.id} style={{ padding: '13px 16px', borderBottom: '1px solid var(--line-1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{b.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{new Date(b.createdAt).toLocaleString('ru')}</div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{b.body}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                {b.type} · {audienceLabel(b.audience)} · цель: {b.totalTargets} · воркеру: {b.sent} · без подписки/выкл: {b.failed}
              </div>
            </div>
          ))}
        </AdminSurface>
      </div>
    </div>
  );
}

function audienceLabel(a: BroadcastAudience): string {
  if (a.kind === 'all') return 'все';
  if (a.kind === 'role') return `роль: ${a.role}`;
  return `${a.userIds.length} пользователей`;
}
