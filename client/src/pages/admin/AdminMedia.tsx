import { useCallback, useEffect, useState } from 'react';
import type { MediaCacheEntry } from '@vellin/shared';
import { adminMediaApi } from '../../api/adminInsights';
import { ApiHttpError } from '../../api/client';
import { Button, Chip, Icon } from '../../shared';
import { AdminPage, AdminSurface, AdminEmpty } from './components/AdminPage';
import { ConfirmShell, DialogActions } from './AdminUsers';

function fmtDur(s: number | null): string {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function AdminMedia() {
  const [entries, setEntries] = useState<MediaCacheEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const d = await adminMediaApi.list({ q: debounced || undefined, cursor, limit: 30 });
      setEntries((prev) => (cursor ? [...prev, ...d.entries] : d.entries));
      setNextCursor(d.nextCursor);
      setTotal(d.total);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => { void load(); }, [load]);

  const removeOne = async (sourceUrl: string) => {
    try { await adminMediaApi.delete(sourceUrl); setEntries((p) => p.filter((e) => e.sourceUrl !== sourceUrl)); setTotal((t) => t - 1); }
    catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); }
  };

  return (
    <AdminPage
      eyebrow="Медиа"
      title="Кэш разрешённых медиа"
      subtitle="Резолвы ссылок (YouTube, торренты, прямые файлы) переиспользуются между комнатами. Очистка глобальна — популярные ссылки резолвятся заново при следующем запросе."
      actions={<Button variant="secondary" size="sm" icon="trash" onClick={() => setPurging(true)}>Очистить весь кэш</Button>}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px', maxWidth: 400 }}>
          <Icon name="search" size={16} style={{ color: 'var(--text-2)' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по ссылке или названию"
            style={{ flex: 1, height: 36, padding: '0 12px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--bg-2)', color: 'var(--text-0)', fontSize: 13 }} />
        </div>
        <Chip tone="neutral">{total} записей</Chip>
      </div>

      {error && <div style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', padding: '10px 14px', borderRadius: 'var(--r-md)', fontSize: 13 }}>{error}</div>}

      <AdminSurface>
        {entries.length === 0 && !loading ? <AdminEmpty>Кэш пуст</AdminEmpty> : entries.map((e) => (
          <div key={e.sourceUrl} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
            <Chip tone="neutral">{e.kind}</Chip>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title || e.sourceUrl}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.sourceUrl}</div>
            </div>
            {e.durationSec ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>{fmtDur(e.durationSec)}</span> : null}
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{new Date(e.resolvedAt).toLocaleDateString('ru-RU')}</span>
            {e.expiresAt && new Date(e.expiresAt) < new Date() && <Chip tone="accent">истёк</Chip>}
            <Button variant="ghost" size="sm" icon="trash" onClick={() => void removeOne(e.sourceUrl)} title="Удалить запись" />
          </div>
        ))}
      </AdminSurface>

      {nextCursor && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button variant="ghost" disabled={loading} onClick={() => void load(nextCursor)}>{loading ? 'Загрузка…' : 'Показать ещё'}</Button>
        </div>
      )}

      {purging && (
        <ConfirmShell title="Очистить весь кэш" onClose={() => setPurging(false)}>
          <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>
            Будут удалены все {total} записей кэша. Активные комнаты продолжат играть (у них свой снапшот), но новые запросы резолвятся заново. Действие необратимо.
          </p>
          <DialogActions>
            <Button variant="ghost" onClick={() => setPurging(false)}>Отмена</Button>
            <Button variant="danger" disabled={purging && false} onClick={async () => {
              setPurging(false);
              try { await adminMediaApi.purge(); void load(); } catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); }
            }}>Очистить всё</Button>
          </DialogActions>
        </ConfirmShell>
      )}
    </AdminPage>
  );
}
