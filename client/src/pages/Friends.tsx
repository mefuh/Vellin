import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { FriendRequest, FriendUser, PublicProfile, Relationship } from '@vellin/shared';
import { Avatar } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import { useIsMobile } from '../hooks/useMediaQuery';
import { friendsApi } from '../api/friends';
import { usersApi } from '../api/users';
import { lastSeenPhrase, lastSeenShort } from '../utils/lastSeen';
import { AppHeader } from '../components/AppHeader';
import { HeroShell, displayFont, monoFont, presenceTone, type PresenceStatus } from '../components/profile/ProfileHeroKit';

type TabId = 'friends' | 'incoming' | 'outgoing' | 'search';

const TABS: { id: TabId; label: string }[] = [
  { id: 'friends', label: 'Друзья' },
  { id: 'incoming', label: 'Входящие' },
  { id: 'outgoing', label: 'Исходящие' },
  { id: 'search', label: 'Поиск' },
];

/** Полупрозрачная заливка от цвета — устойчива к теме (как в hero-ките). */
const soft = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** Присутствие друга → статус hero-ките (цвет/«живость»). */
function friendStatus(f: { online: boolean; currentRoom: unknown }): PresenceStatus {
  return f.online ? (f.currentRoom ? 'watching' : 'online') : 'offline';
}

// ── Страница ────────────────────────────────────────────────────────────────

export function Friends() {
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

  const onlineCount = useMemo(() => friends.filter((f) => f.online).length, [friends]);

  if (user && user.kind === 'guest') return <Navigate to="/library" replace />;
  if (!user) return <Navigate to="/login" replace />;

  const body = (
    <HeroShell glowColor="var(--accent)" maxWidth={820}>
      <div style={{ paddingBottom: isMobile ? 124 : 96 }}>
        {/* Hero-заголовок. */}
        <div
          className="hero-anim"
          style={{
            marginTop: isMobile ? 24 : 40,
            animation: 'heroFadeUp 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) both',
          }}
        >
          <h1
            style={{
              ...displayFont,
              fontWeight: 700,
              fontSize: 'clamp(34px, 6vw, 56px)',
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              margin: 0,
            }}
          >
            Друзья
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 14,
              fontSize: 13,
              color: 'var(--text-2)',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span
                aria-hidden
                className="hero-anim"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--ok)',
                  ['--hero-pulse' as string]: soft('var(--ok)', 55),
                  animation: 'heroDotPulse 2s infinite',
                }}
              />
              <span style={{ ...monoFont, fontSize: 13, color: 'var(--ok)' }}>{onlineCount} в сети</span>
            </span>
            <span style={{ opacity: 0.3 }}>·</span>
            <span>
              {friends.length} {plural(friends.length, 'друг', 'друга', 'друзей')} всего
            </span>
          </div>
        </div>

        {/* Липкий pill-таб-бар. */}
        <div
          style={{
            position: 'sticky',
            top: 14,
            zIndex: 40,
            marginTop: isMobile ? 26 : 34,
            display: 'flex',
            justifyContent: isMobile ? 'center' : 'flex-start',
          }}
        >
          <FriendsTabs tab={tab} onTab={setTab} incomingCount={incoming.length} isMobile={isMobile} />
        </div>

        {/* Контент вкладки — ремоунтится по ключу, поэтому мягко всплывает при
            переключении. */}
        <div
          key={tab}
          style={{ marginTop: 28, animation: 'heroFadeUp 0.45s cubic-bezier(0.22, 0.61, 0.36, 1) both' }}
        >
          {tab === 'friends' && <FriendsTab friends={friends} isMobile={isMobile} />}
          {tab === 'incoming' && <IncomingTab requests={incoming} isMobile={isMobile} />}
          {tab === 'outgoing' && <OutgoingTab requests={outgoing} isMobile={isMobile} />}
          {tab === 'search' && <SearchTab isMobile={isMobile} onChanged={refresh} />}
        </div>
      </div>
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
      <AppHeader active="friends" />
      {isMobile ? <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{body}</div> : body}
    </div>
  );
}

