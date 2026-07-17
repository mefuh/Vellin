import { useEffect, useRef, useState } from 'react';
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
import {
  METRIC_HINTS,
  PUSH_TYPE_META,
  PUSH_VARIABLES,
  TTL_PRESETS,
  TYPE_VARIABLES,
  URGENCY_OPTIONS,
  formatTtl,
  previewText,
  typeLabel,
} from './pushMeta';

type Tab = 'dashboard' | 'templates' | 'broadcasts';
const TAB_LABEL: Record<Tab, string> = { dashboard: 'Обзор', templates: 'Шаблоны', broadcasts: 'Рассылки' };

export function AdminPush(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('dashboard');
  return (
    <AdminPage
      eyebrow="Push"
      title="Push-уведомления"
      subtitle="Обзор доставок, редактор шаблонов и массовые рассылки."
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

// ── Обзор ────────────────────────────────────────────────────────────────────
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
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 };
  const max = s.byBrowser.reduce((m, b) => Math.max(m, b.sent), 0) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <SectionH>Кто получает уведомления</SectionH>
        <div style={grid}>
          <StatTile label="Всего устройств" value={d.totalDevices} hint={METRIC_HINTS.totalDevices} />
          <StatTile label="Активных устройств" value={d.activeDevices} hint={METRIC_HINTS.activeDevices} />
          <StatTile label="Разрешили уведомления" value={d.usersWithPush} accent hint={METRIC_HINTS.usersWithPush} />
          <StatTile label="Запретили уведомления" value={d.usersPushDisabled} hint={METRIC_HINTS.usersPushDisabled} />
          <StatTile label="Доля разрешивших" value={`${d.optInPercent}%`} accent hint={METRIC_HINTS.optIn} />
          <StatTile label="Ждут отправки" value={d.queuePending} hint={METRIC_HINTS.queue} />
        </div>
      </div>
      <div>
        <SectionH>Сколько отправлено</SectionH>
        <div style={grid}>
          <StatTile label="За сегодня" value={d.sentDay} />
          <StatTile label="За неделю" value={d.sentWeek} />
          <StatTile label="За месяц" value={d.sentMonth} />
        </div>
      </div>
      <div>
        <SectionH>Что произошло с уведомлениями за 30 дней</SectionH>
        <div style={grid}>
          <StatTile label="Доставлено" value={s.sent} accent hint={METRIC_HINTS.delivered} />
          <StatTile label="Ошибки доставки" value={s.failed} hint={METRIC_HINTS.failed} />
          <StatTile label="Истёк срок" value={s.expired} hint={METRIC_HINTS.expired} />
          <StatTile label="Отклонено браузером" value={s.rejected} hint={METRIC_HINTS.rejected} />
          <StatTile label="Открытий" value={s.clicked} hint={METRIC_HINTS.clicked} />
          <StatTile label="Открываемость" value={`${s.ctr}%`} accent hint={METRIC_HINTS.ctr} />
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

// ── Общие стили полей ────────────────────────────────────────────────────────
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

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ margin: '12px 0 5px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>{children}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

// ── Поле с автоподсказкой переменных ────────────────────────────────────────
interface VarInputProps {
  value: string;
  onChange: (v: string) => void;
  available: string[];
  multiline?: boolean;
  placeholder?: string;
  onActivate?: (insert: (text: string) => void) => void;
}

function VarInput({ value, onChange, available, multiline, placeholder, onActivate }: VarInputProps): React.ReactElement {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [suggest, setSuggest] = useState<{ query: string; at: number } | null>(null);
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCaret.current != null && ref.current) {
      const pos = pendingCaret.current;
      ref.current.selectionStart = ref.current.selectionEnd = pos;
      pendingCaret.current = null;
    }
  });

  const insertAtCursor = (text: string): void => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    pendingCaret.current = start + text.length;
    onChange(value.slice(0, start) + text + value.slice(end));
    setSuggest(null);
    el?.focus();
  };

  const detectSuggest = (v: string, caret: number): void => {
    const before = v.slice(0, caret);
    const m = /\{\{\s*(\w*)$/.exec(before);
    if (m) setSuggest({ query: m[1].toLowerCase(), at: caret - m[0].length });
    else setSuggest(null);
  };

  const filtered = suggest
    ? available.filter((k) => k.toLowerCase().includes(suggest.query) || (PUSH_VARIABLES[k]?.label.toLowerCase().includes(suggest.query)))
    : [];

  const complete = (key: string): void => {
    const el = ref.current;
    if (!suggest || !el) return;
    const caret = el.selectionStart ?? value.length;
    const token = `{{${key}}}`;
    pendingCaret.current = suggest.at + token.length;
    onChange(value.slice(0, suggest.at) + token + value.slice(caret));
    setSuggest(null);
    el.focus();
  };

  const commonProps = {
    ref,
    value,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value);
      detectSuggest(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    onFocus: () => onActivate?.(insertAtCursor),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (suggest && filtered.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); complete(filtered[0]); }
      else if (e.key === 'Escape') setSuggest(null);
    },
    onBlur: () => window.setTimeout(() => setSuggest(null), 140),
  };

  return (
    <div style={{ position: 'relative' }}>
      {multiline
        ? <textarea {...commonProps} style={{ ...field, minHeight: 62, resize: 'vertical' }} />
        : <input {...commonProps} style={field} />}
      {suggest && filtered.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 40, top: 'calc(100% + 4px)', left: 0, minWidth: 240, maxWidth: '100%',
          background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow-2)', padding: 4, maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.map((k) => (
            <button
              key={k}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); complete(k); }}
              style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text-0)', padding: '7px 9px', borderRadius: 8, fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-hi)' }}>{`{{${k}}}`}</span>
              <span style={{ color: 'var(--text-2)' }}>{PUSH_VARIABLES[k]?.label ?? k}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Список шаблонов ──────────────────────────────────────────────────────────
