import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { PublicProfile as PublicProfileDTO } from '@vellin/shared';
import { Avatar, Button, Icon } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import { useIsMobile } from '../hooks/useMediaQuery';
import { usersApi } from '../api/users';
import { friendsApi } from '../api/friends';
import { ApiHttpError } from '../api/client';
import { AppHeader } from '../components/AppHeader';

export function PublicProfile() {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const refreshFriends = useFriendsStore((s) => s.refresh);

  const [profile, setProfile] = useState<PublicProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await usersApi.profile(username);
      setProfile(res.profile);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  if (user && user.kind === 'guest') return <Navigate to="/library" replace />;
  if (!user) return <Navigate to="/login" replace />;
  // Свой профиль — редирект на редактируемую версию.
  if (profile?.relationship === 'self') return <Navigate to="/profile" replace />;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await Promise.all([load(), refreshFriends()]);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const header = <AppHeader />;

  const actions = profile && <ProfileActions profile={profile} busy={busy} act={act} navigate={navigate} />;

  const identityCard = profile && (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 12,
        padding: 24,
        background: 'var(--bg-1)',
        border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <Avatar
        name={profile.username}
        seed={profile.avatarSeed}
        src={profile.avatarUrl}
        size={96}
        status={profile.online ? (profile.currentRoom ? 'watching' : 'online') : 'offline'}
      />
      <div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{profile.username}</div>
        <div style={{ fontSize: 13, color: profile.online ? 'var(--ok)' : 'var(--text-3)', marginTop: 4 }}>
          {profile.online ? (profile.currentRoom ? `смотрит «${profile.currentRoom.name}»` : 'в сети') : 'не в сети'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{actions}</div>
    </div>
  );

  const details = profile && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section
        style={{
          padding: 24,
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          borderRadius: 'var(--r-lg)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>О себе</div>
        <p style={{ margin: 0, color: profile.bio ? 'var(--text-1)' : 'var(--text-3)', fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {profile.bio ?? 'Пользователь ничего о себе не написал.'}
        </p>
      </section>
      <section
        style={{
          padding: 24,
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          borderRadius: 'var(--r-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: 'var(--text-2)',
          fontSize: 14,
        }}
      >
        <Icon name="star" size={16} />
        На платформе с {new Date(profile.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
      </section>
    </div>
  );

  const body = loading ? (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-3)' }}>Загрузка…</div>
  ) : error ? (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-2)' }}>
      <div style={{ fontSize: 18, marginBottom: 8 }}>{error}</div>
      <Button variant="secondary" size="sm" onClick={() => navigate('/friends')}>
        К друзьям
      </Button>
    </div>
  ) : isMobile ? (
    <main style={{ padding: '20px 14px 64px', maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {identityCard}
      {details}
    </main>
  ) : (
    <div
      style={{
        maxWidth: 1000,
        margin: '0 auto',
        padding: '40px max(24px, 4vw) 80px',
        display: 'grid',
        gridTemplateColumns: '320px minmax(0, 1fr)',
        gap: 40,
        alignItems: 'start',
      }}
    >
      <aside style={{ position: 'sticky', top: 24 }}>{identityCard}</aside>
      <main style={{ minWidth: 0 }}>{details}</main>
    </div>
  );

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)' }}>
      {header}
      {body}
    </div>
  );
}

function ProfileActions({
  profile,
  busy,
  act,
  navigate,
}: {
  profile: PublicProfileDTO;
  busy: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  navigate: (to: string) => void;
}) {
  const joinBtn = profile.currentRoom && (
    <Button size="sm" variant="primary" iconRight="arrow" onClick={() => navigate(`/room/${profile.currentRoom!.slug}`)}>
      Присоединиться
    </Button>
  );

  switch (profile.relationship) {
    case 'none':
      return (
        <>
          {joinBtn}
          <Button size="sm" variant="primary" icon="userPlus" disabled={busy} onClick={() => void act(() => friendsApi.send({ userId: profile.id }))}>
            Добавить в друзья
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => friendsApi.block(profile.id))}>
            Заблокировать
          </Button>
        </>
      );
    case 'incoming':
      return (
        <>
          {joinBtn}
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void act(() => friendsApi.send({ userId: profile.id }))}>
            Принять заявку
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => friendsApi.remove(profile.id))}>
            Отклонить
          </Button>
        </>
      );
    case 'outgoing':
      return (
        <>
          {joinBtn}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => friendsApi.remove(profile.id))}>
            Отменить заявку
          </Button>
        </>
      );
    case 'friends':
      return (
        <>
          {joinBtn}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => friendsApi.remove(profile.id))}>
            Удалить из друзей
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => friendsApi.block(profile.id))}>
            Заблокировать
          </Button>
        </>
      );
    case 'blocked':
      return (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(() => friendsApi.unblock(profile.id))}>
          Разблокировать
        </Button>
      );
    default:
      return null;
  }
}
