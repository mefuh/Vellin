import { useState } from 'react';
import { REPORT_REASON_LABELS, type ReportReason, type ReportTargetType } from '@vellin/shared';
import { reportsApi } from '../api/adminModerationExtra';
import { ApiHttpError } from '../api/client';
import { Button, Icon } from '../shared';

const REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

/**
 * Модалка подачи жалобы. Универсальна по типу цели (сообщение/пользователь/
 * комната/медиа). Доступна любому авторизованному пользователю.
 */
export function ReportModal({
  targetType,
  targetId,
  targetLabel,
  onClose,
}: {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await reportsApi.create({ targetType, targetId, reason, comment: comment.trim() || undefined });
      setDone(true);
      window.setTimeout(onClose, 1400);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось отправить жалобу');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1200 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))',
          boxShadow: 'inset 0 0 0 1px var(--glass-bd), var(--shadow-3)', borderRadius: 'var(--r-2xl)', padding: 24,
          width: 'min(460px, 100%)', display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ display: 'inline-flex', width: 48, height: 48, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon name="check" size={24} style={{ color: 'var(--ok)' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Жалоба отправлена</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>Модераторы рассмотрят её.</div>
          </div>
        ) : (
          <>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-display)' }}>Пожаловаться</h2>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
                <Icon name="close" size={18} />
              </button>
            </header>
            {targetLabel && (
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                Жалоба на: <span style={{ color: 'var(--text-0)' }}>{targetLabel}</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {REASONS.map((r) => {
                const active = r === reason;
                return (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-md)',
                      border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13.5,
                      background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
                      boxShadow: active ? 'inset 0 0 0 1px rgba(209,39,27,0.25)' : 'inset 0 0 0 1px var(--line-1)',
                      color: active ? 'var(--text-0)' : 'var(--text-1)',
                    }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, boxShadow: active ? 'inset 0 0 0 4px var(--accent)' : 'inset 0 0 0 1.5px var(--line-3)' }} />
                    {REPORT_REASON_LABELS[r]}
                  </button>
                );
              })}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Комментарий (необязательно)"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: 10, color: 'var(--text-0)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
            {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={onClose}>Отмена</Button>
              <Button variant="primary" disabled={busy} onClick={() => void submit()}>Отправить</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
