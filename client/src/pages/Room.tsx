import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DEFAULT_GUEST_PERMISSIONS, type RoomPermissions } from '@vellin/shared';
import { Button, Chip, VellinLogo, Avatar } from '../shared';
import { Icon } from '../shared/Icon';
import { useAuthStore } from '../stores/authStore';
import { useRoomStore } from '../stores/roomStore';
import { useUIStore } from '../stores/uiStore';
import { roomsApi } from '../api/rooms';
import { ApiHttpError } from '../api/client';
import { useRoomSync } from '../hooks/useRoomSync';
import { useIsMobile } from '../hooks/useMediaQuery';
import { VideoPlayer } from '../components/room/VideoPlayer';
import { RoomChat } from '../components/room/RoomChat';
import { ReactionsOverlay } from '../components/room/ReactionsOverlay';
import { InviteModal } from '../components/room/InviteModal';
import { CreateRoomModal } from '../components/CreateRoomModal';
import { PlaylistPanel } from '../components/room/PlaylistPanel';
import { ParticipantMenu } from '../components/room/ParticipantMenu';
import { PermissionsModal } from '../components/room/PermissionsModal';
import { membersApi } from '../api/members';

type AccessState =
  | { kind: 'loading' }
  | { kind: 'needsPassword'; message?: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

export function Room() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite') ?? undefined;
  const user = useAuthStore((s) => s.user);
  const room = useRoomStore((s) => s.room);
  const participants = useRoomStore((s) => s.participants);
  const video = useRoomStore((s) => s.video);
  const playlist = useRoomStore((s) => s.playlist);
  const historyLength = useRoomStore((s) => s.historyLength);
  const you = useRoomStore((s) => s.you);
  const messages = useRoomStore((s) => s.messages);
  const reactions = useRoomStore((s) => s.reactions);
  const kicked = useRoomStore((s) => s.kicked);
  const chatCollapsed = useUIStore((s) => s.chatCollapsed);
  const toggleChat = useUIStore((s) => s.toggleChat);
  const isMobile = useIsMobile();

  // On mobile, the chat is a bottom-sheet that overlays the player; it would be
  // jarring to land in a room with the sheet already open (especially if the
  // user's last desktop session left it expanded). Force-collapse once on
  // mobile entry; user can tap the pill to reopen.
  useEffect(() => {
    if (isMobile && !chatCollapsed) toggleChat();
    // We only want this on mount/breakpoint change, not on every toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const [password, setPassword] = useState('');
  const [access, setAccess] = useState<AccessState>({ kind: 'loading' });
  const [wsError, setWsError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [permsFor, setPermsFor] = useState<string | null>(null);

  // Probe access on mount/slug change.
  useEffect(() => {
    let active = true;
    setAccess({ kind: 'loading' });
    roomsApi
      .join({ slug, inviteToken })
      .then(() => {
        if (!active) return;
        setAccess({ kind: 'ready' });
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiHttpError) {
          if (err.status === 401 || err.status === 403) {
            setAccess({ kind: 'needsPassword', message: err.payload.message });
          } else {
            setAccess({ kind: 'error', message: err.payload.message });
          }
        } else {
          setAccess({ kind: 'error', message: 'Не удалось подключиться' });
        }
      });
    return () => {
      active = false;
    };
  }, [slug, inviteToken]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await roomsApi.join({ slug, password, inviteToken });
      setAccess({ kind: 'ready' });
    } catch (err) {
      const message = err instanceof ApiHttpError ? err.payload.message : 'Неверный пароль';
      setAccess({ kind: 'needsPassword', message });
    }
  };

  const enabled = access.kind === 'ready';
  const accessPassword = access.kind === 'ready' ? password : undefined;
  const { state: wsState, send, client } = useRoomSync({
    slug,
    enabled,
    password: accessPassword,
    inviteToken,
    onError: setWsError,
  });

  const onChangeVideoUrl = useCallback(
    (url: string) => {
      if (!url) return;
      send({ t: 'video_set_url', url, clientTs: Date.now() });
    },
    [send],
  );

  // Redirect kicked users back to the library.
  useEffect(() => {
    if (!kicked) return;
    setWsError('Вас удалили из комнаты');
    const id = window.setTimeout(() => {
      navigate('/library', { replace: true });
    }, 600);
    return () => window.clearTimeout(id);
  }, [kicked, navigate]);

  const role = you?.role ?? 'guest';
  const perms: RoomPermissions = you?.permissions ?? DEFAULT_GUEST_PERMISSIONS;
  const isOwner = role === 'owner';
  const isAdminOrOwner = role === 'owner' || role === 'admin';

  // Playlist auto-advance leader: owner if online, else the longest-joined
  // participant with canPlayPause. Only the leader emits video_ended.
  const isPlaylistLeader = useMemo(() => {
    if (!you) return false;
    const owner = participants.find((p) => p.role === 'owner');
    if (owner) return you.userId === owner.userId;
    const eligible = participants
      .filter((p) => p.permissions.canPlayPause)
      .sort((a, b) => a.joinedAt - b.joinedAt);
    return eligible[0]?.userId === you.userId;
  }, [participants, you]);

  const handleKick = useCallback(
    async (userId: string) => {
      if (!room) return;
      try {
        await membersApi.kick(room.id, userId);
      } catch (err) {
        setWsError(err instanceof ApiHttpError ? err.payload.message : 'Не удалось удалить');
      }
    },
    [room],
  );
  const handleSetRole = useCallback(
    async (userId: string, nextRole: 'admin' | 'member') => {
      if (!room) return;
      try {
        await membersApi.setRole(room.id, userId, { role: nextRole });
      } catch (err) {
        setWsError(err instanceof ApiHttpError ? err.payload.message : 'Не удалось изменить роль');
      }
    },
    [room],
  );
  const handleSavePermissions = useCallback(
    async (userId: string, next: RoomPermissions) => {
      if (!room) return;
      await membersApi.setPermissions(room.id, userId, { permissions: next });
    },
    [room],
  );

  if (access.kind === 'loading') {
    return <FullPageStatus title="Подключаемся…" />;
  }
  if (access.kind === 'error') {
    return <FullPageStatus title="Не удалось войти" subtitle={access.message} />;
  }
  if (access.kind === 'needsPassword') {
    return (
      <FullPagePassword
        slug={slug}
        message={access.message}
        password={password}
        onPassword={setPassword}
        onSubmit={submitPassword}
      />
    );
  }

  return (
    <div
      className="h-screen"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-0)',
        color: 'var(--text-0)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          padding: isMobile ? '0 12px' : '0 20px',
          gap: isMobile ? 8 : 16,
          borderBottom: '1px solid var(--line-1)',
          background: 'var(--bg-1)',
          flexShrink: 0,
        }}
      >
        <Link to="/library" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)' }}>
          <Icon name="chevronD" size={14} style={{ transform: 'rotate(90deg)' }} />
          <VellinLogo size={18} />
        </Link>
        {room && !isMobile && (
          <>
            <span style={{ width: 1, height: 24, background: 'var(--line-1)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {room.name}
              </h1>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>
                vellin.app/r/{room.slug}
              </span>
            </div>
            <Chip tone={room.isPrivate ? 'neutral' : 'success'} icon={room.isPrivate ? 'lock' : 'globe'}>
              {room.isPrivate ? 'приватная' : 'публичная'}
            </Chip>
            <Chip tone={wsState === 'open' ? 'live' : 'neutral'}>
              {wsState === 'open' ? 'LIVE' : wsState === 'reconnecting' ? 'переподключение' : 'офлайн'}
            </Chip>
          </>
        )}
        {room && isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {room.name}
            </h1>
            <Chip tone={wsState === 'open' ? 'live' : 'neutral'}>
              {wsState === 'open' ? 'LIVE' : '·'}
            </Chip>
          </div>
        )}
        {!isMobile && <div style={{ flex: 1 }} />}
        {participants.length > 0 && !isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', fontSize: 13 }}>
            <Icon name="users" size={14} /> {participants.length}
          </div>
        )}
        {room && (
          <Button
            variant="secondary"
            icon="link"
            size={isMobile ? 'sm' : 'md'}
            onClick={() => setShowInvite(true)}
            aria-label="Пригласить"
          >
            {isMobile ? '' : 'Пригласить'}
          </Button>
        )}
        {user?.kind === 'user' && (
          <Button
            variant="ghost"
            icon="plus"
            size={isMobile ? 'sm' : 'md'}
            onClick={() => setShowCreate(true)}
            aria-label="Новая комната"
          >
            {isMobile ? '' : 'Новая'}
          </Button>
        )}
      </header>

      {wsError && (
        <div
          style={{
            padding: '8px 20px',
            background: 'rgba(209,39,27,0.12)',
            color: 'var(--accent-hi)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="refresh" size={14} /> {wsError}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : chatCollapsed ? '1fr 72px' : '1fr 620px',
          gap: 12,
          padding: isMobile ? 12 : 16,
          // Reserve bottom space for the collapsed chat pill on mobile.
          paddingBottom: isMobile ? 80 : 16,
          overflow: 'hidden',
        }}
      >
        <main
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? 12 : 14,
            minHeight: 0,
            position: 'relative',
            width: '100%',
            // On desktop, cap by viewport height so 16:9 player stays within (100vh − chrome)
            // and right-align so its edge meets the chat aside. On mobile, full width.
            maxWidth: isMobile ? '100%' : 'calc((100vh - 190px) * 16 / 9)',
            marginInline: isMobile ? '0' : 'auto 0',
            // Scroll only the left column. The page itself never scrolls.
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: isMobile ? 0 : 6,
          }}
        >
          <div style={{ position: 'relative', width: '100%' }}>
            <VideoPlayer
              video={video}
              canPlayPause={perms.canPlayPause}
              canSeek={perms.canSeek}
              canSetVideoUrl={perms.canSetVideoUrl}
              canManagePlaylist={perms.canManagePlaylist}
              nextInQueueId={playlist[0]?.id ?? null}
              hasPrev={historyLength > 0}
              isPlaylistLeader={isPlaylistLeader}
              send={send}
              client={client}
              onRequestUrl={() => setShowVideoPicker(true)}
            />
            <ReactionsOverlay reactions={reactions} />
          </div>
          <PlaylistPanel
            playlist={playlist}
            canManage={perms.canManagePlaylist}
            send={send}
          />
          <RoomInfoCards
            videoUrl={video?.url ?? null}
            videoTitle={video?.resolved?.title ?? video?.title ?? null}
            perms={perms}
            role={role}
            ownerUsername={room?.ownerUsername ?? ''}
            participants={participants}
          />
        </main>

        <RoomChat
          messages={messages}
          participants={participants}
          you={you}
          collapsed={chatCollapsed}
          send={send}
          onToggle={toggleChat}
          variant={isMobile ? 'sheet' : 'sidebar'}
          onOpenParticipantMenu={isAdminOrOwner ? (userId) => setMenuFor(userId) : undefined}
        />
      </div>

      {menuFor && you && (() => {
        const target = participants.find((p) => p.userId === menuFor);
        if (!target) return null;
        return (
          <ParticipantMenu
            participant={target}
            you={you}
            onKick={(uid) => {
              setMenuFor(null);
              void handleKick(uid);
            }}
            onSetRole={(uid, r) => {
              setMenuFor(null);
              void handleSetRole(uid, r);
            }}
            onOpenPermissions={(uid) => {
              setMenuFor(null);
              setPermsFor(uid);
            }}
            onClose={() => setMenuFor(null)}
          />
        );
      })()}

      {permsFor && (() => {
        const target = participants.find((p) => p.userId === permsFor);
        if (!target) return null;
        return (
          <PermissionsModal
            participant={target}
            onClose={() => setPermsFor(null)}
            onSave={async (next) => {
              await handleSavePermissions(target.userId, next);
              setPermsFor(null);
            }}
          />
        );
      })()}

      {showInvite && room && (
        <InviteModal room={room} canCreate={isOwner} onClose={() => setShowInvite(false)} />
      )}
      {showVideoPicker && (
        <VideoUrlModal
          initial={video?.url ?? ''}
          onClose={() => setShowVideoPicker(false)}
          onSubmit={(url) => {
            onChangeVideoUrl(url);
            setShowVideoPicker(false);
          }}
        />
      )}
      {showCreate && (
        <CreateRoomModal onClose={() => setShowCreate(false)} onCreated={(s) => navigate(`/room/${s}`)} />
      )}
    </div>
  );
}