// ── Таб-кнопка ────────────────────────────────────────────────────────────────

const tabBase: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 600,
  padding: '9px 16px',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  transition: 'color .25s ease',
  whiteSpace: 'nowrap',
  background: 'transparent',
  color: 'var(--text-2)',
};

/** Пружинистая кривая «магического» переезда подложки — та же, что в MobileDock. */
const SPRING = 'cubic-bezier(.22, 1, .36, 1)';

interface PillRect {
  x: number;
  w: number;
  y: number;
  h: number;
}

/**
 * Таб-бар со скользящей подложкой активной вкладки (magic-move), как в нижнем
 * доке навигации: подложка не появляется заново, а плавно переезжает и меняет
 * ширину. Позиция измеряется по DOM — устойчиво к разным ширинам надписей,
 * гэпам и появлению бейджа.
 */
function FriendsTabs({
  tab,
  onTab,
  incomingCount,
  isMobile,
}: {
  tab: TabId;
  onTab: (t: TabId) => void;
  incomingCount: number;
  isMobile: boolean;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [pill, setPill] = useState<PillRect | null>(null);
  const [animate, setAnimate] = useState(false);

  const activeIndex = TABS.findIndex((t) => t.id === tab);

  useLayoutEffect(() => {
    const el = tabRefs.current[activeIndex];
    if (!el) return;
    setPill({ x: el.offsetLeft, w: el.offsetWidth, y: el.offsetTop, h: el.offsetHeight });
  }, [activeIndex, incomingCount, isMobile]);

  // Переходы включаем только после первой укладки — иначе подложка «прилетала»
  // из нулевой позиции при монтировании страницы.
  useEffect(() => {
    if (pill && !animate) {
      const id = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(id);
    }
  }, [pill, animate]);

  useEffect(() => {
    const onResize = (): void => {
      const el = tabRefs.current[activeIndex];
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth, y: el.offsetTop, h: el.offsetHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeIndex]);

  return (
    // На мобиле бар занимает всю ширину и делит её поровну между вкладками —
    // без скролла и обрезания. Бейдж входящих спозиционирован абсолютно, поэтому
    // его появление не меняет ширину кнопки и не выталкивает «Поиск» за край.
    <div
      className="hero-anim"
      style={{
        position: 'relative',
        display: 'flex',
        gap: 4,
        padding: 5,
        borderRadius: 16,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        border: '1px solid var(--glass-bd)',
        width: isMobile ? '100%' : 'max-content',
        maxWidth: '100%',
        // Всплывает следом за hero-заголовком (у того задержки нет).
        animation: 'heroFadeUp 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) both',
        animationDelay: '0.08s',
      }}
    >
      {pill && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: pill.y,
            height: pill.h,
            width: pill.w,
            transform: `translateX(${pill.x}px)`,
            background: 'var(--bg-3)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset',
            borderRadius: 999,
            zIndex: 0,
            transition: animate ? `transform .42s ${SPRING}, width .42s ${SPRING}` : 'none',
          }}
        />
      )}
      {TABS.map((t, i) => (
        <TabButton
          key={t.id}
          ref={(el) => {
            tabRefs.current[i] = el;
          }}
          label={t.label}
          active={t.id === tab}
          badge={t.id === 'incoming' ? incomingCount : 0}
          isMobile={isMobile}
          onClick={() => onTab(t.id)}
        />
      ))}
    </div>
  );
}

const TabButton = forwardRef<
  HTMLButtonElement,
  { label: string; active: boolean; badge: number; isMobile: boolean; onClick: () => void }
