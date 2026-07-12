import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FavoriteTitle, PublicUser } from '@vellin/shared';
import { Avatar, Icon } from '../../shared';

/**
 * Переиспользуемые примитивы hero-макета страниц профиля (публичный профиль и
 * настройки). Полностью на дизайн-токенах — работают в тёмной и светлой теме;
 * акцентные свечения строятся от цвета присутствия через `color-mix`. HTML из
 * Claude Design не копируется — здесь только композиция/анимации, портированные
 * нативно. См. keyframes `hero*` в `styles/global.css`.
 */

export type PresenceStatus = 'watching' | 'online' | 'idle' | 'offline';

/** Цвет и «живость» индикатора присутствия. `watching` — единственный «live». */
export function presenceTone(status: PresenceStatus): { color: string; live: boolean } {
  switch (status) {
    case 'watching':
      return { color: 'var(--accent)', live: true };
    case 'online':
      return { color: 'var(--ok)', live: false };
    case 'idle':
      return { color: 'var(--warn)', live: false };
    default:
      return { color: 'var(--text-3)', live: false };
  }
}

/** Полупрозрачная заливка от цвета (для pill/свечений), устойчива к теме. */
const soft = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

export const displayFont: CSSProperties = { fontFamily: 'var(--font-display)' };
export const monoFont: CSSProperties = { fontFamily: 'var(--font-mono)' };

// ── Оболочка hero-секции с фоновыми свечениями ──────────────────────────────

export function HeroShell({
  children,
  maxWidth = 1000,
  glowColor = 'var(--accent)',
  glowLive = false,
}: {
  children: ReactNode;
  maxWidth?: number;
  glowColor?: string;
  glowLive?: boolean;
}) {
  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      {/* Верхнее «дышащее» свечение по центру. */}
      <div
        aria-hidden
        className="hero-anim"
        style={{
          position: 'absolute',
          top: '-15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 900,
          height: 620,
          background: `radial-gradient(circle, ${soft(glowColor, 20)}, transparent 62%)`,
          filter: 'blur(44px)',
          animation: `heroBreathe ${glowLive ? '7s' : '9s'} ease-in-out infinite`,
          transition: 'background 1s ease',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: '-10%',
          right: '-10%',
          width: 560,
          height: 560,
          background: `radial-gradient(circle, ${soft(glowColor, 9)}, transparent 65%)`,
          filter: 'blur(50px)',
          transition: 'background 1s ease',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth,
          margin: '0 auto',
          padding: '0 clamp(18px, 4vw, 32px)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Крупный светящийся аватар с индикатором присутствия ─────────────────────

export function HeroAvatar({
  name,
  seed,
  src,
  status,
  size = 168,
}: {
  name: string;
  seed?: string;
  src?: string | null;
  status: PresenceStatus;
  size?: number;
}) {
  const { color, live } = presenceTone(status);
  const dot = Math.round(size * 0.17);
  return (
    <div style={{ position: 'relative', flex: 'none', width: size, height: size }}>
      {/* Свечение-ореол. */}
      <div
        aria-hidden
        className="hero-anim"
        style={{
          position: 'absolute',
          inset: -Math.round(size * 0.18),
          borderRadius: '50%',
          background: `radial-gradient(circle, ${soft(color, 40)}, transparent 68%)`,
          filter: 'blur(24px)',
          animation: `${live ? 'heroRingPulse 2.4s' : 'heroBreathe 7s'} ease-in-out infinite`,
          transition: 'background 1s ease',
          zIndex: 0,
        }}
      />
      {/* Градиентное кольцо (border через padding). */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: size,
          height: size,
          borderRadius: '50%',
          padding: 4,
          background: `linear-gradient(135deg, ${soft(color, 90)}, ${soft(color, 20)})`,
          boxShadow: `0 0 0 1px ${soft(color, 30)}, 0 30px 60px -20px ${soft(color, 50)}`,
          transition: 'background 1s ease, box-shadow 1s ease',
        }}
      >
        <Avatar name={name} seed={seed} src={src} size={size - 8} style={{ display: 'block' }} />
      </div>
      {/* Точка присутствия. */}
      <div
        aria-hidden
        className={live ? 'hero-anim' : undefined}
        style={{
          position: 'absolute',
          bottom: '8%',
          right: '8%',
          zIndex: 2,
          width: dot,
          height: dot,
          borderRadius: '50%',
          background: color,
          border: '4px solid var(--bg-0)',
          ...(live
            ? ({ ['--hero-pulse' as string]: soft(color, 60), animation: 'heroDotPulse 2s infinite' } as CSSProperties)
            : {}),
          transition: 'background 1s ease',
        }}
      />
    </div>
  );
}

// ── Pill статуса ────────────────────────────────────────────────────────────

export function StatusPill({
  status,
  label,
  live,
}: {
  status: PresenceStatus;
  label: string;
  live?: boolean;
}) {
  const tone = presenceTone(status);
  const isLive = live ?? tone.live;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        padding: '9px 15px',
        borderRadius: 999,
        background: soft(tone.color, 12),
        border: `1px solid ${soft(tone.color, 30)}`,
        color: tone.color,
        transition: 'background 1s ease, border-color 1s ease, color 1s ease',
      }}
    >
      <span
        className={isLive ? 'hero-anim' : undefined}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: tone.color,
          ...(isLive ? { animation: 'heroLivePip 1.4s ease-in-out infinite' } : {}),
        }}
      />
      <span style={{ fontWeight: 500, fontSize: 14, letterSpacing: '0.01em' }}>{label}</span>
      {isLive && (
        <span
          className="hero-anim"
          style={{ ...monoFont, fontSize: 11, opacity: 0.75, marginLeft: 2, animation: 'heroLivePip 1.6s ease-in-out infinite' }}
        >
          LIVE
        </span>
      )}
    </span>
  );
}

