import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  FEATURE_FLAG_REPORTS,
  REPORT_REASON_LABELS,
  type ReportDTO,
  type ReportStatus,
  type ReportTargetType,
} from '@vellin/shared';
import { adminReportsApi } from '../../api/adminModerationExtra';
import { ApiHttpError } from '../../api/client';
import { Button, Chip, Icon } from '../../shared';
import { AdminPage, AdminSurface, AdminEmpty } from './components/AdminPage';
import { useAdminAccess } from './AdminAccessContext';
import { useFeatureEnabled } from '../../stores/authStore';
import { ConfirmShell, DialogActions } from './AdminUsers';

const TARGET_LABEL: Record<ReportTargetType, string> = {
  message: 'сообщение', user: 'пользователь', room: 'комната', image: 'изображение', video: 'видео', dm: 'личное сообщение',
};
const STATUS_LABEL: Record<ReportStatus, string> = { open: 'открыта', reviewing: 'в работе', accepted: 'принята', rejected: 'отклонена' };

type Filter = ReportStatus | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Открытые' },
  { key: 'accepted', label: 'Принятые' },
  { key: 'rejected', label: 'Отклонённые' },
  { key: 'all', label: 'Все' },
];

export function AdminReports() {
  const { can } = useAdminAccess();
  const reportsEnabled = useFeatureEnabled(FEATURE_FLAG_REPORTS);
  const [filter, setFilter] = useState<Filter>('open');
  const [reports, setReports] = useState<ReportDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<ReportDTO | null>(null);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const data = await adminReportsApi.list({ status: filter, cursor, limit: 30 });
      setReports((prev) => (cursor ? [...prev, ...data.reports] : data.reports));
      setNextCursor(data.nextCursor);
      setOpenCount(data.openCount);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить жалобы');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const canHandle = can('reports.handle');

  // Жалобы выключены feature-флагом — раздела нет вовсе (в т.ч. по прямой ссылке).
  if (!reportsEnabled) return <Navigate to="/admin" replace />;

  return (
    <AdminPage
      eyebrow="Модерация · жалобы"
      title="Жалобы"
      glow="var(--accent-glow)"
      subtitle="Очередь жалоб пользователей на контент, аккаунты и комнаты."
      actions={openCount > 0 ? <Chip tone="accent">{openCount} открытых</Chip> : undefined}
    >
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                background: active ? 'var(--bg-3)' : 'var(--bg-1)', color: active ? 'var(--text-0)' : 'var(--text-2)',
                boxShadow: active ? 'inset 0 0 0 1px var(--line-2)' : 'inset 0 0 0 1px var(--line-1)',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', padding: '10px 14px', borderRadius: 'var(--r-md)', fontSize: 13 }}>{error}</div>
      )}

      {reports.length === 0 && !loading ? (
        <AdminSurface><AdminEmpty>Жалоб нет — очередь чиста</AdminEmpty></AdminSurface>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} canHandle={canHandle} onResolve={() => setResolveTarget(r)} />
          ))}
        </div>
      )}

      {nextCursor && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button variant="ghost" disabled={loading} onClick={() => void load(nextCursor)}>{loading ? 'Загрузка…' : 'Показать ещё'}</Button>
        </div>
      )}

      {resolveTarget && (
        <ResolveDialog
          report={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onDone={(updated) => {
            setReports((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            setResolveTarget(null);
            void load();
          }}
        />
      )}
    </AdminPage>
  );
}

function ReportCard({ report: r, canHandle, onResolve }: { report: ReportDTO; canHandle: boolean; onResolve: () => void }) {
  const open = r.status === 'open' || r.status === 'reviewing';
  const snap = r.snapshot as Record<string, unknown>;
  const preview = typeof snap.body === 'string' ? snap.body : typeof snap.name === 'string' ? snap.name : null;
  return (
    <AdminSurface style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Chip tone="accent">{REPORT_REASON_LABELS[r.reason]}</Chip>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {TARGET_LABEL[r.targetType]}
            </span>
            {!open && (
              <Chip tone={r.status === 'accepted' ? 'accent' : 'neutral'}>{STATUS_LABEL[r.status]}</Chip>
            )}
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-0)' }}>
            На:{' '}
            {r.targetUserId ? (
              <Link to={`/admin/users/${r.targetUserId}`} style={{ color: 'var(--accent-hi)', textDecoration: 'none' }}>{r.targetLabel ?? r.targetId}</Link>
            ) : (
              <span>{r.targetLabel ?? r.targetId}</span>
            )}
          </div>
          {preview && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--text-1)', wordBreak: 'break-word' }}>
              «{preview.slice(0, 220)}»
            </div>
          )}
          {r.comment && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)' }}>Комментарий: {r.comment}</div>}
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span>от {r.reporterName ?? 'неизвестно'}</span>
            <span>·</span>
            <span>{new Date(r.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            {r.handledByEmail && <><span>·</span><span>решение: {r.handledByEmail}</span></>}
          </div>
          {r.resolutionNote && <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-2)' }}>Резолюция: {r.resolutionNote}</div>}
        </div>
        {open && canHandle && (
          <Button variant="secondary" size="sm" icon="check" onClick={onResolve}>Рассмотреть</Button>
        )}
      </div>
    </AdminSurface>
  );
}

function ResolveDialog({ report, onClose, onDone }: { report: ReportDTO; onClose: () => void; onDone: (r: ReportDTO) => void }) {
  const [block, setBlock] = useState(false);
  const [warn, setWarn] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (decision: 'accept' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminReportsApi.resolve(report.id, {
        decision,
        block: decision === 'accept' ? block : false,
        warn: decision === 'accept' ? warn : false,
        note: note.trim() || undefined,
      });
      onDone(res.report);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
      setBusy(false);
    }
  };

  return (
    <ConfirmShell title="Решение по жалобе" onClose={onClose}>
      <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>
        Жалоба на <b>{report.targetLabel ?? report.targetId}</b> ({REPORT_REASON_LABELS[report.reason]}).
      </p>
      {report.targetUserId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Toggle checked={block} onChange={setBlock} label="Заблокировать нарушителя" icon="lock" />
          <Toggle checked={warn} onChange={setWarn} label="Отправить предупреждение (push)" icon="bell" />
        </div>
      )}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Комментарий модератора / текст предупреждения"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: 10, color: 'var(--text-0)', fontFamily: 'inherit', fontSize: 13 }}
      />
      {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}
      <DialogActions>
        <Button variant="ghost" disabled={busy} onClick={() => void submit('reject')}>Отклонить</Button>
        <Button variant="primary" disabled={busy} onClick={() => void submit('accept')}>Принять</Button>
      </DialogActions>
    </ConfirmShell>
  );
}

function Toggle({ checked, onChange, label, icon }: { checked: boolean; onChange: (v: boolean) => void; label: string; icon: 'lock' | 'bell' }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer', textAlign: 'left',
        background: checked ? 'var(--accent-soft)' : 'var(--bg-2)', boxShadow: checked ? 'inset 0 0 0 1px rgba(209,39,27,0.25)' : 'inset 0 0 0 1px var(--line-1)',
        color: checked ? 'var(--text-0)' : 'var(--text-1)', fontSize: 13.5,
      }}
    >
      <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: checked ? 'var(--accent)' : 'transparent', boxShadow: checked ? 'none' : 'inset 0 0 0 1.5px var(--line-3)' }}>
        {checked && <Icon name="check" size={11} style={{ color: '#fff' }} />}
      </span>
      <Icon name={icon} size={15} style={{ color: 'var(--text-2)' }} />
      {label}
    </button>
  );
}
