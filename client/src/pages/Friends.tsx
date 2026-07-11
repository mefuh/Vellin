import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { FriendRequest, FriendUser, PublicProfile, Relationship } from '@vellin/shared';
import { Avatar, Button, Icon, type AvatarStatus, type IconName } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import { useIsMobile } from '../hooks/useMediaQuery';
import { friendsApi } from '../api/friends';
import { usersApi } from '../api/users';
import { lastSeenShort } from '../utils/lastSeen';
import { AppHeader } from '../components/AppHeader';

type TabId = 'friends' | 'incoming' | 'outgoing' | 'search';

const NAV: { id: TabId; icon: IconName; label: string }[] = [
  { id: 'friends', icon: 'users', label: 'Друзья' },
  { id: 'incoming', icon: 'bell', label: 'Входящие' },
  { id: 'outgoing', icon: 'send', label: 'Исходящие' },
  { id: 'search', icon: 'search', label: 'Поиск' },
];

export function Friends() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<TabId>('friends');

  const friends = useFriendsStore((s) => s.friends);
  const incoming = useFriendsStore((s) => s.incoming);
  const outgoing = useFriendsStore((s) => s.outgoing);
  const refresh = useFriendsStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (user && user.kind === 'guest') return <Navigate to="/library" replace />;
  if (!user) return <Navigate to="/login" replace />;

  const header = <AppHeader active="friends" />;

  const tabButton = (n: { id: TabId; icon: IconName; label: string }, vertical: boolean) => {
    const isActive = n.id === tab;
    const badge = n.id === 'incoming' && incoming.length > 0 ? incoming.length : 0;
    return (
      <button
        key={n.id}
        onClick={() => setTab(n.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: vertical ? '9px 12px' : '8px 14px',
          borderRadius: 'var(--r-md)',
          cursor: 'pointer',
          border: vertical ? 'none' : '1px solid var(--line-2)',
          textAlign: 'left',
          fontFamily: 'inherit',
          fontSize: 14,
          whiteSpace: 'nowrap',
          background: isActive ? 'var(--bg-3)' : vertical ? 'transparent' : 'var(--bg-1)',
          color: isActive ? 'var(--text-0)' : 'var(--text-1)',
        }}
      >
        <Icon name={n.icon} size={16} />
        {n.label}
        {badge > 0 && (
          <span
            style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 9,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  const content = (
    <>
      {tab === 'friends' && <FriendsList friends={friends} onChanged={refresh} />}
      {tab === 'incoming' && <IncomingList requests={incoming} onChanged={refresh} />}
      {tab === 'outgoing' && <OutgoingList requests={outgoing} onChanged={refresh} />}
      {tab === 'search' && <SearchTab onChanged={refresh} />}
    </>
  );

  if (isMobile) {
    return (
      <div style={{ height: '100svh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)', color: 'var(--text-0)' }}>
        {header}
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 14px 104px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ fontSize: 24, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>Друзья</h1>
          {/* flexShrink:0 — ряд вкладок это фиксированный «хром», а не контент.
              Из-за overflowX:auto он скролл-контейнер, и его min-height:auto = 0,
              поэтому без этого flex-колонка <main> сжимала кнопки по высоте, когда
              список длинный (вкладка «Друзья» переполняла колонку). */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, flexShrink: 0 }}>
            {NAV.map((n) => tabButton(n, false))}
          </div>
          {content}
        </main>
      </div>
    );
  }

  const active = NAV.find((n) => n.id === tab)!;
  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)' }}>
      {header}
      <div
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '36px max(24px, 4vw) 80px',
          display: 'grid',
          gridTemplateColumns: '240px minmax(0, 1fr)',
          gap: 40,
          alignItems: 'start',
        }}
      >
        <aside style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((n) => tabButton(n, true))}
        </aside>
        <main style={{ minWidth: 0, maxWidth: 720 }}>
          <h1 style={{ fontSize: 28, margin: '0 0 22px', fontWeight: 600, letterSpacing: '-0.02em' }}>
            {active.label}
          </h1>
          {content}
        </main>
      </div>
    </div>
  );
}

// ── Карточка человека ─────────────────────────────────────────────────────

function PersonRow({
  publicId,
  username,
  avatarSeed,
  avatarUrl,
  status,
  subtitle,
  actions,
}: {
  publicId: string;
  username: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
  status?: AvatarStatus;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        background: 'var(--bg-1)',
        border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-lg)',
        flexWrap: 'wrap',
      }}
    >
      <Link to={`/u/${encodeURIComponent(publicId)}`} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 180px', minWidth: 0, color: 'inherit' }}>
        <Avatar name={username} seed={avatarSeed} src={avatarUrl} size={42} status={status} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {username}
          </div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{subtitle}</div>}
        </div>
      </Link>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>{text}</div>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>;
}

// ── Друзья ────────────────────────────────────────────────────────────────