// ── Mono-подпись секции ─────────────────────────────────────────────────────

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <span
        style={{
          ...monoFont,
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--text-2)',
        }}
      >
        {children}
      </span>
      {right}
    </div>
  );
}

// ── Постер-обложка (общий для полки профиля и грида «Кино») ──────────────────

function ratingColor(v: number): string {
  return v >= 7 ? '#5ec26a' : v >= 5 ? '#d6b24a' : '#d67a4a';
}

export function PosterCover({
  t,
  titleOverlay = false,
  highlight = false,
  topRight,
  children,
  radius = 18,
}: {
  t: FavoriteTitle;
  /** Показать название поверх нижнего градиента обложки. */
  titleOverlay?: boolean;
  /** Акцентная обводка «общий» фильм. */
  highlight?: boolean;
  topRight?: ReactNode;
  /** Оверлей действий (hover) — используется в настройках. */
  children?: ReactNode;
  radius?: number;
}) {
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: '2 / 3',
        borderRadius: radius,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: t.posterUrl
          ? `linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.12) 44%, rgba(0,0,0,0.42)), url('${t.posterUrl}')`
          : 'var(--bg-3)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        // Обводку «общего» фильма рисуем ВНУТРЬ постера (inset): внешнее кольцо/
        // свечение выходило за габариты и обрезалось краем скролл-полки и
        // overflow:hidden HeroShell. Inset-версия визуально та же, но никогда
        // не клипается.
        boxShadow: highlight
          ? `0 20px 50px -18px rgba(0,0,0,0.6), inset 0 0 0 2px var(--accent), inset 0 0 24px var(--accent-glow)`
          : '0 20px 50px -18px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        color: '#fff',
      }}
    >
      {t.ratingKp != null ? (
        <span
          style={{
            ...monoFont,
            fontSize: 11,
            fontWeight: 600,
            color: ratingColor(t.ratingKp),
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            padding: '3px 8px',
            borderRadius: 8,
            alignSelf: 'flex-start',
            lineHeight: 1.2,
          }}
        >
          {t.ratingKp.toFixed(1)}
        </span>
      ) : (
        <span />
      )}

      {!t.posterUrl && (
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
          <Icon name="film" size={30} />
        </span>
      )}

      {titleOverlay && (
        <span
          style={{
            ...displayFont,
            fontWeight: 600,
            fontSize: 18,
            textShadow: '0 2px 10px rgba(0,0,0,0.6)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {t.title}
        </span>
      )}

      {topRight && <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}>{topRight}</div>}
      {children}
    </div>
  );
}

