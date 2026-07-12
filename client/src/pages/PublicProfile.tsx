import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { PublicProfile as PublicProfileDTO } from '@vellin/shared';
import { Button, Icon } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import { usePresenceStore } from '../stores/presenceStore';
import { useSharedTimeStore } from '../stores/sharedTimeStore';
import { SharedTimeCard } from '../components/profile/SharedTimeCard';
import {
  FilmShelf,
  FriendStack,
  HeroAvatar,
  HeroShell,
  SectionLabel,
  StatusPill,
  displayFont,
  presenceTone,
  type PresenceStatus,
} from '../components/profile/ProfileHeroKit';
import { lastSeenLabel } from '../utils/lastSeen';
import { useIsMobile } from '../hooks/useMediaQuery';
import { usersApi } from '../api/users';
import { friendsApi } from '../api/friends';
import { titlesApi } from '../api/titles';
import { ApiHttpError } from '../api/client';
import { AppHeader } from '../components/AppHeader';

const GENDER_LABEL: Record<string, string> = { male: 'Мужской', female: 'Женский', other: 'Другой' };
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** `YYYY-MM-DD` → «26 мая» (день + месяц, без года/сдвига TZ) для мета-строки. */
function formatBirthShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d || m < 1 || m > 12) return iso;
  return `${d} ${MONTHS_GEN[m - 1]}`;
}

