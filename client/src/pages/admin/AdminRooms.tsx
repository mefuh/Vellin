import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminAccessMode, AdminRoomSummary } from '@vellin/shared';
import { adminApi } from '../../api/admin';
import { ApiHttpError } from '../../api/client';
import { Button, Chip, Icon } from '../../shared';
import { AdminRoomEdit } from './AdminRoomEdit';
import { ConfirmShell, DialogActions } from './AdminUsers';
import { useIsNarrow } from '../../hooks/useMediaQuery';

const PAGE_LIMIT = 20;

export const ADMIN_TICKET_STORAGE_PREFIX = 'vellin.admin.ticket.';

export function AdminRooms() {
  const navigate = useNavigate();
  const isNarrow = useIsNarrow();
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AdminRoomSummary | null>(null);
  const [closeTarget, setCloseTarget] = useState<AdminRoomSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRoomSummary | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (resetCursor: string | null) => {
      setLoading(true);
      try {
        const data = await adminApi.listRooms({
          q: debounced || undefined,
          cursor: resetCursor ?? undefined,
          limit: PAGE_LIMIT,
        });
        setRooms((prev) => (resetCursor ? [...prev, ...data.rooms] : data.rooms));
        setNextCursor(data.nextCursor);
        setError(null);
      } catch (e) {
        setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить комнаты');
      } finally {
        setLoading(false);
      }
    },
    [debounced],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const enterAs = async (room: AdminRoomSummary, mode: AdminAccessMode) => {
    try {
      const t = await adminApi.accessTicket(room.id, mode);
      sessionStorage.setItem(
        ADMIN_TICKET_STORAGE_PREFIX + room.slug,
        JSON.stringify({ wsTicket: t.wsTicket, mode: t.mode, room: t.room, issuedAt: Date.now() }),
      );
      navigate(`/room/${room.slug}?adminMode=${mode}`);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось получить ticket');
    }
  };

  const applyUpdated = (updated: AdminRoomSummary) => {
    setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: isNarrow ? 22 : 28, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Комнаты
          </h1>
          <p style={{ marginTop: 6, color: 'var(--text-1)', fontSize: 13 }}>
            Все комнаты сервиса, включая приватные. Кнопка «Войти» обходит пароль и capacity.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 280px', maxWidth: isNarrow ? '100%' : 360, width: isNarrow ? '100%' : undefined }}>
          <Icon name="search" size={16} style={{ color: 'var(--text-2)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или slug"
            style={{
              flex: 1,
              height: 36,
              padding: '0 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--line-2)',
              background: 'var(--bg-2)',
              color: 'var(--text-0)',
              fontSize: 13,
            }}
          />
        </div>
      </header>

      {error && (
        <div style={{ background: 'rgba(209,39,27,0.12)', color: 'var(--accent-hi)', padding: '10px 14px', borderRadius: 'var(--r-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
          gap: 14,
        }}
      >
        {rooms.length === 0 && !loading && (
          <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
            Ничего не найдено
          </div>
        )}
        {rooms.map((room) => (
          <article
            key={room.id}
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line-2)',
              borderRadius: 'var(--r-lg)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {room.name}
                </h3>
                <div style={{ color: 'var(--text-2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Icon name="hash" size={11} /> {room.slug}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {room.isPrivate ? (
                  <Chip tone="neutral" icon="lock">приватная</Chip>
                ) : (
                  <Chip tone="success" icon="globe">публичная</Chip>
                )}
                {room.isActive && (
                  <Chip tone="live">LIVE · {room.liveParticipants}</Chip>
                )}
              </div>
            </div>

            <div style={{ color: 'var(--text-2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="user" size={12} /> {room.ownerUsername}
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-3)' }} />
              <span title={room.ownerEmail ?? ''}>{room.ownerEmail}</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <Button variant="primary" size="sm" icon="arrow" onClick={() => void enterAs(room, 'normal')}>
                Войти
              </Button>
              <Button variant="secondary" size="sm" icon="eye" onClick={() => void enterAs(room, 'shadow')}>
                Подсмотреть
              </Button>
              <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditTarget(room)}>
                Изменить
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="close"
                disabled={!room.isActive}
                onClick={() => setCloseTarget(room)}
              >
                Закрыть
              </Button>
              <Button variant="danger" size="sm" icon="trash" onClick={() => setDeleteTarget(room)}>
                Удалить
              </Button>
            </div>
          </article>
        ))}
      </div>

      {nextCursor && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => void load(nextCursor)}
          >
            {loading ? 'Загрузка…' : 'Показать ещё'}
          </Button>
        </div>
      )}

      {editTarget && (
        <AdminRoomEdit
          room={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(u) => {
            applyUpdated(u);
            setEditTarget(null);
          }}
        />
      )}
      {closeTarget && (
        <ConfirmShell title="Закрыть комнату" onClose={() => setCloseTarget(null)}>
          <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>
            Все участники <b>{closeTarget.name}</b> будут немедленно отключены.
            Сама запись комнаты сохранится — её можно будет открыть снова.
          </p>
          <DialogActions>
            <Button variant="ghost" onClick={() => setCloseTarget(null)}>Отмена</Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  const r = await adminApi.closeRoom(closeTarget.id);
                  applyUpdated({ ...closeTarget, isActive: false, liveParticipants: 0 });
                  setCloseTarget(null);
                  setError(`Закрыто. Отключено ${r.kicked} участников.`);
                  window.setTimeout(() => setError(null), 4000);
                } catch (e) {
                  setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
                }
              }}
            >
              Закрыть сейчас
            </Button>
          </DialogActions>
        </ConfirmShell>
      )}
      {deleteTarget && (
        <ConfirmShell title="Удалить комнату" onClose={() => setDeleteTarget(null)}>
          <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>
            Комната <b>{deleteTarget.name}</b> ({deleteTarget.slug}) будет удалена вместе
            с приглашениями, членствами и сообщениями. Действие необратимо.
          </p>
          <DialogActions>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Отмена</Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await adminApi.deleteRoom(deleteTarget.id);
                  setRooms((prev) => prev.filter((r) => r.id !== deleteTarget.id));
                  setDeleteTarget(null);
                } catch (e) {
                  setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
                }
              }}
            >
              Удалить навсегда
            </Button>
          </DialogActions>
        </ConfirmShell>
      )}
    </div>
  );
}