/** Бейдж «вы оба» — для «общего» фильма на публичной полке. */
export function SharedBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
        background: 'var(--accent)',
        padding: '4px 9px',
        borderRadius: 999,
        boxShadow: '0 4px 14px var(--accent-glow)',
        lineHeight: 1.2,
      }}
    >
      <Icon name="heartFilled" size={10} /> вы оба
    </span>
  );
}

// ── Горизонтальная полка «Любимое кино» ─────────────────────────────────────

export function FilmShelf({ titles, sharedIds }: { titles: FavoriteTitle[]; sharedIds?: Set<number> }) {
  const meta = (t: FavoriteTitle) =>
    [t.year, t.ratingImdb != null ? `IMDb ${t.ratingImdb.toFixed(1)}` : null].filter(Boolean).join(' · ');
  return (
    <div
      style={{
        display: 'flex',
        gap: 18,
        overflowX: 'auto',
        // Паддинг даёт воздух под drop-shadow/hover-подъём, отрицательный маржин
        // ровно его гасит по краям — первый постер начинается вровень с заголовком
        // секции, последний бесшовно уходит под правый край. Симметрично слева и
        // справа, чтобы левый постер не обрезался.
        padding: '34px 24px 30px',
        margin: '-34px -24px 0 -24px',
        scrollSnapType: 'x mandatory',
        // scroll-snap-align:start иначе выравнивает первый постер к краю снаппорта,
        // игнорируя padding-left, и авто-прокручивает контейнер на 24px — из-за чего
        // левый постер уезжал под клип. scroll-padding заставляет snap уважать поля.
        scrollPaddingLeft: 24,
        scrollPaddingRight: 24,
      }}
    >
      {titles.map((t) => {
        const shared = sharedIds?.has(t.kpId) ?? false;
        return (
          <div
            key={t.kpId}
            className="hero-poster"
            style={{ flex: 'none', width: 'clamp(178px, 48vw, 190px)', scrollSnapAlign: 'start' }}
          >
            <PosterCover t={t} titleOverlay highlight={shared} topRight={shared ? <SharedBadge /> : undefined} />
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-2)' }}>{meta(t)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Стопка друзей (наложенные аватары) ──────────────────────────────────────

export function FriendStack({ friends, max = 7 }: { friends: PublicUser[]; max?: number }) {
  const shown = friends.slice(0, max);
  const rest = friends.length - shown.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((f, i) => (
        <Link
          key={f.id}
          to={`/u/${f.publicId}`}
          title={f.username}
          className="hero-friend"
          style={{
            marginLeft: i === 0 ? 0 : -14,
            zIndex: shown.length - i,
            borderRadius: '50%',
            display: 'block',
            transition: 'transform 0.35s cubic-bezier(0.22, 1.2, 0.36, 1)',
          }}
        >
          <span style={{ display: 'block', borderRadius: '50%', border: '3px solid var(--bg-0)' }}>
            <Avatar name={f.username} seed={f.avatarSeed} src={f.avatarUrl} size={54} style={{ display: 'block' }} />
          </span>
        </Link>
      ))}
      {rest > 0 && <span style={{ marginLeft: 16, fontSize: 14, color: 'var(--text-2)' }}>и ещё {rest}</span>}
    </div>
  );
}