function describePerms(role: string, p: RoomPermissions): string {
  if (role === 'owner') return 'Полные права (владелец)';
  if (role === 'admin') return 'Полные права (админ)';
  if (role === 'guest') return 'Только чат и реакции';
  const tokens = [
    p.canPlayPause && 'play/pause',
    p.canSeek && 'перемотка',
    p.canSetVideoUrl && 'смена видео',
    p.canManagePlaylist && 'плейлист',
  ].filter(Boolean);
  return tokens.length ? `Разрешено: ${tokens.join(', ')}` : 'Только просмотр';
}

function deriveVideoName(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      const id = u.searchParams.get('v');
      if (id) return `YouTube · ${id}`;
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '');
      if (id) return `YouTube · ${id}`;
    }
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
    return u.hostname;
  } catch {
    return url;
  }
}

function RoomInfoCards({
  videoUrl,
  videoTitle,
  perms,
  role,
  ownerUsername,
  participants,
}: {
  videoUrl: string | null;
  videoTitle: string | null;
  perms: RoomPermissions;
  role: string;
  ownerUsername: string;
  participants: { userId: string; username: string; avatarSeed: string; isHost: boolean }[];
}) {
  const displayName = videoTitle ?? (videoUrl ? deriveVideoName(videoUrl) : null);
  return (
    <div className="responsive-cols" data-cols="3">
      <InfoCard title="Текущее видео" icon="film">
        {displayName ? (
          <span
            title={videoUrl ?? undefined}
            style={{ color: 'var(--text-1)', wordBreak: 'break-word' }}
          >
            {displayName.length > 80 ? `${displayName.slice(0, 80)}…` : displayName}
          </span>
        ) : (
          <span style={{ color: 'var(--text-2)' }}>не задано</span>
        )}
      </InfoCard>
      <InfoCard title="Ваши права" icon="crown">
        <span style={{ color: 'var(--text-1)' }}>{describePerms(role, perms)}</span>
        {ownerUsername && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-2)' }}>
            Владелец: {ownerUsername}
          </div>
        )}
      </InfoCard>
      <InfoCard title="Участники" icon="users">
        <div style={{ display: 'flex', gap: -8, alignItems: 'center' }}>
          {participants.slice(0, 5).map((p, i) => (
            <div key={p.userId} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <Avatar
                name={p.username}
                seed={p.avatarSeed}
                size={28}
                ring={p.isHost ? 'accent' : undefined}
              />
            </div>
          ))}
          {participants.length > 5 && (
            <span style={{ marginLeft: 8, color: 'var(--text-2)', fontSize: 12 }}>
              +{participants.length - 5}
            </span>
          )}
        </div>
      </InfoCard>
    </div>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: 'film' | 'crown' | 'users'; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--r-lg)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        <Icon name={icon} size={13} /> {title}
      </div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}

function VideoUrlModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial: string;
  onClose: () => void;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState(initial);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 80,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) onSubmit(url.trim());
        }}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-xl)',
          padding: 'clamp(18px, 4vw, 24px)',
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: 'var(--shadow-3)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Ссылка на видео</h2>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
          Поддерживается YouTube, RuTube, Vimeo, VK, прямые ссылки (mp4 / webm / m3u8 / mpd),
          magnet-ссылки и большинство видео-сайтов — сервер сам извлечёт медиа.
        </p>
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… или magnet:?xt=urn:btih:…"
          style={{
            height: 42,
            padding: '0 14px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--line-2)',
            background: 'var(--bg-2)',
            color: 'var(--text-0)',
            fontSize: 14,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={!url.trim()}>
            Сохранить
          </Button>
        </div>
      </form>
    </div>
  );
}

function FullPageStatus({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 20,
        textAlign: 'center',
        background: 'var(--bg-0)',
        color: 'var(--text-0)',
      }}
    >
      <VellinLogo />
      <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
      {subtitle && <p style={{ color: 'var(--text-2)', margin: 0 }}>{subtitle}</p>}
      <Link to="/library" style={{ marginTop: 12 }}>
        <Button variant="secondary">К библиотеке</Button>
      </Link>
    </div>
  );
}

function FullPagePassword({
  slug,
  message,
  password,
  onPassword,
  onSubmit,
}: {
  slug: string;
  message?: string;
  password: string;
  onPassword: (s: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'var(--bg-0)',
        color: 'var(--text-0)',
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-xl)',
          padding: 'clamp(20px, 5vw, 28px)',
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: 'var(--shadow-3)',
        }}
      >
        <VellinLogo />
        <h2 style={{ margin: 0, fontSize: 22 }}>Приватная комната</h2>
        <p style={{ color: 'var(--text-2)', margin: 0, fontSize: 13 }}>
          /room/{slug} — нужен пароль{message ? `: ${message}` : '.'}
        </p>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          placeholder="Пароль"
          style={{
            height: 44,
            padding: '0 14px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--line-2)',
            background: 'var(--bg-2)',
            color: 'var(--text-0)',
            fontSize: 15,
          }}
        />
        <Button type="submit" variant="primary" full disabled={!password}>
          Войти
        </Button>
        <Link to="/library">
          <Button type="button" variant="ghost" full>
            Назад
          </Button>
        </Link>
      </form>
    </div>
  );
}
