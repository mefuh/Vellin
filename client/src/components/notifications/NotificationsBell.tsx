import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification } from '@vellin/shared';
import { Avatar, Button, Icon } from '../../shared';
import { useNotificationsStore } from '../../stores/notificationsStore';
import { useFriendsStore } from '../../stores/friendsStore';
import { friendsApi } from '../../api/friends';
import { useIsNarrow } from '../../hooks/useMediaQuery';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const isNarrow = useIsNarrow();
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const panelOpen = useNotificationsStore((s) => s.panelOpen);
  const notifications = useNotificationsStore((s) => s.notifications);
  const togglePanel = useNotificationsStore((s) => s.togglePanel);
  const closePanel = useNotificationsStore((s) => s.closePanel);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Открытие панели гасит непрочитанные.
  useEffect(() => {
    if (panelOpen && unreadCount > 0) void markAllRead();
  }, [panelOpen]);

  // Клик вне панели (десктоп) закрывает.
  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closePanel();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [panelOpen, closePanel]);

  const goProfile = (username?: string): void => {
    if (!username) return;
    closePanel();
    navigate(`/u/${encodeURIComponent(username)}`);
  };

  const goRoom = (n: AppNotification): void => {
    if (!n.data.roomSlug) return;
    closePanel();
    navigate(`/room/${n.data.roomSlug}`);
  };

  const accept = async (actorId: string): Promise<void> => {
    const req = useFriendsStore.getState().incoming.find((r) => r.user.id === actorId);
    try {
      if (req) await friendsApi.accept(req.id);
    } catch {
      /* ignore — refresh покажет актуальное состояние */
    }
    void useFriendsStore.getState().refresh();
  };
  const decline = async (actorId: string): Promise<void> => {
    const req = useFriendsStore.getState().incoming.find((r) => r.user.id === actorId);
    try {
      if (req) await friendsApi.decline(req.id);
    } catch {
      /* ignore */
    }
    void useFriendsStore.getState().refresh();
  };

  const incomingIds = new Set(useFriendsStore((s) => s.incoming).map((r) => r.user.id));

  const panel = (
    <div
      style={
        isNarrow
          ? {
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: '70svh',
              background: 'var(--bg-1)',
              borderTop: '1px solid var(--line-1)',
              borderRadius: 'var(--r-xl) var(--r-xl) 0 0',
              boxShadow: 'var(--shadow-3)',
              zIndex: 200,
              display: 'flex',
              flexDirection: 'column',
            }
          : {
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: 360,
              maxHeight: 460,
              background: 'var(--bg-1)',
              border: '1px solid var(--line-1)',
              borderRadius: 'var(--r-lg)',
              boxShadow: 'var(--shadow-3)',
              zIndex: 200,
              display: 'flex',
              flexDirection: 'column',
            }
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--line-1)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>Уведомления</span>
        <button
          onClick={() => void markAllRead()}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Прочитать все
        </button>
      </div>
      <div style={{ overflowY: 'auto', padding: 8 }}>
        {notifications.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Пока нет уведомлений
          </div>
        )}
        {notifications.map((n) => (
          <div
            key={n.id}
            style={{
              display: 'flex',
              gap: 10,
              padding: 10,
              borderRadius: 'var(--r-md)',
              background: n.read ? 'transparent' : 'var(--bg-2)',
            }}
          >
            <button
              onClick={() => goProfile(n.actor?.username)}
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: n.actor ? 'pointer' : 'default' }}
            >
              <Avatar
                name={n.actor?.username ?? '?'}
                seed={n.actor?.avatarSeed}
                src={n.actor?.avatarUrl}
                size={36}
              />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text-0)', lineHeight: 1.4 }}>
                <NotificationText n={n} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{timeAgo(n.createdAt)}</div>
              {n.type === 'friend_request' && n.actor && incomingIds.has(n.actor.id) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button size="sm" variant="primary" onClick={() => void accept(n.actor!.id)}>
                    Принять
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void decline(n.actor!.id)}>
                    Отклонить
                  </Button>
                </div>
              )}
              {n.type === 'room_invite' && n.data.roomSlug && (
                <div style={{ marginTop: 8 }}>
                  <Button size="sm" variant="secondary" iconRight="arrow" onClick={() => goRoom(n)}>
                    Перейти
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex' }}>
      <button
        onClick={togglePanel}
        title="Уведомления"
        style={{
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
          width: 36,
          height: 36,
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--line-2)',
          background: panelOpen ? 'var(--bg-3)' : 'var(--bg-1)',
          color: 'var(--text-1)',
          cursor: 'pointer',
        }}
      >
        <Icon name="bell" size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -5,
              right: -5,
              minWidth: 17,
              height: 17,
              padding: '0 4px',
              borderRadius: 9,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 0 0 2px var(--bg-0)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {panelOpen && isNarrow && (
        <div onClick={closePanel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150 }} />
      )}
      {panelOpen && panel}
    </div>
  );
}

function NotificationText({ n }: { n: AppNotification }) {
  const name = n.actor?.username ?? 'Кто-то';
  const strong = { color: 'var(--text-0)', fontWeight: 600 };
  switch (n.type) {
    case 'friend_request':
      return (
        <span>
          <b style={strong}>{name}</b> хочет добавить вас в друзья
        </span>
      );
    case 'friend_accepted':
      return (
        <span>
          <b style={strong}>{name}</b> принял вашу заявку в друзья
        </span>
      );
    case 'room_invite':
      return (
        <span>
          <b style={strong}>{name}</b> приглашает в «{n.data.roomName ?? 'комнату'}»
        </span>
      );
    default:
      return null;
  }
}
