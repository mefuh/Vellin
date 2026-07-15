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
import { Button, Icon } from '../../shared';
import { adminPushApi } from '../../api/adminPush';

type Tab = 'dashboard' | 'templates' | 'broadcasts';

const card: React.CSSProperties = {
  background: 'var(--bg-1)',
  border: '1px solid var(--line-1)',
  borderRadius: 'var(--r-md)',
  padding: 14,
};

export function AdminPush(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('dashboard');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 24, margin: 0, fontWeight: 600 }}>Push-уведомления</h1>
          <Link to="/admin/push/analytics" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent-hi)', textDecoration: 'none', fontWeight: 500 }}>
            <Icon name="waveform" size={15} /> Аналитика
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['dashboard', 'templates', 'broadcasts'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '7px 13px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--line-2)',
                background: tab === t ? 'var(--bg-3)' : 'var(--bg-1)',
                color: tab === t ? 'var(--text-0)' : 'var(--text-1)',
                fontSize: 13,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {t === 'dashboard' ? 'Дашборд' : t === 'templates' ? 'Шаблоны' : 'Рассылки'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'broadcasts' && <BroadcastsTab />}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ? 'var(--accent-hi)' : 'var(--text-0)' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function DashboardTab(): React.ReactElement {
  const [data, setData] = useState<{ dashboard: PushDashboardDTO; stats: PushStatsDTO } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    adminPushApi.dashboard().then(setData).catch(() => setErr('Не удалось загрузить'));
  }, []);
  if (err) return <div style={{ color: 'var(--text-3)' }}>{err}</div>;
  if (!data) return <div style={{ color: 'var(--text-3)' }}>Загрузка…</div>;
  const d = data.dashboard;
  const s = data.stats;
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={grid}>
        <Stat label="Всего устройств" value={d.totalDevices} />
        <Stat label="Активных устройств" value={d.activeDevices} />
        <Stat label="С включёнными Push" value={d.usersWithPush} accent />
        <Stat label="С отключёнными Push" value={d.usersPushDisabled} />
        <Stat label="Opt-in" value={`${d.optInPercent}%`} accent />
        <Stat label="В очереди" value={d.queuePending} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: '4px 2px 8px' }}>Отправлено</div>
        <div style={grid}>
          <Stat label="За день" value={d.sentDay} />
          <Stat label="За неделю" value={d.sentWeek} />
          <Stat label="За месяц" value={d.sentMonth} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: '4px 2px 8px' }}>
          Доставки за 30 дней
        </div>
        <div style={grid}>
          <Stat label="Доставлено" value={s.sent} accent />
          <Stat label="Ошибки" value={s.failed} />
          <Stat label="Устаревшие" value={s.expired} />
          <Stat label="Отклонено" value={s.rejected} />
          <Stat label="Кликов" value={s.clicked} />
          <Stat label="CTR" value={`${s.ctr}%`} accent />
        </div>
        {s.byBrowser.length > 0 && (
          <div style={{ ...card, marginTop: 10 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 8 }}>По браузерам</div>
            {s.byBrowser.map((b) => (
              <div key={b.browser} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                <span>{b.browser}</span>
                <span style={{ color: 'var(--text-2)' }}>{b.sent}</span>
              </div>
            ))}
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
  borderRadius: 'var(--r-sm)',
  color: 'var(--text-0)',
  fontSize: 13,
  fontFamily: 'inherit',
  padding: '8px 10px',
  boxSizing: 'border-box',
};

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '8px 0 4px' }}>{children}</div>;
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
      <div style={{ ...card, maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 600 }}>Шаблон: {e.type}</div>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Назад</Button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6 }}>
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
        <div style={{ display: 'flex', gap: 16, margin: '12px 0' }}>
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
          {saved === e.type && <span style={{ fontSize: 12.5, color: 'var(--accent-hi)' }}>Сохранено</span>}
          {saved === 'error' && <span style={{ fontSize: 12.5, color: '#e5484d' }}>Ошибка</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {templates.map((t) => (
        <div key={t.type} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {t.type} {!t.enabled && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>(выкл)</span>}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.title} — {t.body}
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing(t)}>Изменить</Button>
        </div>
      ))}
    </div>
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
      <div style={{ ...card, maxWidth: 560 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Новая рассылка</div>
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
        <div style={{ marginTop: 12 }}>
          <Label>Предпросмотр</Label>
          <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 'var(--r-md)', background: 'var(--bg-2)', border: '1px solid var(--line-2)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-soft)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title || 'Заголовок'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{body || 'Текст уведомления'}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <Button size="sm" variant="primary" disabled={!canSend} onClick={() => void send()}>
            {sending ? 'Отправка…' : 'Отправить'}
          </Button>
          {result && <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{result}</span>}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: '0 2px 8px' }}>История рассылок</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Пока нет рассылок</div>}
          {history.map((b) => (
            <div key={b.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{new Date(b.createdAt).toLocaleString('ru')}</div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{b.body}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
                {b.type} · {audienceLabel(b.audience)} · цель: {b.totalTargets} · доставлено воркеру: {b.sent} · без подписки/выкл: {b.failed}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function audienceLabel(a: BroadcastAudience): string {
  if (a.kind === 'all') return 'все';
  if (a.kind === 'role') return `роль: ${a.role}`;
  return `${a.userIds.length} пользователей`;
}