function FriendsList({ friends, onChanged }: { friends: FriendUser[]; onChanged: () => Promise<void> }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  // Пока есть офлайн-друзья с известным временем — раз в 30с форсим ре-рендер,
  // чтобы относительное «N минут назад» дотикивало само, без обновления.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!friends.some((f) => !f.online && f.lastSeenAt)) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [friends]);

  const act = async (fn: () => Promise<unknown>, id: string) => {
    setBusy(id);
    try {
      await fn();
      await onChanged();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  if (friends.length === 0) return <EmptyState text="У вас пока нет друзей. Найдите их во вкладке «Поиск»." />;

  return (
    <List>
      {friends.map((f) => (
        <PersonRow
          key={f.id}
          publicId={f.publicId}
          username={f.username}
          avatarSeed={f.avatarSeed}
          avatarUrl={f.avatarUrl}
          status={f.online ? (f.currentRoom ? 'watching' : 'online') : 'offline'}
          subtitle={
            f.online ? (
              f.currentRoom ? (
                <span style={{ color: 'var(--accent-hi)' }}>смотрит «{f.currentRoom.name}»</span>
              ) : (
                'в сети'
              )
            ) : (
              lastSeenShort(f.lastSeenAt)
            )
          }
          actions={
            <>
              {f.currentRoom && (
                <Button size="sm" variant="primary" iconRight="arrow" onClick={() => navigate(`/room/${f.currentRoom!.slug}`)}>
                  Присоединиться
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy === f.id} onClick={() => void act(() => friendsApi.remove(f.id), f.id)}>
                Удалить
              </Button>
              <Button size="sm" variant="ghost" disabled={busy === f.id} onClick={() => void act(() => friendsApi.block(f.id), f.id)}>
                Заблокировать
              </Button>
            </>
          }
        />
      ))}
    </List>
  );
}

// ── Входящие заявки ───────────────────────────────────────────────────────

function IncomingList({ requests, onChanged }: { requests: FriendRequest[]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>, id: string) => {
    setBusy(id);
    try {
      await fn();
      await onChanged();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };
  if (requests.length === 0) return <EmptyState text="Нет входящих заявок." />;
  return (
    <List>
      {requests.map((r) => (
        <PersonRow
          key={r.id}
          publicId={r.user.publicId}
          username={r.user.username}
          avatarSeed={r.user.avatarSeed}
          avatarUrl={r.user.avatarUrl}
          subtitle="хочет добавить вас в друзья"
          actions={
            <>
              <Button size="sm" variant="primary" disabled={busy === r.id} onClick={() => void act(() => friendsApi.accept(r.id), r.id)}>
                Принять
              </Button>
              <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void act(() => friendsApi.decline(r.id), r.id)}>
                Отклонить
              </Button>
            </>
          }
        />
      ))}
    </List>
  );
}

// ── Исходящие заявки ──────────────────────────────────────────────────────

function OutgoingList({ requests, onChanged }: { requests: FriendRequest[]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (requests.length === 0) return <EmptyState text="Нет исходящих заявок." />;
  return (
    <List>
      {requests.map((r) => (
        <PersonRow
          key={r.id}
          publicId={r.user.publicId}
          username={r.user.username}
          avatarSeed={r.user.avatarSeed}
          avatarUrl={r.user.avatarUrl}
          subtitle="заявка отправлена"
          actions={
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === r.id}
              onClick={async () => {
                setBusy(r.id);
                try {
                  await friendsApi.remove(r.user.id);
                  await onChanged();
                } catch {
                  /* ignore */
                } finally {
                  setBusy(null);
                }
              }}
            >
              Отменить
            </Button>
          }
        />
      ))}
    </List>
  );
}

// ── Поиск ─────────────────────────────────────────────────────────────────

function SearchTab({ onChanged }: { onChanged: () => Promise<void> }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) {
      setResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      usersApi
        .search(query)
        .then((res) => {
          if (!cancelled) {
            setResults(res.users);
            setSearched(true);
          }
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const rerun = async () => {
    const query = q.trim();
    if (query) {
      try {
        const res = await usersApi.search(query);
        setResults(res.users);
      } catch {
        /* ignore */
      }
    }
    await onChanged();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: '0 12px' }}>
        <Icon name="search" size={16} style={{ color: 'var(--text-2)' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Имя пользователя…"
          autoFocus
          style={{ flex: 1, height: 44, background: 'transparent', border: 'none', color: 'var(--text-0)', fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>
      {loading && <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '8px 4px' }}>Поиск…</div>}
      {!loading && searched && results.length === 0 && <EmptyState text="Никого не найдено." />}
      <List>
        {results.map((u) => (
          <SearchResultRow key={u.id} profile={u} onChanged={rerun} />
        ))}
      </List>
    </div>
  );
}

function SearchResultRow({ profile, onChanged }: { profile: PublicProfile; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };
  return (
    <PersonRow
      publicId={profile.publicId}
      username={profile.username}
      avatarSeed={profile.avatarSeed}
      avatarUrl={profile.avatarUrl}
      status={profile.online ? (profile.currentRoom ? 'watching' : 'online') : undefined}
      subtitle={profile.bio ?? undefined}
      actions={<RelationshipAction relationship={profile.relationship} busy={busy} run={run} userId={profile.id} publicId={profile.publicId} />}
    />
  );
}

function RelationshipAction({
  relationship,
  busy,
  run,
  userId,
  publicId,
}: {
  relationship: Relationship;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  userId: string;
  publicId: string;
}) {
  switch (relationship) {
    case 'none':
      return (
        <Button size="sm" variant="primary" icon="userPlus" disabled={busy} onClick={() => void run(() => friendsApi.send({ userId }))}>
          Добавить
        </Button>
      );
    case 'outgoing':
      return (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => friendsApi.remove(userId))}>
          Отменить заявку
        </Button>
      );
    case 'incoming':
      return (
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void run(() => friendsApi.send({ userId }))}>
          Принять
        </Button>
      );
    case 'friends':
      return (
        <Link to={`/u/${encodeURIComponent(publicId)}`}>
          <Button size="sm" variant="secondary">
            Профиль
          </Button>
        </Link>
      );
    case 'blocked':
      return (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => friendsApi.unblock(userId))}>
          Разблокировать
        </Button>
      );
    default:
      return null;
  }
}