function TemplatesTab(): React.ReactElement {
  const [templates, setTemplates] = useState<NotificationTemplateDTO[]>([]);
  const [editing, setEditing] = useState<NotificationTemplateDTO | null>(null);

  const load = (): void => { void adminPushApi.templates().then((r) => setTemplates(r.templates)); };
  useEffect(load, []);

  if (editing) {
    return <TemplateEditor template={editing} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />;
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '2px 0 12px' }}>
        Готовые сообщения, которые сервис отправляет автоматически. Нажмите «Изменить», чтобы отредактировать текст и оформление.
      </p>
      <AdminSurface>
        {templates.length === 0 ? <AdminEmpty>Шаблонов нет</AdminEmpty> : templates.map((t) => {
          const meta = PUSH_TYPE_META[t.type];
          return (
            <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: '1px solid var(--line-1)' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-1)' }}>
                <Icon name={(meta?.icon ?? 'bell') as never} size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {meta?.label ?? t.type}
                  {!t.enabled && <Chip tone="neutral">выключен</Chip>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {meta?.description ?? `${t.title} — ${t.body}`}
                </div>
              </div>
              <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(t)}>Изменить</Button>
            </div>
          );
        })}
      </AdminSurface>
    </div>
  );
}

// ── Редактор шаблона ─────────────────────────────────────────────────────────
function TemplateEditor({ template, onBack, onSaved }: { template: NotificationTemplateDTO; onBack: () => void; onSaved: () => void }): React.ReactElement {
  const [e, setE] = useState<NotificationTemplateDTO>(template);
  const [advanced, setAdvanced] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const activeInsert = useRef<((text: string) => void) | null>(null);

  const meta = PUSH_TYPE_META[e.type];
  const vars = TYPE_VARIABLES[e.type] ?? [];
  const set = (p: Partial<NotificationTemplateDTO>): void => setE((cur) => ({ ...cur, ...p }));

  const save = async (): Promise<void> => {
    setStatus('saving');
    const { type, updatedAt, ...patch } = e;
    void type; void updatedAt;
    try {
      await adminPushApi.updateTemplate(e.type, patch);
      setStatus('saved');
      window.setTimeout(onSaved, 700);
    } catch {
      setStatus('error');
    }
  };

  return (
    <AdminSurface style={{ padding: 20, maxWidth: 620 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19 }}>{meta?.label ?? e.type}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{meta?.description}</div>
        </div>
        <Button size="sm" variant="ghost" icon="arrow" onClick={onBack}>Назад</Button>
      </div>

      {/* Включатель */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg-2)', boxShadow: 'inset 0 0 0 1px var(--line-1)', cursor: 'pointer' }}>
        <input type="checkbox" checked={e.enabled} onChange={(ev) => set({ enabled: ev.target.checked })} />
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Уведомление включено</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>— выключенные не отправляются</span>
      </label>

      {/* Переменные */}
      {vars.length > 0 && (
        <div style={{ margin: '16px 0 4px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>Переменные</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '1px 0 8px' }}>
            Подставляются автоматически. Нажмите, чтобы вставить в поле, или начните печатать <code style={{ fontFamily: 'var(--font-mono)' }}>{'{{'}</code> прямо в тексте.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {vars.map((k) => (
              <button
                key={k}
                type="button"
                title={`Пример: ${PUSH_VARIABLES[k]?.example ?? ''}`}
                onMouseDown={(ev) => { ev.preventDefault(); activeInsert.current?.(`{{${k}}}`); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--bg-2)', color: 'var(--text-1)', cursor: 'pointer', fontSize: 12.5 }}
              >
                <Icon name="plus" size={11} />
                {PUSH_VARIABLES[k]?.label ?? k}
              </button>
            ))}
          </div>
        </div>
      )}

      <Label>Заголовок</Label>
      <VarInput value={e.title} onChange={(v) => set({ title: v })} available={vars} onActivate={(fn) => (activeInsert.current = fn)} />

      <Label>Текст</Label>
      <VarInput value={e.body} onChange={(v) => set({ body: v })} available={vars} multiline onActivate={(fn) => (activeInsert.current = fn)} />

      <Label hint="Куда попадёт пользователь, нажав на уведомление">Ссылка при нажатии</Label>
      <VarInput value={e.url} onChange={(v) => set({ url: v })} available={vars} onActivate={(fn) => (activeInsert.current = fn)} />

      {/* Живой предпросмотр */}
      <Label>Как увидит пользователь</Label>
      <div style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 'var(--r-md)', background: 'var(--bg-2)', boxShadow: 'inset 0 0 0 1px var(--line-1)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--accent-soft)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-hi)' }}>
          <Icon name={(meta?.icon ?? 'bell') as never} size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, wordBreak: 'break-word' }}>{previewText(e.title) || 'Заголовок'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 1, wordBreak: 'break-word' }}>{previewText(e.body) || 'Текст уведомления'}</div>
        </div>
      </div>

      {/* Дополнительно */}
      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 13, padding: 0 }}
      >
        <Icon name="chevron" size={13} style={{ transform: advanced ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
        Дополнительные настройки
      </button>

      {advanced && (
        <div style={{ marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--line-1)' }}>
          <Label hint="Сколько сервис пытается доставить уведомление, пока устройство офлайн">Срок доставки</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {TTL_PRESETS.map((p) => {
              const active = e.ttl === p.value;
              return (
                <button key={p.value} type="button" onClick={() => set({ ttl: p.value })} style={{
                  padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5,
                  border: '1px solid ' + (active ? 'var(--accent-hi)' : 'var(--line-2)'),
                  background: active ? 'var(--accent-soft)' : 'var(--bg-2)', color: active ? 'var(--accent-hi)' : 'var(--text-1)',
                }}>{p.label}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Сейчас: {formatTtl(e.ttl)}</div>

          <Label hint="Насколько срочно показать уведомление">Приоритет</Label>
          <select style={field} value={e.urgency} onChange={(ev) => set({ urgency: ev.target.value as NotificationTemplateDTO['urgency'] })}>
            {URGENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>)}
          </select>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Label hint="Крупная картинка уведомления">Иконка (URL)</Label>
              <input style={field} value={e.icon} onChange={(ev) => set({ icon: ev.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <Label hint="Мелкий значок в строке состояния">Значок (URL)</Label>
              <input style={field} value={e.badge} onChange={(ev) => set({ badge: ev.target.value })} />
            </div>
          </div>

          <Label hint="Новое уведомление с той же группой заменяет предыдущее — чтобы не спамить. Можно оставить пустым">Группировка</Label>
          <VarInput value={e.tag ?? ''} onChange={(v) => set({ tag: v || null })} available={vars} onActivate={(fn) => (activeInsert.current = fn)} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={e.requireInteraction} onChange={(ev) => set({ requireInteraction: ev.target.checked })} />
              Не исчезает само <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>— висит, пока пользователь не закроет</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={e.silent} onChange={(ev) => set({ silent: ev.target.checked })} />
              Без звука <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>— придёт тихо, без звука и вибрации</span>
            </label>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <Button size="sm" variant="primary" disabled={status === 'saving'} onClick={() => void save()}>
          {status === 'saving' ? 'Сохранение…' : 'Сохранить'}
        </Button>
        {status === 'saved' && <Chip tone="success">Сохранено</Chip>}
        {status === 'error' && <span style={{ fontSize: 12.5, color: 'var(--accent-hi)' }}>Ошибка сохранения</span>}
      </div>
    </AdminSurface>
  );
}

// ── Рассылки ─────────────────────────────────────────────────────────────────
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

  const loadHistory = (): void => { void adminPushApi.broadcasts().then((r) => setHistory(r.broadcasts)); };
  useEffect(loadHistory, []);

  const buildAudience = (): BroadcastAudience => {
    if (audienceKind === 'role') return { kind: 'role', role };
    if (audienceKind === 'users') return { kind: 'users', userIds: userIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) };
    return { kind: 'all' };
  };

  const send = async (): Promise<void> => {
    setSending(true);
    setResult(null);
    try {
      const res = await adminPushApi.sendBroadcast({ type, title, body, url, audience: buildAudience() });
      setResult(`Отправлено ${res.queued} из ${res.totalTargets} получателей`);
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
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '-4px 0 6px' }}>Отправьте одно уведомление сразу группе пользователей.</p>
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
            <Label>Кому отправить</Label>
            <select style={field} value={audienceKind} onChange={(e) => setAudienceKind(e.target.value as 'all' | 'role' | 'users')}>
              <option value="all">Всем пользователям</option>
              <option value="role">По роли</option>
              <option value="users">Выбранным людям</option>
            </select>
          </div>
        </div>
        {audienceKind === 'role' && (
          <>
            <Label>Роль</Label>
            <select style={field} value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
              <option value="user">Обычные пользователи</option>
              <option value="admin">Администраторы</option>
            </select>
          </>
        )}
        {audienceKind === 'users' && (
          <>
            <Label hint="Внутренний ID — скопируйте в профиле пользователя, поле «ID для рассылки». Не публичный ID. Несколько — через запятую или пробел">ID пользователей</Label>
            <textarea style={{ ...field, minHeight: 50 }} value={userIds} onChange={(e) => setUserIds(e.target.value)} placeholder="например: cmr1a2b3c000...  cmr9x8y7z000..." />
          </>
        )}
        <Label>Заголовок</Label>
        <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Мы обновили плеер" />
        <Label>Текст</Label>
        <textarea style={{ ...field, minHeight: 60 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Что хотите сообщить пользователям" />
        <Label hint="Куда попадёт пользователь, нажав на уведомление">Ссылка при нажатии</Label>
        <input style={field} value={url} onChange={(e) => setUrl(e.target.value)} />

        <Label>Как увидит пользователь</Label>
        <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 'var(--r-md)', background: 'var(--bg-2)', boxShadow: 'inset 0 0 0 1px var(--line-1)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--accent-soft)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-hi)' }}>
            <Icon name="bell" size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, wordBreak: 'break-word' }}>{title || 'Заголовок'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', wordBreak: 'break-word' }}>{body || 'Текст уведомления'}</div>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <Chip tone="neutral">{typeLabel(b.type)}</Chip>
                <Chip tone="neutral">{audienceLabel(b.audience)}</Chip>
                <Chip tone="neutral">получателей: {b.totalTargets}</Chip>
                <Chip tone="success">отправлено: {b.sent}</Chip>
                {b.failed > 0 && <Chip tone="neutral">не доставлено: {b.failed}</Chip>}
              </div>
            </div>
          ))}
        </AdminSurface>
      </div>
    </div>
  );
}

function audienceLabel(a: BroadcastAudience): string {
  if (a.kind === 'all') return 'всем';
  if (a.kind === 'role') return a.role === 'admin' ? 'администраторам' : 'пользователям';
  return `${a.userIds.length} выбранным`;
}
