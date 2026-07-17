import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuditLogEntryDTO, AuditLogQuery } from '@vellin/shared';
import { adminAccessApi } from '../../api/adminAccess';
import { ApiHttpError } from '../../api/client';
import { Button, Icon } from '../../shared';
import { useAuthStore } from '../../stores/authStore';
import { useIsNarrow } from '../../hooks/useMediaQuery';
import { AdminPage, AdminSurface, AdminEmpty } from './components/AdminPage';
import { describeAudit, type AuditSeverity } from './auditFormat';

// Наиболее частые действия — для быстрого фильтра. Строка свободная, поэтому
// список лишь подсказка, не ограничение.
const ACTIONS = [
  '', 'user.block', 'user.unblock', 'user.delete', 'room.update', 'room.delete',
  'room.close', 'room.access_ticket', 'broadcast.send', 'push.broadcast',
  'push.template_update', 'role.create', 'role.update', 'role.delete',
  'staff.assign_role', 'dm.view', 'report.resolve',
];

const TARGET_TYPES = ['', 'user', 'room', 'role', 'broadcast', 'push_template', 'push_broadcast', 'conversation'];

// Человеческие подписи для выпадающих фильтров (значение остаётся техническим).
const ACTION_LABEL: Record<string, string> = {
  '': 'все действия',
  'user.block': 'Блокировка пользователя', 'user.unblock': 'Разблокировка', 'user.delete': 'Удаление пользователя',
  'room.update': 'Изменение комнаты', 'room.delete': 'Удаление комнаты', 'room.close': 'Закрытие комнаты',
  'room.access_ticket': 'Вход в комнату', 'broadcast.send': 'Системное сообщение', 'push.broadcast': 'Push-рассылка',
  'push.template_update': 'Изменение push-шаблона', 'role.create': 'Создание роли', 'role.update': 'Изменение роли',
  'role.delete': 'Удаление роли', 'staff.assign_role': 'Назначение роли', 'dm.view': 'Просмотр переписки',
  'report.resolve': 'Решение по жалобе',
};
const TARGET_TYPE_LABEL: Record<string, string> = {
  '': 'все объекты', user: 'Пользователь', room: 'Комната', role: 'Роль', broadcast: 'Рассылка',
  push_template: 'Push-шаблон', push_broadcast: 'Push-рассылка', conversation: 'Переписка',
};

const SEVERITY_COLOR: Record<AuditSeverity, string> = {
  neutral: 'var(--text-3)',
  warn: 'var(--warn)',
  danger: 'var(--accent-hi)',
};