/** «в Vellin с мая 2026» из ISO даты регистрации. */
function joinedLabel(iso: string): string {
  const dt = new Date(iso);
  return `в Vellin с ${MONTHS_GEN[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** Разделительная точка мета-строки. */
function Dot() {
  return <span style={{ opacity: 0.3 }}>·</span>;
}

export function PublicProfile() {
  const { publicId = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const refreshFriends = useFriendsStore((s) => s.refresh);
  const isSelf = user?.kind === 'user' && user.publicId === publicId;

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
      const res = await usersApi.profile(publicId);
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
  }, [publicId]);

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

  const header = <AppHeader active={isSelf ? 'profile' : undefined} />;

  // Статус присутствия → цвет/лейбл hero.
  const status: PresenceStatus = online ? (liveRoom ? 'watching' : 'online') : 'offline';
  const tone = presenceTone(status);
  const statusLabel = online
    ? liveRoom
      ? `смотрит «${liveRoom.name}»`
      : 'в сети'
    : lastSeenLabel(lastSeenAt, profile?.gender ?? null);

  const sharedCount = profile && !isSelf
    ? (profile.favoriteTitles ?? []).filter((t) => myFavIds.has(t.kpId)).length
    : 0;
  const sharedIds = !isSelf ? myFavIds : undefined;

  const heroContent = profile && (
    <>
      {/* HERO */}
      <div
        className="hero-anim"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'center',
          textAlign: isMobile ? 'center' : 'left',
          gap: isMobile ? 28 : 'clamp(32px, 5vw, 60px)',
          marginTop: isMobile ? 36 : 48,
          animation: 'heroFadeUp 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) both',
        }}
      >
        <HeroAvatar
          name={profile.username}
          seed={profile.avatarSeed}
          src={profile.avatarUrl}
          status={status}
          size={isMobile ? 148 : 168}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', minWidth: 0 }}>
          <h1
            style={{
              ...displayFont,
              fontWeight: 600,
              fontSize: 'clamp(48px, 13vw, 68px)',
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              margin: 0,
              wordBreak: 'break-word',
            }}
          >
            {profile.username}
          </h1>

          <div style={{ marginTop: 16 }}>
            <StatusPill status={status} label={statusLabel} />
          </div>

          {/* Мета-строка (город/пол/др — приходят только при разрешённой приватности). */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 20,
              color: 'var(--text-2)',
              fontSize: 14,
              justifyContent: isMobile ? 'center' : 'flex-start',
            }}
          >
            {profile.city && <span>{profile.city}</span>}
            {profile.gender && (
              <>
                {profile.city && <Dot />}
                <span>{GENDER_LABEL[profile.gender] ?? profile.gender}</span>
              </>
            )}
            {profile.birthDate && (
              <>
                {(profile.city || profile.gender) && <Dot />}
                <span>{formatBirthShort(profile.birthDate)}</span>
              </>
            )}
            {(profile.city || profile.gender || profile.birthDate) && <Dot />}
            <span style={{ color: 'var(--text-3)' }}>{joinedLabel(profile.createdAt)}</span>
          </div>

          {profile.bio && (
            <p
              style={{
                ...displayFont,
                fontWeight: 400,
                fontSize: 'clamp(18px, 5vw, 22px)',
                lineHeight: 1.4,
                color: 'var(--text-1)',
                margin: '22px 0 0',
                maxWidth: 520,
                whiteSpace: 'pre-wrap',
              }}
            >
              {profile.bio}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginTop: 30,
              justifyContent: isMobile ? 'center' : 'flex-start',
            }}
          >
            {isSelf ? (
              <Button variant="primary" icon="settings" style={PILL} onClick={() => navigate('/profile')}>
                Настройки профиля
              </Button>
            ) : (
              <ProfileActions profile={profile} busy={busy} act={act} navigate={navigate} isMobile={isMobile} />
            )}
          </div>
        </div>
      </div>

      {/* Ваше время вместе (только чужой профиль). */}
      {!isSelf && (
        <div style={{ marginTop: 'clamp(48px, 7vw, 84px)' }}>
          <SharedTimeCard
            peerId={profile.id}
            peerName={profile.username}
            onInvite={() => navigate(`/messages/${encodeURIComponent(profile.publicId)}`)}
          />
        </div>
      )}

      {/* Любимое кино. */}
      {(profile.favoriteTitles?.length ?? 0) > 0 && (
        <div style={{ marginTop: 'clamp(48px, 7vw, 84px)' }}>
          <SectionLabel
            right={
              sharedCount > 0 ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--accent-hi)',
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--accent-glow)',
                    padding: '3px 9px',
                    borderRadius: 999,
                  }}
                >
                  <Icon name="heartFilled" size={12} /> {sharedCount} {sharedCount === 1 ? 'общий' : 'общих'}
                </span>
              ) : undefined
            }
          >
            Любимое кино
          </SectionLabel>
          <FilmShelf titles={profile.favoriteTitles ?? []} sharedIds={sharedIds} />
        </div>
      )}

      {/* Друзья. */}
      {profile.friends && (
        <div style={{ marginTop: 'clamp(48px, 7vw, 84px)' }}>
          <SectionLabel>Друзья · {profile.friends.length}</SectionLabel>
          {profile.friends.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 14 }}>Пока нет друзей.</div>
          ) : (
            <FriendStack friends={profile.friends} />
          )}
        </div>
      )}

      <div style={{ marginTop: 60, textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
        На платформе Vellin с{' '}
        {new Date(profile.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </>
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
  ) : (
    <HeroShell glowColor={tone.color} glowLive={tone.live} maxWidth={1000}>
      <div style={{ paddingBottom: isMobile ? 120 : 96 }}>{heroContent}</div>
    </HeroShell>
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

/** Вид «таблетки» для self-кнопки «Настройки профиля» (Button). */
const PILL = { borderRadius: 999, height: 46, padding: '0 22px', fontSize: 15, fontWeight: 600 } as const;

// ── Стили action-таблеток hero (точно по макету, на токенах) ────────────────
const joinBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 9,
  padding: '14px 24px',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 600,
  fontSize: 15,
  color: '#fff',
  background: 'linear-gradient(135deg, var(--accent-hi), var(--accent))',
  boxShadow: '0 14px 34px -8px var(--accent-glow)',
};
const joinDotStyle: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: '#fff',
  animation: 'heroLivePip 1.4s ease-in-out infinite',
};
const writeBtnStyle: CSSProperties = {
  padding: '14px 24px',
  borderRadius: 999,
  border: '1px solid var(--line-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 600,
  fontSize: 15,
  color: 'var(--text-0)',
  background: 'var(--bg-3)',
};
const addBtnStyle: CSSProperties = {
  padding: '14px 22px',
  borderRadius: 999,
  border: '1px solid var(--accent-glow)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 600,
  fontSize: 15,
  color: 'var(--accent-hi)',
  background: 'var(--accent-soft)',
};
const moreBtnStyle: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: '50%',
  border: '1px solid var(--line-2)',
  background: 'var(--bg-2)',
  color: 'var(--text-2)',
  fontSize: 22,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
const menuPopStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  minWidth: 210,
  background: 'var(--bg-2)',
  border: '1px solid var(--line-2)',
  borderRadius: 14,
  padding: 6,
  boxShadow: 'var(--shadow-3)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  zIndex: 50,
  transformOrigin: 'top right',
  animation: 'heroPopIn 0.26s cubic-bezier(0.22, 1, 0.36, 1) both',
};
const menuItemStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function ProfileActions({
  profile,
  busy,
  act,
  navigate,
  isMobile,
}: {
  profile: PublicProfileDTO;
  busy: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  navigate: (to: string) => void;
  isMobile: boolean;
}) {
  // open — в DOM (вход/выход); closing — проигрывается анимация исчезновения,
  // после которой элемент размонтируется (задержка = длительности выхода).
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  const closeMenu = () => {
    setClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 240);
  };
  const openMenu = () => {
    clearTimeout(closeTimer.current);
    setClosing(false);
    setOpen(true);
  };
  const toggleMenu = () => (open && !closing ? closeMenu() : openMenu());

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // Закрытие меню по клику вне и по Esc (десктоп; с анимацией выхода).
  useEffect(() => {
    if (!open || closing) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closing]);

  // Разблокировка — единственное действие, без основной пары и меню.
  if (profile.relationship === 'blocked') {
    return (
      <button className="hero-press" style={writeBtnStyle} disabled={busy} onClick={() => void act(() => friendsApi.unblock(profile.id))}>
        Разблокировать
      </button>
    );
  }

  const join = profile.currentRoom && (
    <button className="hero-press" style={joinBtnStyle} onClick={() => navigate(`/room/${profile.currentRoom!.slug}`)}>
      <span className="hero-anim" style={joinDotStyle} /> Присоединиться к просмотру
    </button>
  );
  const write = (
    <button className="hero-press" style={writeBtnStyle} onClick={() => navigate(`/messages/${encodeURIComponent(profile.publicId)}`)}>
      Написать
    </button>
  );

  // Основное действие сверх пары «Присоединиться/Написать» + пункты меню «···».
  let extra: ReactNode = null;
  const menuItems: { label: string; onClick: () => void; danger?: boolean }[] = [];
  switch (profile.relationship) {
    case 'none':
      extra = (
        <button className="hero-press" style={addBtnStyle} disabled={busy} onClick={() => void act(() => friendsApi.send({ userId: profile.id }))}>
          ＋ Добавить в друзья
        </button>
      );
      menuItems.push({ label: 'Заблокировать', danger: true, onClick: () => void act(() => friendsApi.block(profile.id)) });
      break;
    case 'incoming':
      extra = (
        <button className="hero-press" style={addBtnStyle} disabled={busy} onClick={() => void act(() => friendsApi.send({ userId: profile.id }))}>
          Принять заявку
        </button>
      );
      menuItems.push({ label: 'Отклонить заявку', onClick: () => void act(() => friendsApi.remove(profile.id)) });
      break;
    case 'outgoing':
      menuItems.push({ label: 'Отменить заявку', onClick: () => void act(() => friendsApi.remove(profile.id)) });
      break;
    case 'friends':
      menuItems.push({ label: 'Удалить из друзей', onClick: () => void act(() => friendsApi.remove(profile.id)) });
      menuItems.push({ label: 'Заблокировать', danger: true, onClick: () => void act(() => friendsApi.block(profile.id)) });
      break;
  }

  return (
    <>
      {join}
      {write}
      {extra}
      {menuItems.length > 0 &&
        (isMobile ? (
          // Мобайл: пункты раскрываются инлайн (полноширинные таблетки,
          // раздвигают контент вниз) — без наезжающего оверлея.
          <>
            <button
              className="more-btn"
              aria-label="Ещё действия"
              aria-haspopup="menu"
              aria-expanded={open}
              style={moreBtnStyle}
              onClick={toggleMenu}
            >
              ⋯
            </button>
            {open && (
              <div role="menu" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
                {menuItems.map((it, i) => (
                  <button
                    key={it.label}
                    role="menuitem"
                    className="hero-press hero-anim"
                    disabled={busy}
                    style={{
                      width: '100%',
                      padding: '13px 20px',
                      borderRadius: 999,
                      border: `1px solid ${it.danger ? 'var(--accent-glow)' : 'var(--line-2)'}`,
                      background: it.danger ? 'var(--accent-soft)' : 'var(--bg-2)',
                      color: it.danger ? 'var(--accent-hi)' : 'var(--text-1)',
                      fontFamily: 'inherit',
                      fontWeight: 600,
                      fontSize: 15,
                      cursor: 'pointer',
                      // Каскад: появление снизу вверх, исчезновение — вниз с блюром.
                      animation: closing
                        ? 'heroFadeOut 0.18s ease both'
                        : 'heroFadeUp 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
                      animationDelay: `${(closing ? menuItems.length - 1 - i : i) * 0.045}s`,
                    }}
                    onClick={() => {
                      closeMenu();
                      it.onClick();
                    }}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          // Десктоп: выпадающее меню-поповер.
          <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              className="more-btn"
              aria-label="Ещё действия"
              aria-haspopup="menu"
              aria-expanded={open}
              style={moreBtnStyle}
              onClick={toggleMenu}
            >
              ⋯
            </button>
            {open && (
              <div
                role="menu"
                className="hero-anim"
                style={{
                  ...menuPopStyle,
                  animation: closing
                    ? 'heroPopOut 0.16s ease both'
                    : 'heroPopIn 0.26s cubic-bezier(0.22, 1, 0.36, 1) both',
                }}
              >
                {menuItems.map((it, i) => (
                  <button
                    key={it.label}
                    role="menuitem"
                    className="pf-menu-item hero-anim"
                    disabled={busy}
                    style={{
                      ...menuItemStyle,
                      color: it.danger ? 'var(--accent-hi)' : 'var(--text-1)',
                      // Вход — каскад пунктов; выход целиком проигрывает контейнер.
                      animation: closing ? 'none' : 'heroFadeUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
                      animationDelay: closing ? '0s' : `${0.04 + i * 0.045}s`,
                    }}
                    onClick={() => {
                      closeMenu();
                      it.onClick();
                    }}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
    </>
  );
}
