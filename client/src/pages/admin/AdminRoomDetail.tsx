import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AdminRoomMemberDTO, AdminRoomSummary, RoomEventDTO } from '@vellin/shared';
import { adminApi } from '../../api/admin';
import { ApiHttpError } from '../../api/client';
import { Avatar, Button, Chip, Icon, MountainPoster } from '../../shared';
import { useIsNarrow } from '../../hooks/useMediaQuery';
import { AdminSurface } from './components/AdminPage';
import { describeRoomEvent, EVENT_SEVERITY_COLOR } from './roomEventFormat';

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const ROLE_LABEL: Record<string, string> = { owner: 'владелец', admin: 'админ', member: 'участник', guest: 'гость' };

export function AdminRoomDetail({ room, onClose, onChanged }: { room: AdminRoomSummary; onClose: () => void; onChanged: () => void }) {
  const isNarrow = useIsNarrow();
  const [members, setMembers] = useState<AdminRoomMemberDTO[]>([]);
  const [events, setEvents] = useState<RoomEventDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AdminRoomMemberDTO | null>(null);

  const loadMembers = useCallback(async () => {
    try { setMembers((await adminApi.roomMembers(room.id)).members); }
    catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка загрузки участников'); }
  }, [room.id]);

  const loadEvents = useCallback(async (cursor?: string) => {
    setLoadingEvents(true);
    try {
      const d = await adminApi.roomEvents(room.id, cursor);
      setEvents((prev) => (cursor ? [...prev, ...d.events] : d.events));
      setNextCursor(d.nextCursor);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка загрузки журнала');
    } finally { setLoadingEvents(false); }
  }, [room.id]);

  useEffect(() => { void loadMembers(); void loadEvents(); }, [loadMembers, loadEvents]);

  const changeRole = async (m: AdminRoomMemberDTO, role: 'admin' | 'member') => {
    setBusyUser(m.userId);
    try { await adminApi.setMemberRole(room.id, m.userId, role); await loadMembers(); void loadEvents(); onChanged(); }
    catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); }
    finally { setBusyUser(null); }
  };
  const remove = async (m: AdminRoomMemberDTO) => {
    setBusyUser(m.userId);
    try { await adminApi.removeMember(room.id, m.userId); setRemoveTarget(null); await loadMembers(); void loadEvents(); onChanged(); }
    catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); setRemoveTarget(null); }
    finally { setBusyUser(null); }
  };

  const liveCount = members.filter((m) => m.isLive).length;

  // Тело (участники + журнал) одинаково для десктопа и мобилки — рендерим один раз.
  const body = (
    <>
      {error && <div style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', padding: '9px 12px', borderRadius: 'var(--r-md)', fontSize: 13 }}>{error}</div>}

      {/* Участники */}
      <section>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>Участники</h3>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{members.length} всего · {liveCount} в сети</span>
            </div>
            <div style={{ borderRadius: 'var(--r-lg)', boxShadow: 'inset 0 0 0 1px var(--line-1)', overflow: 'hidden' }}>
              {members.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Нет данных</div>
              ) : members.map((m) => (
                <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line-1)' }}>
                  <div style={{ position: 'relative' }}>
                    <Avatar seed={m.avatarSeed} src={m.avatarUrl} name={m.username} size={32} />
                    {m.isLive && <span style={{ position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 0 2px var(--bg-1)' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: 'var(--text-0)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.username}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{ROLE_LABEL[m.role]}{m.kind === 'guest' ? ' · гость' : ''}{m.isLive ? ' · в сети' : ''}</div>
                  </div>
                  {m.role === 'owner' ? (
                    <Chip tone="accent" icon="crown">владелец</Chip>
                  ) : (
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {m.kind === 'user' && (
                        <select
                          value={m.role === 'admin' ? 'admin' : 'member'}
                          disabled={busyUser === m.userId}
                          onChange={(e) => void changeRole(m, e.target.value as 'admin' | 'member')}
                          style={{ height: 30, padding: '0 8px', borderRadius: 999, background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--line-2)', fontSize: 12.5, cursor: 'pointer' }}
                        >
                          <option value="member">участник</option>
                          <option value="admin">админ</option>
                        </select>
                      )}
                      <Button variant="ghost" size="sm" icon="userMinus" disabled={busyUser === m.userId} onClick={() => setRemoveTarget(m)} title="Удалить из комнаты" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Журнал событий */}
          <section>
            <h3 style={{ margin: '0 0 10px', fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>Журнал комнаты</h3>
            <div style={{ borderRadius: 'var(--r-lg)', boxShadow: 'inset 0 0 0 1px var(--line-1)', overflow: 'hidden' }}>
              {events.length === 0 && !loadingEvents ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Событий пока нет</div>
              ) : events.map((ev) => {
                const v = describeRoomEvent(ev);
                return (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--line-1)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: EVENT_SEVERITY_COLOR[v.severity], flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', flexShrink: 0, width: 78 }}>
                      {new Date(ev.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.actorName ? <b style={{ color: 'var(--text-0)', fontWeight: 600 }}>{ev.actorName}</b> : <span style={{ color: 'var(--text-3)' }}>система</span>}{' '}{v.phrase}
                    </span>
                  </div>
                );
              })}
            </div>
            {nextCursor && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                <Button variant="ghost" size="sm" disabled={loadingEvents} onClick={() => void loadEvents(nextCursor)}>{loadingEvents ? 'Загрузка…' : 'Показать ещё'}</Button>
              </div>
            )}
          </section>
    </>
  );

  // Подтверждение удаления участника — всегда портал в body (центрированный).
  const removeDialog = removeTarget
    ? createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setRemoveTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-1)', borderRadius: 'var(--r-lg)', boxShadow: 'inset 0 0 0 1px var(--line-2)', padding: 20, width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Удалить участника</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-1)' }}>
              <b>{removeTarget.username}</b> будет отключён от комнаты{removeTarget.isMember ? ' и лишён членства' : ''}. При желании он сможет войти снова (если комната публичная).
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setRemoveTarget(null)}>Отмена</Button>
              <Button variant="danger" disabled={busyUser === removeTarget.userId} onClick={() => void remove(removeTarget)}>Удалить</Button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  // ── Мобилка: встроенный под-экран (не оверлей) — шапка и навигация сайта
  // остаются доступны. Постер — баннером, заголовок и мета НА ПЛОТНОМ фоне под
  // ним (без наезда текста на постер). ──────────────────────────────────────
  if (isNarrow) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <button
          onClick={onClose}
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--bg-2)', color: 'var(--text-1)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}
        >
          <Icon name="arrow" size={15} style={{ transform: 'scaleX(-1)' }} /> Назад к комнатам
        </button>

        <AdminSurface style={{ overflow: 'hidden' }}>
          {/* Постер-баннер */}
          <div style={{ position: 'relative', height: 150, background: 'var(--bg-3)' }}>
            {room.videoPoster ? (
              <img src={room.videoPoster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <MountainPoster seed={hashSeed(room.slug)} label={room.videoTitle ?? undefined} />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 30%, rgba(10,8,7,0.9))' }} />
            <div style={{ position: 'absolute', left: 12, right: 12, bottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {room.isPrivate ? <Chip tone="neutral" icon="lock">приватная</Chip> : <Chip tone="success" icon="globe">публичная</Chip>}
              {room.isActive && <Chip tone="live">LIVE · {room.liveParticipants}</Chip>}
            </div>
          </div>
          {/* Заголовок и мета — на плотном фоне */}
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', wordBreak: 'break-word' }}>{room.name}</h2>
            {room.videoTitle && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent-hi)', minWidth: 0 }}>
                <Icon name="play" size={13} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.videoTitle}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              <span># {room.slug}</span>
              <span>· {room.ownerUsername}</span>
              <span>· {new Date(room.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
        </AdminSurface>

        {body}
        {removeDialog}
      </div>
    );
  }

  // ── Десктоп: оверлей-модалка через портал (постер-hero с текстом поверх). ──
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '5vh 20px', overflowY: 'auto' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(760px, 100%)', background: 'var(--bg-1)', borderRadius: 'var(--r-2xl)',
        boxShadow: 'inset 0 0 0 1px var(--line-2), var(--shadow-3)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ position: 'relative', minHeight: 180, background: 'var(--bg-3)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            {room.videoPoster ? (
              <img src={room.videoPoster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <MountainPoster seed={hashSeed(room.slug)} label={room.videoTitle ?? undefined} />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(10,8,7,0.92))' }} />
          </div>
          <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            <Icon name="close" size={18} />
          </button>
          <div style={{ position: 'relative', padding: '56px 20px 14px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              {room.isPrivate ? <Chip tone="neutral" icon="lock">приватная</Chip> : <Chip tone="success" icon="globe">публичная</Chip>}
              {room.isActive && <Chip tone="live">LIVE · {room.liveParticipants}</Chip>}
              {room.videoTitle && (
                <Chip tone="accent" icon="play">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{room.videoTitle}</span>
                </Chip>
              )}
            </div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(22px,3vw,28px)', fontWeight: 700, letterSpacing: '-0.02em', color: '#fff', wordBreak: 'break-word' }}>{room.name}</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, fontSize: 12.5, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)' }}>
              <span># {room.slug}</span>
              <span>· владелец {room.ownerUsername}</span>
              <span>· создана {new Date(room.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {body}
        </div>
      </div>
      {removeDialog}
    </div>,
    document.body,
  );
}
