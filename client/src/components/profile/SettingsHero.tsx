import type { AuthUser } from '@vellin/shared';
import { Avatar } from '../../shared';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useAvatarUpload } from '../../hooks/useAvatarUpload';
import { StatusLine } from './ProfilePrimitives';

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const OK = 'var(--ok)';
const soft = (pct: number) => `color-mix(in srgb, ${OK} ${pct}%, transparent)`;

function joinedLabel(iso: string): string {
  const dt = new Date(iso);
  return `в Vellin с ${MONTHS_GEN[dt.getMonth()]} ${dt.getFullYear()}`;
}

function Dot() {
  return <span style={{ opacity: 0.3 }}>·</span>;
}

/**
 * Hero страницы настроек: крупный аватар с загрузкой (клик по аватару или кнопке),
 * имя, мета-строка (email · город · дата регистрации) и кнопки управления фото.
 * Логика аватара — в {@link useAvatarUpload}.
 */
export function SettingsHero({ user }: { user: AuthUser }) {
  const isMobile = useIsMobile();
  const { fileRef, busy, error, success, onPick, regenerate } = useAvatarUpload();
  const size = isMobile ? 116 : 140;
  const dot = Math.round(size * 0.16);

  const pillBtn = {
    padding: '9px 16px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
  } as const;

  return (
    <div
      className="hero-anim"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: 'center',
        textAlign: isMobile ? 'center' : 'left',
        gap: isMobile ? 22 : 34,
        marginTop: isMobile ? 24 : 40,
        animation: 'heroFadeUp 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) both',
      }}
    >
      {/* Аватар с загрузкой. */}
      <div style={{ position: 'relative', flex: 'none', width: size, height: size }}>
        <div
          aria-hidden
          className="hero-anim"
          style={{
            position: 'absolute',
            inset: -Math.round(size * 0.18),
            borderRadius: '50%',
            background: `radial-gradient(circle, ${soft(34)}, transparent 68%)`,
            filter: 'blur(22px)',
            animation: 'heroBreathe 7s ease-in-out infinite',
          }}
        />
        <label
          className="settings-avatar"
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'block',
            width: size,
            height: size,
            borderRadius: '50%',
            padding: 4,
            cursor: 'pointer',
            background: `linear-gradient(135deg, ${soft(85)}, ${soft(15)})`,
            boxShadow: `0 24px 60px -22px ${soft(60)}`,
          }}
        >
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
            <Avatar name={user.username} seed={user.avatarSeed} src={user.avatarUrl} size={size - 8} style={{ display: 'block' }} />
            <span
              className="settings-avatar-overlay"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.02em',
                opacity: 0,
                transition: 'opacity 0.25s ease',
              }}
            >
              Изменить
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
        </label>
        <span
          aria-hidden
          className="hero-anim"
          style={{
            position: 'absolute',
            bottom: '6%',
            right: '6%',
            zIndex: 2,
            width: dot,
            height: dot,
            borderRadius: '50%',
            background: OK,
            border: '4px solid var(--bg-0)',
            ['--hero-pulse' as string]: soft(60),
            animation: 'heroDotPulse 2s infinite',
          }}
        />
      </div>

      {/* Имя + мета + кнопки. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', minWidth: 0 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'clamp(34px, 6vw, 58px)',
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            margin: 0,
            wordBreak: 'break-word',
          }}
        >
          {user.username}
        </h1>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 14,
            color: 'var(--text-2)',
            fontSize: 14,
            justifyContent: isMobile ? 'center' : 'flex-start',
          }}
        >
          {user.email && <span>{user.email}</span>}
          {user.city && (
            <>
              {user.email && <Dot />}
              <span>{user.city}</span>
            </>
          )}
          {(user.email || user.city) && <Dot />}
          <span style={{ color: 'var(--text-3)' }}>{joinedLabel(user.createdAt)}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap', justifyContent: isMobile ? 'center' : 'flex-start' }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="hero-press"
            style={{ ...pillBtn, border: '1px solid var(--line-2)', background: 'var(--bg-3)', color: 'var(--text-0)' }}
          >
            Загрузить фото
          </button>
          <button
            onClick={() => void regenerate()}
            disabled={busy}
            className="hero-press"
            style={{ ...pillBtn, border: 'none', background: 'transparent', color: 'var(--text-2)' }}
          >
            {user.avatarUrl ? 'Сбросить к градиенту' : 'Сгенерировать другой'}
          </button>
        </div>
        <div style={{ marginTop: 8, minHeight: 18 }}>
          <StatusLine error={error} success={success} />
        </div>
      </div>
    </div>
  );
}
