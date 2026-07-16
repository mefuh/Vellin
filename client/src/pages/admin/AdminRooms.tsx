import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminAccessMode, AdminRoomSummary } from '@vellin/shared';
import { adminApi } from '../../api/admin';
import { ApiHttpError } from '../../api/client';
import { Button, Chip, Icon, MountainPoster } from '../../shared';
import { AdminRoomEdit } from './AdminRoomEdit';
import { AdminRoomDetail } from './AdminRoomDetail';
import { ConfirmShell, DialogActions } from './AdminUsers';
import { AdminPage, AdminSurface, AdminEmpty } from './components/AdminPage';

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const PAGE_LIMIT = 20;

export const ADMIN_TICKET_STORAGE_PREFIX = 'vellin.admin.ticket.';

export function AdminRooms() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AdminRoomSummary | null>(null);
  const [detailTarget, setDetailTarget] = useState<AdminRoomSummary | null>(null);
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
    <AdminPage
      eyebrow="Модерация"
      title="Комнаты"
      subtitle="Все комнаты сервиса, включая приватные. «Войти» обходит пароль и capacity, «Подсмотреть» — невидимый shadow-режим."
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px', maxWidth: 340 }}>
          <Icon name="search" size={16} style={{ color: 'var(--text-2)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или slug"
            style={{
              flex: 1,
              height: 36,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid var(--line-2)',
              background: 'var(--bg-2)',
              color: 'var(--text-0)',
              fontSize: 13,
            }}
          />
        </div>
      }
    >
      {error && (
        <div style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', padding: '10px 14px', borderRadius: 'var(--r-md)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ background: 'rgba(74,222,128,0.1)', color: 'var(--ok)', padding: '10px 14px', borderRadius: 'var(--r-md)', fontSize: 13 }}>
          {notice}
        </div>
      )}

      {rooms.length === 0 && !loading ? (
        <AdminSurface><AdminEmpty>Ничего не найдено</AdminEmpty></AdminSurface>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))', gap: 14 }}>
          {rooms.map((room) => (
            <AdminSurface key={room.id} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Превью — кликабельно, открывает детали */}
              <button
                onClick={() => setDetailTarget(room)}
                title="Подробнее о комнате"
                style={{ position: 'relative', height: 132, border: 'none', padding: 0, cursor: 'pointer', background: 'var(--bg-3)', display: 'block', width: '100%' }}
              >
                {room.videoPoster ? (
                  <img src={room.videoPoster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <MountainPoster seed={hashSeed(room.slug)} label={room.videoTitle ?? undefined} />
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(10,8,7,0.85))' }} />
                <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', gap: 4, justifyContent: 'space-between' }}>
                  {room.isPrivate ? <Chip tone="neutral" icon="lock">приватная</Chip> : <Chip tone="success" icon="globe">публичная</Chip>}
                  {room.isActive ? <Chip tone="live">LIVE · {room.liveParticipants}</Chip> : <Chip tone="neutral" icon="users">{room.liveParticipants}</Chip>}
                </div>
                {room.videoTitle && (
                  <div style={{ position: 'absolute', left: 10, right: 10, bottom: 8, fontSize: 12, color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Icon name="play" size={12} /> {room.videoTitle}
                  </div>
                )}
              </button>

              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {room.name}
                  </h3>
                  <div style={{ color: 'var(--text-3)', fontSize: 11.5, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                    <Icon name="hash" size={11} /> {room.slug}
                  </div>
                </div>

                <div style={{ color: 'var(--text-2)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
                  <Icon name="user" size={12} /> {room.ownerUsername}
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-3)', flexShrink: 0 }} />
                  <span title="Дата создания">создана {new Date(room.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>

                <div style={{ height: 1, background: 'var(--line-1)', margin: '2px 0' }} />

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <Button variant="primary" size="sm" icon="list" onClick={() => setDetailTarget(room)}>Подробнее</Button>
                  <Button variant="secondary" size="sm" icon="arrow" onClick={() => void enterAs(room, 'normal')}>Войти</Button>
                  <Button variant="ghost" size="sm" icon="eye" onClick={() => void enterAs(room, 'shadow')}>Подсмотреть</Button>
                  <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditTarget(room)}>Изменить</Button>
                  <Button variant="ghost" size="sm" icon="close" disabled={!room.isActive} onClick={() => setCloseTarget(room)}>Закрыть</Button>
                  <Button variant="danger" size="sm" icon="trash" onClick={() => setDeleteTarget(room)}>Удалить</Button>
                </div>
              </div>
            </AdminSurface>
          ))}
        </div>
      )}

      {nextCursor && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button variant="ghost" disabled={loading} onClick={() => void load(nextCursor)}>
            {loading ? 'Загрузка…' : 'Показать ещё'}
          </Button>
        </div>
      )}

      {detailTarget && (
        <AdminRoomDetail
          room={detailTarget}
          onClose={() => setDetailTarget(null)}
          onChanged={() => void load(null)}
        />
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
                  setNotice(`Закрыто. Отключено ${r.kicked} участников.`);
                  window.setTimeout(() => setNotice(null), 4000);
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
    </AdminPage>
  );
}
