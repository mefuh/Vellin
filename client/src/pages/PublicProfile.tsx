import { useEffect, useState, type CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { PublicProfile as PublicProfileDTO } from '@vellin/shared';
import { Avatar, Button, Icon, type IconName } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import { usePresenceStore } from '../stores/presenceStore';
import { useSharedTimeStore } from '../stores/sharedTimeStore';
import { SharedTimeCard } from '../components/profile/SharedTimeCard';
import { lastSeenLabel } from '../utils/lastSeen';
import { useIsMobile } from '../hooks/useMediaQuery';
import { usersApi } from '../api/users';
import { friendsApi } from '../api/friends';
import { titlesApi } from '../api/titles';
import { ApiHttpError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { TitlePoster } from '../components/profile/TitlePoster';

const GENDER_LABEL: Record<string, string> = { male: 'Мужской', female: 'Женский', other: 'Другой' };
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** `YYYY-MM-DD` → «15 мая 2000 г.» без сдвига часового пояса. */
function formatBirthDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${d} ${MONTHS_GEN[m - 1]} ${y} г.`;
}

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
      <span style={{ color: 'var(--text-3)', display: 'grid', placeItems: 'center' }}>
        <Icon name={icon} size={16} />
      </span>
      <span style={{ color: 'var(--text-3)', minWidth: 124 }}>{label}</span>
      <span style={{ color: 'var(--text-1)' }}>{value}</span>
    </div>
  );
}

export function PublicProfile() {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const refreshFriends = useFriendsStore((s) => s.refresh);
  const isSelf = user?.kind === 'user' && user.username.toLowerCase() === username.toLowerCase();

  const [profile, setProfile] = useState<PublicProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Избранное самого зрителя — чтобы подсветить «общие любимые».
  const [myFavIds, setMyFavIds] = useState<Set<number>>(new Set());

  // Live-присутствие из стора (обновляется в реальном времени по WS); до первого
  // пуша используем то, что пришло в REST-ответе профиля.
  const livePresence = usePresenceStore((s) => (profile ? s.byId[profile.id] : undefined));
  const online = livePresence?.online ?? profile?.online ?? false;
  const liveRoom = livePresence?.currentRoom ?? profile?.currentRoom ?? null;
  const lastSeenAt = livePresence?.lastSeenAt ?? profile?.lastSeenAt ?? null;

  // Пока пользователь офлайн — раз в 30с форсим ре-рендер, чтобы относительное
  // «был в сети N минут назад» дотикивало само, без обновления страницы.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (online || !lastSeenAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [online, lastSeenAt]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await usersApi.profile(username);
      setProfile(res.profile);
      // Засеять стор присутствия начальным состоянием из REST-ответа.
      usePresenceStore.getState().apply({
        userId: res.profile.id,
        online: res.profile.online,
        currentRoom: res.profile.currentRoom,
        lastSeenAt: res.profile.lastSeenAt,
      });
      // Гидратировать «совместное время» — дальше живёт от WS shared_time.
      useSharedTimeStore.getState().hydrate(res.profile.id, res.profile.sharedWatch);
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

  useEffect(() => {
    if (user?.kind !== 'user') return;
    let alive = true;
    titlesApi
      .getFavorites()
      .then((r) => {
        if (alive) setMyFavIds(new Set(r.titles.map((t) => t.kpId)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user?.kind]);

  // Подписка на live-присутствие открытого профиля — статус обновляется в
  // реальном времени, пока страница открыта.
  useEffect(() => {
    const id = profile?.id;
    if (!id) return;
    const presence = usePresenceStore.getState();
    presence.watch(id);
    return () => presence.unwatch(id);
  }, [profile?.id]);

  if (user && user.kind === 'guest') return <Navigate to="/library" replace />;
  if (!user) return <Navigate to="/login" replace />;

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

  // Полка избранного: десктоп — 5 равных колонок в одну строку; мобайл —
  // горизонтальный скролл, чтобы постеры не были крошечными.
  const favShelfStyle: CSSProperties = isMobile
    ? { display: 'flex', flexWrap: 'nowrap', gap: 14, overflowX: 'auto', paddingBottom: 4 }
    : { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 14 };
  const favItemStyle: CSSProperties = isMobile
    ? { width: 104, flexShrink: 0, position: 'relative' }
    : { position: 'relative' };

  const header = <AppHeader active={isSelf ? 'profile' : undefined} />;

  const actions =
    profile &&
    (isSelf ? (
      <Button size="sm" variant="secondary" icon="settings" onClick={() => navigate('/profile')}>
        Настройки профиля
      </Button>
    ) : (
      <ProfileActions profile={profile} busy={busy} act={act} navigate={navigate} />
    ));

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
        status={online ? (liveRoom ? 'watching' : 'online') : 'offline'}
      />
      <div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{profile.username}</div>
        <div style={{ fontSize: 13, color: online ? 'var(--ok)' : 'var(--text-3)', marginTop: 4 }}>
          {online ? (liveRoom ? `смотрит «${liveRoom.name}»` : 'в сети') : lastSeenLabel(lastSeenAt, profile.gender)}
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
      {(profile.gender || profile.birthDate || profile.city) && (
        <section
          style={{
            padding: 24,
            background: 'var(--bg-1)',
            border: '1px solid var(--line-1)',
            borderRadius: 'var(--r-lg)',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Информация</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {profile.gender && (
              <InfoRow icon="user" label="Пол" value={GENDER_LABEL[profile.gender] ?? profile.gender} />
            )}
            {profile.birthDate && (
              <InfoRow icon="cake" label="Дата рождения" value={formatBirthDate(profile.birthDate)} />
            )}
            {profile.city && <InfoRow icon="mapPin" label="Город" value={profile.city} />}
          </div>
        </section>
      )}
      {!isSelf && <SharedTimeCard peerId={profile.id} peerName={profile.username} />}
      {(profile.favoriteTitles?.length ?? 0) > 0 && (
        <section
          style={{
            padding: 24,
            background: 'var(--bg-1)',
            border: '1px solid var(--line-1)',
            borderRadius: 'var(--r-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Любимое кино</div>
            {(() => {
              const shared = isSelf ? 0 : (profile.favoriteTitles ?? []).filter((t) => myFavIds.has(t.kpId)).length;
              return shared > 0 ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--accent-hi)',
                    background: 'rgba(229,72,77,0.12)',
                    padding: '3px 9px',
                    borderRadius: 999,
                  }}
                >
                  <Icon name="heartFilled" size={12} /> {shared} {shared === 1 ? 'общий' : 'общих'}
                </span>
              ) : null;
            })()}
          </div>
          <div style={favShelfStyle}>
            {(profile.favoriteTitles ?? []).map((t, i) => {
              const shared = !isSelf && myFavIds.has(t.kpId);
              return (
                <div key={t.kpId} style={favItemStyle}>
                  {/* Ранг #1..#5; для «общего» фильма — акцентный бейдж с сердечком. */}
                  <div
                    title={shared ? 'В вашем избранном тоже' : undefined}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      zIndex: 2,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      background: shared ? 'var(--accent)' : 'rgba(0,0,0,0.74)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 6,
                      lineHeight: 1.2,
                    }}
                  >
                    {shared && <Icon name="heartFilled" size={10} />}#{i + 1}
                  </div>
                  <TitlePoster t={t} highlight={shared} />
                </div>
              );
            })}
          </div>
        </section>
      )}

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

  // Секция «Друзья» — на десктопе живёт в левой колонке под карточкой профиля,
  // на мобайле добавляется в общую стопку.
  const friendsCard = profile && profile.friends && (
    <section
      style={{
        padding: 24,
        background: 'var(--bg-1)',
        border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Друзья</div>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{profile.friends.length}</span>
      </div>
      {profile.friends.length === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: 14 }}>Пока нет друзей.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {profile.friends.slice(0, 24).map((f) => (
            <Link
              key={f.id}
              to={`/u/${f.username}`}
              title={f.username}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                width: 72,
                textDecoration: 'none',
                color: 'var(--text-1)',
              }}
            >
              <Avatar name={f.username} seed={f.avatarSeed} src={f.avatarUrl} size={52} />
              <span style={{ fontSize: 12, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.username}
              </span>
            </Link>
          ))}
          {profile.friends.length > 24 && (
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              +{profile.friends.length - 24}
            </div>
          )}
        </div>
      )}
    </section>
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
    <main style={{ padding: '20px 14px 104px', maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {identityCard}
      {details}
      {friendsCard}
    </main>
  ) : (
    <div
      style={{
        // Шире, чтобы в «Любимое кино» помещались все 5 постеров в одну строку
        // без скролла (правая колонка ≈ 760px > 5×112 + отступы).
        maxWidth: 1120,
        margin: '0 auto',
        padding: '40px max(24px, 4vw) 80px',
        display: 'grid',
        gridTemplateColumns: '320px minmax(0, 1fr)',
        gap: 40,
        alignItems: 'start',
      }}
    >
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {identityCard}
        {friendsCard}
      </aside>
      <main style={{ minWidth: 0 }}>{details}</main>
    </div>
  );

  return (
    <div
      style={
        isMobile
          ? { height: '100svh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)', color: 'var(--text-0)' }
          : { minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)' }
      }
    >
      {header}
      {isMobile ? <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{body}</div> : body}
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
  const writeBtn = (
    <Button size="sm" variant="secondary" icon="chat" onClick={() => navigate(`/messages/${encodeURIComponent(profile.username)}`)}>
      Написать
    </Button>
  );

  switch (profile.relationship) {
    case 'none':
      return (
        <>
          {joinBtn}
          {writeBtn}
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
          {writeBtn}
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
          {writeBtn}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => friendsApi.remove(profile.id))}>
            Отменить заявку
          </Button>
        </>
      );
    case 'friends':
      return (
        <>
          {joinBtn}
          {writeBtn}
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