>(function TabButton({ label, active, badge, isMobile, onClick }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        ...tabBase,
        // Подложка активной вкладки рисуется отдельным скользящим слоем — сама
        // кнопка всегда прозрачна, меняется только цвет надписи.
        zIndex: 1,
        color: active ? 'var(--text-0)' : 'var(--text-2)',
        ...(isMobile
          ? {
              // Равные доли ширины: все четыре вкладки всегда помещаются в бар.
              flex: '1 1 0',
              minWidth: 0,
              justifyContent: 'center',
              padding: '9px 4px',
              fontSize: 12.5,
            }
          : {}),
      }}
    >
      {label}
      {badge > 0 && (
        <span
          className="hero-anim"
          style={{
            ...monoFont,
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 999,
            background: 'linear-gradient(135deg, var(--accent-hi), var(--accent))',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px var(--accent-glow)',
            animation: 'heroPopIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
            // На мобиле бейдж уводим в угол абсолютом: он перестаёт занимать
            // место в потоке и не расширяет кнопку при появлении.
            ...(isMobile
              ? {
                  position: 'absolute',
                  top: -1,
                  right: -1,
                  minWidth: 15,
                  height: 15,
                  padding: '0 4px',
                  fontSize: 9,
                  boxShadow: '0 0 0 2px var(--bg-1)',
                }
              : {}),
          }}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
});

// ── Аватар карточки со свечением/индикатором присутствия ─────────────────────