export function AdminAudit() {
  const isNarrow = useIsNarrow();
  const [entries, setEntries] = useState<AuditLogEntryDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const buildQuery = useCallback(
    (cursor?: string): AuditLogQuery => ({
      q: debouncedQ || undefined,
      action: action || undefined,
      targetType: targetType || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      cursor,
      limit: 50,
    }),
    [debouncedQ, action, targetType, from, to],
  );

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const data = await adminAccessApi.audit(buildQuery(cursor));
        setEntries((prev) => (cursor ? [...prev, ...data.entries] : data.entries));
        setNextCursor(data.nextCursor);
        setError(null);
      } catch (e) {
        setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить журнал');
      } finally {
        setLoading(false);
      }
    },
    [buildQuery],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const exporting = useRef(false);
  const exportCsv = async () => {
    if (exporting.current) return;
    exporting.current = true;
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch('/api' + adminAccessApi.auditCsvPath(buildQuery()), {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Не удалось экспортировать CSV');
    } finally {
      exporting.current = false;
    }
  };

  const inputStyle = {
    height: 34,
    padding: '0 10px',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)',
    color: 'var(--text-0)',
    border: '1px solid var(--line-2)',
    fontSize: 13,
  } as const;

  return (
    <AdminPage
      eyebrow="Аудит"
      title="Журнал действий"
      subtitle="Все административные действия: кто, когда, над каким объектом, до и после. Записи неизменяемы."
      glow="rgba(250,204,21,0.2)"
      actions={
        <Button variant="secondary" size="sm" icon="download" onClick={() => void exportCsv()}>
          Экспорт CSV
        </Button>
      }
    >
      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 220px' }}>
          <Icon name="search" size={15} style={{ color: 'var(--text-2)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: email, объект, действие" style={{ ...inputStyle, flex: 1 }} />
        </div>
        <select value={action} onChange={(e) => setAction(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>
          ))}
        </select>
        <select value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          {TARGET_TYPES.map((t) => (
            <option key={t} value={t}>{TARGET_TYPE_LABEL[t] ?? t}</option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} title="С даты" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} title="По дату" />
      </div>

      {error && (
        <div style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', padding: '10px 14px', borderRadius: 'var(--r-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <AdminSurface>
        {entries.length === 0 && !loading ? (
          <AdminEmpty>Записей нет — либо действий ещё не было, либо фильтры слишком узкие</AdminEmpty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {entries.map((e) => (
              <AuditRow key={e.id} entry={e} narrow={isNarrow} />
            ))}
          </div>
        )}
      </AdminSurface>

      {nextCursor && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button variant="ghost" disabled={loading} onClick={() => void load(nextCursor)}>
            {loading ? 'Загрузка…' : 'Показать ещё'}
          </Button>
        </div>
      )}
    </AdminPage>
  );
}

function AuditRow({ entry, narrow }: { entry: AuditLogEntryDTO; narrow: boolean }) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const desc = describeAudit(entry);
  const hasRaw = entry.before != null || entry.after != null || Object.keys(entry.meta).length > 0;
  // Раскрывать можно, если есть что показать человеку (изменения/пояснения/IP) или техданные.
  const hasDetail = desc.changes.length > 0 || desc.notes.length > 0 || !!entry.ip || hasRaw;
  const dot = SEVERITY_COLOR[desc.severity];

  return (
    <div style={{ borderBottom: '1px solid var(--line-1)' }}>
      {narrow ? (
        // Мобайл: две строки — крупный заголовок с точкой-статусом и шевроном,
        // ниже мелким моно время и почта автора (не режем заголовок в узкую
        // колонку, как было со сломанной сеткой 1fr/auto).
        <button
          onClick={() => hasDetail && setOpen((v) => !v)}
          style={{
            width: '100%', display: 'flex', flexDirection: 'column', gap: 4,
            padding: '12px 16px', border: 'none', background: 'transparent',
            cursor: hasDetail ? 'pointer' : 'default', textAlign: 'left', color: 'var(--text-0)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, width: '100%' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, boxShadow: desc.severity !== 'neutral' ? `0 0 7px ${dot}` : 'none' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {desc.title}
            </span>
            {hasDetail && (
              <Icon name="chevronD" size={15} style={{ color: 'var(--text-3)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            )}
          </span>
          <span style={{ display: 'flex', gap: 8, paddingLeft: 16, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
            <span style={{ flexShrink: 0 }}>{new Date(entry.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {entry.actorEmail}</span>
          </span>
        </button>
      ) : (
        <button
          onClick={() => hasDetail && setOpen((v) => !v)}
          style={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: '132px 1fr 210px auto',
            alignItems: 'center',
            gap: 12,
            padding: '11px 16px',
            border: 'none',
            background: 'transparent',
            cursor: hasDetail ? 'pointer' : 'default',
            textAlign: 'left',
            color: 'var(--text-0)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-3)' }}>
            {new Date(entry.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, boxShadow: desc.severity !== 'neutral' ? `0 0 7px ${dot}` : 'none' }} />
            <span style={{ fontSize: 13.5, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {desc.title}
            </span>
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.actorEmail}
          </span>
          {hasDetail ? (
            <Icon name="chevronD" size={15} style={{ color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          ) : (
            <span />
          )}
        </button>
      )}

      {open && hasDetail && (
        <div style={{ padding: '0 16px 14px 34px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {narrow && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{entry.actorEmail}</div>}

          {desc.changes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {desc.changes.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-2)', minWidth: 150 }}>{c.label}</span>
                  {c.value !== undefined ? (
                    <span style={{ color: 'var(--text-0)' }}>{c.value}</span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--text-3)', textDecoration: 'line-through' }}>{c.from}</span>
                      <Icon name="arrow" size={12} style={{ color: 'var(--text-3)' }} />
                      <span style={{ color: 'var(--text-0)', fontWeight: 500 }}>{c.to}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {desc.notes.map((n, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--text-1)' }}>{n}</div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
            {entry.ip && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>IP {entry.ip}</span>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>{entry.action}</span>
            {hasRaw && (
              <button onClick={() => setShowRaw((v) => !v)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11.5, textDecoration: 'underline', padding: 0 }}>
                {showRaw ? 'Скрыть JSON' : 'Технические данные'}
              </button>
            )}
          </div>

          {showRaw && (
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 12 }}>
              {entry.before != null && <JsonBlock label="До" value={entry.before} />}
              {entry.after != null && <JsonBlock label="После" value={entry.after} />}
              {Object.keys(entry.meta).length > 0 && <JsonBlock label="Контекст" value={entry.meta} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 5 }}>
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: '10px 12px',
          background: 'var(--bg-2)',
          borderRadius: 'var(--r-md)',
          fontSize: 11.5,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-1)',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