function CardAvatar({
  name,
  seed,
  src,
  status,
  size,
}: {
  name: string;
  seed?: string;
  src?: string | null;
  /** Не задан → нейтральное кольцо без свечения/точки (для заявок). */
  status?: PresenceStatus;
  size: number;
}) {
  const tone = status ? presenceTone(status) : { color: 'var(--text-3)', live: false };
  const showDot = status != null && status !== 'offline';
  const dot = Math.round(size * 0.28);
  return (
    <div style={{ position: 'relative', flex: 'none', width: size, height: size }}>
      {showDot && (
        <div
          aria-hidden
          className={tone.live ? 'hero-anim' : undefined}
          style={{
            position: 'absolute',
            inset: -7,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${soft(tone.color, 45)}, transparent 68%)`,
            filter: 'blur(11px)',
            opacity: tone.live ? 1 : 0.5,
            ...(tone.live ? { animation: 'heroBreathe 4.5s ease-in-out infinite' } : {}),
            zIndex: 0,
          }}
        />
      )}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: size,
          height: size,
          borderRadius: '50%',
          padding: 2,
          background: `linear-gradient(135deg, ${soft(tone.color, 80)}, ${soft(tone.color, 15)})`,
        }}
      >
        <Avatar name={name} seed={seed} src={src} size={size - 4} style={{ display: 'block' }} />
      </div>
      {showDot && (
        <span
          aria-hidden
          className={tone.live ? 'hero-anim' : undefined}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            zIndex: 2,
            width: dot,
            height: dot,
            borderRadius: '50%',
            background: tone.color,
            border: '3px solid var(--bg-0)',
            ...(tone.live ? { ['--hero-pulse' as string]: soft(tone.color, 60), animation: 'heroDotPulse 2s infinite' } : {}),
          }}
        />
      )}
    </div>
  );
}

// ── Карточка-контейнер ────────────────────────────────────────────────────────

type ExitKind = 'accept' | 'reject' | undefined;

function Card({
  children,
  exiting,
  index,
  isMobile,
  highlight,
}: {
  children: ReactNode;
  exiting?: ExitKind;
  index: number;
  isMobile: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className="friend-card"
      data-exiting={exiting ? 'true' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 12 : 16,
        padding: isMobile ? '14px 15px' : '17px 20px',
        borderRadius: 24,
        background: highlight ? 'var(--accent-soft)' : 'var(--bg-1)',
        border: `1px solid ${highlight ? 'var(--accent-glow)' : 'var(--line-1)'}`,
        // На мобиле карточка — строго одна строка: действие остаётся справа и не
        // сваливается под текст (перенос ломал компактный ритм списка).
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        overflow: 'hidden',
        willChange: exiting ? 'max-height, transform, opacity' : undefined,
        pointerEvents: exiting ? 'none' : undefined,
        animation: exiting
          ? `${exiting === 'accept' ? 'friendAccept 0.58s' : 'friendReject 0.4s'} cubic-bezier(0.4, 0, 0.2, 1) forwards`
          : 'heroFadeUp 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) both',
        animationDelay: exiting ? '0s' : `${Math.min(index, 10) * 0.04}s`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Имя + статус-строка. `minWidth: 0` обязателен: иначе flex-элемент не
 * сжимается ниже своего контента и выдавливает кнопку действия из строки
 * карточки на узких экранах.
 */
function CardInfo({ publicId, name, sub }: { publicId: string; name: string; sub: ReactNode }) {
  return (
    <Link
      to={`/u/${encodeURIComponent(publicId)}`}
      style={{ display: 'block', flex: '1 1 auto', minWidth: 0, overflow: 'hidden', color: 'inherit' }}
    >
      <div
        style={{
          ...displayFont,
          fontWeight: 600,
          fontSize: 16,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-2)',
          marginTop: 3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {sub}
      </div>
    </Link>
  );
}

// ── Пилюли-кнопки ─────────────────────────────────────────────────────────────

const pillBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '10px 18px',
  borderRadius: 999,
  border: '1px solid var(--line-2)',
  background: 'var(--bg-2)',
  color: 'var(--text-0)',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
/** Мобильный вариант: та же таблетка, но ужатая — помещается в одну строку. */
const pillCompact: CSSProperties = {
  ...pillBase,
  gap: 6,
  padding: '9px 14px',
  fontSize: 13,
};
const pillPrimary: CSSProperties = {
  ...pillBase,
  border: 'none',
  color: '#fff',
  background: 'linear-gradient(135deg, var(--accent-hi), var(--accent))',
  boxShadow: '0 12px 30px -12px var(--accent-glow)',
};
const pillAccentSoft: CSSProperties = {
  ...pillBase,
  border: '1px solid var(--accent-glow)',
  background: 'var(--accent-soft)',
  color: 'var(--accent-hi)',
};

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '70px 0',
        textAlign: 'center',
        color: 'var(--text-3)',
        ...displayFont,
        fontSize: 18,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
  right,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  right?: ReactNode;
  autoFocus?: boolean;
}) {
  return (
    <div
      className="friend-search"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 18px',
        height: 42,
        borderRadius: 999,
        background: 'var(--bg-1)',
        border: '1px solid var(--line-2)',
      }}
    >
      <span style={{ fontSize: 15, color: 'var(--text-3)', lineHeight: 1 }}>⌕</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-0)',
          fontSize: 14,
          fontWeight: 500,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
      {right}
    </div>
  );
}

// ── Хук анимированного списка ─────────────────────────────────────────────────

/**
 * Локальная копия списка из стора, устойчивая к внешним обновлениям во время
 * exit-анимации. `remove(id, kind)` запускает анимацию и снимает элемент по её
 * завершении — даже если refresh() из WS убрал его из источника раньше, элемент
 * доигрывает исчезновение (не «телепортируется»).
 */
function useAnimatedList<T extends { id: string }>(source: T[], durations: { accept: number; reject: number }) {
  const [list, setList] = useState<T[]>(source);
  const exitRef = useRef<Record<string, ExitKind>>({});
  const [, force] = useState(0);

  useEffect(() => {
    setList((prev) => {
      const srcIds = new Set(source.map((s) => s.id));
      // Держим доигрывающие exit элементы, исчезнувшие из источника.
      const stillExiting = prev.filter((p) => exitRef.current[p.id] && !srcIds.has(p.id));
      return [...source, ...stillExiting];
    });
  }, [source]);

  const remove = (id: string, kind: Exclude<ExitKind, undefined>) => {
    if (exitRef.current[id]) return;
    exitRef.current[id] = kind;
    force((n) => n + 1);
    setTimeout(() => {
      delete exitRef.current[id];
      setList((prev) => prev.filter((p) => p.id !== id));
      force((n) => n + 1);
    }, durations[kind]);
  };

  return { list, exitOf: (id: string) => exitRef.current[id], remove };
}

// ── Вкладка «Друзья» ──────────────────────────────────────────────────────────

function FriendsTab({ friends, isMobile }: { friends: FriendUser[]; isMobile: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  // Пока есть офлайн-друзья с известным временем — раз в 30с форсим ре-рендер,
  // чтобы относительное «N минут назад» дотикивало само.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!friends.some((f) => !f.online && f.lastSeenAt)) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [friends]);

  const query = q.trim().toLowerCase();
  const shown = query ? friends.filter((f) => f.username.toLowerCase().includes(query)) : friends;
  const pill = isMobile ? pillCompact : pillBase;

  return (
    <div>
      <SearchBox
        value={q}
        onChange={setQ}
        placeholder="Поиск среди друзей…"
        right={
          friends.length > 0 ? (
            <span style={{ ...monoFont, fontSize: 11, color: 'var(--text-3)' }}>
              {shown.length}/{friends.length}
            </span>
          ) : undefined
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {shown.map((f, i) => {
          const status = friendStatus(f);
          const sub = f.online ? (
            f.currentRoom ? (
              <span style={{ color: 'var(--accent-hi)' }}>смотрит «{f.currentRoom.name}»</span>
            ) : (
              'в сети'
            )
          ) : (
            // Только конкретное время последнего захода («минуту назад», «вчера
            // в 22:30»). Само «не в сети» вернёт lastSeenShort лишь тогда, когда
            // времени нет — то есть пользователь скрыл статус в приватности.
            lastSeenShort(f.lastSeenAt)
          );
          return (
            <Card key={f.id} index={i} isMobile={isMobile} highlight={!!f.currentRoom}>
              <CardAvatar name={f.username} seed={f.avatarSeed} src={f.avatarUrl} status={status} size={isMobile ? 46 : 52} />
              <CardInfo publicId={f.publicId} name={f.username} sub={sub} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                {f.currentRoom &&
                  (isMobile ? (
                    // На мобиле подпись не влезает рядом с «Написать» — оставляем
                    // компактную круглую кнопку-«play» с тем же действием.
                    <button
                      className="friend-pill"
                      aria-label="Присоединиться к просмотру"
                      title="Присоединиться к просмотру"
                      style={{
                        ...pillPrimary,
                        padding: 0,
                        width: 38,
                        height: 38,
                        gap: 0,
                        justifyContent: 'center',
                      }}
                      onClick={() => navigate(`/room/${f.currentRoom!.slug}`)}
                    >
                      {/* Свой треугольник, а не глиф ▶ и не Icon "play": у обоих
                          фигура смещена внутри своего холста. Здесь bbox совпадает
                          с viewBox, а translateX — оптическая компенсация: масса
                          треугольника слева, вершина справа, поэтому геометрически
                          центрированный он читается сдвинутым влево. */}
                      <svg
                        width="11"
                        height="12"
                        viewBox="0 0 10 12"
                        fill="currentColor"
                        aria-hidden
                        style={{ transform: 'translateX(1.5px)' }}
                      >
                        <path d="M0 0l10 6-10 6z" />
                      </svg>
                    </button>
                  ) : (
                    <button className="friend-pill" style={pillPrimary} onClick={() => navigate(`/room/${f.currentRoom!.slug}`)}>
                      <span aria-hidden className="hero-anim" style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'heroLivePip 1.4s ease-in-out infinite' }} />
                      Присоединиться
                    </button>
                  ))}
                <button
                  className="friend-pill friend-msg"
                  style={pill}
                  onClick={() => navigate(`/messages/${encodeURIComponent(f.publicId)}`)}
                >
                  {!isMobile && <span style={{ fontSize: 15, lineHeight: 1 }}>✉</span>}
                  Написать
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {shown.length === 0 &&
        (friends.length === 0 ? (
          <EmptyState>У вас пока нет друзей. Найдите их во вкладке «Поиск».</EmptyState>
        ) : (
          <EmptyState>Никого с таким именем среди друзей нет.</EmptyState>
        ))}
    </div>
  );
}

// ── Вкладка «Входящие» ────────────────────────────────────────────────────────

function IncomingTab({ requests, isMobile }: { requests: FriendRequest[]; isMobile: boolean }) {
  const refresh = useFriendsStore((s) => s.refresh);
  const [busy, setBusy] = useState<string | null>(null);
  const { list, exitOf, remove } = useAnimatedList(requests, { accept: 580, reject: 400 });

  const act = async (id: string, kind: Exclude<ExitKind, undefined>, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(id);
    remove(id, kind);
    try {
      await fn();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  if (list.length === 0) return <EmptyState>Новых заявок нет.</EmptyState>;

  return (
    <div>
      <p style={{ color: 'var(--text-2)', fontSize: 15, margin: '0 0 22px' }}>
        Хотят добавить вас в друзья. Примите — и появится общая история просмотров.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map((r, i) => (
          <Card key={r.id} index={i} isMobile={isMobile} exiting={exitOf(r.id)}>
            <CardAvatar name={r.user.username} seed={r.user.avatarSeed} src={r.user.avatarUrl} size={isMobile ? 46 : 52} />
            <CardInfo
              publicId={r.user.publicId}
              name={r.user.username}
              sub={`хочет добавить вас · ${lastSeenPhrase(r.createdAt)}`}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
              <button
                className="friend-pill"
                style={isMobile ? { ...pillPrimary, gap: 6, padding: '9px 14px', fontSize: 13 } : pillPrimary}
                disabled={busy === r.id}
                onClick={() => void act(r.id, 'accept', () => friendsApi.accept(r.id))}
              >
                Принять
              </button>
              <button
                className="friend-x"
                aria-label="Отклонить"
                title="Отклонить"
                disabled={busy === r.id}
                onClick={() => void act(r.id, 'reject', () => friendsApi.decline(r.id))}
                style={{
                  width: isMobile ? 38 : 44,
                  height: isMobile ? 38 : 44,
                  flex: 'none',
                  borderRadius: '50%',
                  border: '1px solid var(--line-2)',
                  background: 'var(--bg-2)',
                  color: 'var(--text-2)',
                  fontSize: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Вкладка «Исходящие» ───────────────────────────────────────────────────────

function OutgoingTab({ requests, isMobile }: { requests: FriendRequest[]; isMobile: boolean }) {
  const refresh = useFriendsStore((s) => s.refresh);
  const [busy, setBusy] = useState<string | null>(null);
  const { list, exitOf, remove } = useAnimatedList(requests, { accept: 580, reject: 400 });

  const cancel = async (r: FriendRequest) => {
    if (busy) return;
    setBusy(r.id);
    remove(r.id, 'reject');
    try {
      await friendsApi.remove(r.user.id);
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  if (list.length === 0)
    return <EmptyState>Исходящих заявок нет. Найдите кого-нибудь во вкладке «Поиск».</EmptyState>;

  return (
    <div>
      <p style={{ color: 'var(--text-2)', fontSize: 15, margin: '0 0 22px' }}>
        Ваши заявки, которые ещё ждут ответа. Можно отменить в любой момент.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map((r, i) => (
          <Card key={r.id} index={i} isMobile={isMobile} exiting={exitOf(r.id)}>
            <CardAvatar name={r.user.username} seed={r.user.avatarSeed} src={r.user.avatarUrl} size={isMobile ? 46 : 52} />
            <CardInfo
              publicId={r.user.publicId}
              name={r.user.username}
              sub={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span
                    aria-hidden
                    className="hero-anim"
                    style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', animation: 'heroLivePip 1.6s ease-in-out infinite' }}
                  />
                  ожидает ответа · отправлена {lastSeenPhrase(r.createdAt)}
                </span>
              }
            />
            <button
              className="friend-pill"
              style={{ ...(isMobile ? pillCompact : pillBase), flex: 'none' }}
              disabled={busy === r.id}
              onClick={() => void cancel(r)}
            >
              Отменить
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Вкладка «Поиск» ───────────────────────────────────────────────────────────

function SearchTab({ isMobile, onChanged }: { isMobile: boolean; onChanged: () => Promise<void> }) {
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

  // Локально патчим relationship найденного пользователя после действия, чтобы
  // кнопка мгновенно отражала новый статус (не дожидаясь повторного поиска).
  const patch = (userId: string, relationship: Relationship) =>
    setResults((prev) => prev.map((u) => (u.id === userId ? { ...u, relationship } : u)));

  return (
    <div>
      <SearchBox value={q} onChange={setQ} placeholder="Имя пользователя в Vellin…" autoFocus />

      {loading && <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '14px 4px' }}>Поиск…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {results.map((u, i) => {
          const status = friendStatus(u);
          const meta =
            u.bio ??
            (u.online
              ? u.currentRoom
                ? `смотрит «${u.currentRoom.name}»`
                : 'в сети'
              : lastSeenShort(u.lastSeenAt));
          return (
            <Card key={u.id} index={i} isMobile={isMobile}>
              <CardAvatar name={u.username} seed={u.avatarSeed} src={u.avatarUrl} status={status} size={isMobile ? 46 : 52} />
              <CardInfo publicId={u.publicId} name={u.username} sub={meta} />
              <SearchAction profile={u} onChanged={onChanged} patch={patch} isMobile={isMobile} />
            </Card>
          );
        })}
      </div>

      {!loading && searched && results.length === 0 && <EmptyState>Никого не нашли. Проверьте имя пользователя.</EmptyState>}
      {!loading && !searched && <EmptyState>Введите имя, чтобы найти людей в Vellin.</EmptyState>}
    </div>
  );
}

function SearchAction({
  profile,
  onChanged,
  patch,
  isMobile,
}: {
  profile: PublicProfile;
  onChanged: () => Promise<void>;
  patch: (userId: string, relationship: Relationship) => void;
  isMobile: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (relationship: Relationship, fn: () => Promise<unknown>) => {
    setBusy(true);
    patch(profile.id, relationship);
    try {
      await fn();
      await onChanged();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  // На мобиле действие остаётся в строке справа — ужимаем таблетку.
  const compact = (s: CSSProperties): CSSProperties => ({
    ...s,
    ...(isMobile ? { gap: 6, padding: '9px 14px', fontSize: 13 } : {}),
    flex: 'none',
  });

  switch (profile.relationship) {
    case 'none':
      return (
        <button className="friend-pill" style={compact(pillPrimary)} disabled={busy} onClick={() => void run('outgoing', () => friendsApi.send({ userId: profile.id }))}>
          ＋ Добавить
        </button>
      );
    case 'outgoing':
      return (
        <button className="friend-pill" style={compact(pillBase)} disabled={busy} onClick={() => void run('none', () => friendsApi.remove(profile.id))}>
          {isMobile ? 'Отменить' : 'Заявка отправлена'}
        </button>
      );
    case 'incoming':
      return (
        <button className="friend-pill" style={compact(pillPrimary)} disabled={busy} onClick={() => void run('friends', () => friendsApi.send({ userId: profile.id }))}>
          Принять
        </button>
      );
    case 'friends':
      return (
        <Link className="friend-pill" style={{ ...compact(pillBase), textDecoration: 'none' }} to={`/u/${encodeURIComponent(profile.publicId)}`}>
          Профиль
        </Link>
      );
    case 'blocked':
      return (
        <button className="friend-pill" style={compact(pillAccentSoft)} disabled={busy} onClick={() => void run('none', () => friendsApi.unblock(profile.id))}>
          Разблокировать
        </button>
      );
    default:
      return null;
  }
}

// ── Утилиты ───────────────────────────────────────────────────────────────────

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
