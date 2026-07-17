import type { CSSProperties, ReactNode } from 'react';

/**
 * Витринный каркас admin-страницы по дизайн-коду Vellin: приглушённый
 * радиальный glow на фоне, hero-заголовок дисплейным шрифтом, моно-микролейбл
 * и каскадное появление секций (fadeUp). Плотные «рабочие» блоки (таблицы)
 * кладутся внутрь как children — они наследуют тот же язык, но без бордер-рамок.
 *
 * Ключкадры инжектятся один раз через общий id, чтобы не плодить дубликаты
 * при нескольких AdminPage на странице.
 */

const KEYFRAMES = `
@keyframes adminFadeUp { from { opacity: 0; transform: translateY(16px); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes adminBreathe { 0%, 100% { opacity: .5; transform: scale(1); } 50% { opacity: .85; transform: scale(1.08); } }
.admin-fade { animation: adminFadeUp .55s cubic-bezier(.22,1.2,.36,1) both; }
.admin-cascade > * { animation: adminFadeUp .55s cubic-bezier(.22,1.2,.36,1) both; }
.admin-cascade > *:nth-child(1) { animation-delay: .04s; }
.admin-cascade > *:nth-child(2) { animation-delay: .10s; }
.admin-cascade > *:nth-child(3) { animation-delay: .16s; }
.admin-cascade > *:nth-child(4) { animation-delay: .22s; }
.admin-cascade > *:nth-child(5) { animation-delay: .28s; }
.admin-cascade > *:nth-child(6) { animation-delay: .34s; }
`;

export function AdminKeyframes() {
  return <style>{KEYFRAMES}</style>;
}

export function AdminPage({
  title,
  eyebrow,
  subtitle,
  actions,
  children,
  glow = 'var(--accent-glow)',
}: {
  title: string;
  /** Моно-микролейбл над заголовком (uppercase). */
  eyebrow?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Цвет фонового свечения (семантический статус раздела). */
  glow?: string;
}) {
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <AdminKeyframes />
      {/* Glow-пятно под контентом. Ширину ограничиваем контейнером (min с 100%) и
          прижимаем к правому краю (right: 0) — так пятно НЕ выходит за пределы по
          горизонтали и не создаёт скролл на мобилке. Клиппер/overflow здесь нельзя:
          overflow на предке ломает position:fixed модалок (и режет мягкий градиент
          в прямоугольник). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -120,
          right: 0,
          width: 'min(420px, 100%)',
          height: 420,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glow}, transparent 68%)`,
          filter: 'blur(46px)',
          opacity: 0.5,
          pointerEvents: 'none',
          zIndex: 0,
          animation: 'adminBreathe 8s ease-in-out infinite',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <header
          className="admin-fade"
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            {eyebrow && (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--text-3)',
                  marginBottom: 10,
                }}
              >
                {eyebrow}
              </div>
            )}
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(26px, 3vw, 34px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                margin: 0,
                color: 'var(--text-0)',
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p style={{ margin: '10px 0 0', color: 'var(--text-2)', fontSize: 14, maxWidth: 640 }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
        </header>
        <div className="admin-cascade" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * «Рабочая» поверхность-карточка: без бордер-рамок — глубина создаётся фоном и
 * тонкой внутренней hairline-обводкой, как предписывает дизайн-код.
 */
export function AdminSurface({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'inset 0 0 0 1px var(--line-1)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Метрика: крупная цифра дисплейным шрифтом + моно-микролейбл. По желанию —
 * подсказка (дельта/период) и иконка-акцент. Базовый кирпич витринных обзоров.
 */
export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: '16px 18px',
        background: 'var(--bg-1)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'inset 0 0 0 1px var(--line-1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(28px, 4vw, 40px)',
          fontWeight: 700,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          color: accent ? 'var(--accent-hi)' : 'var(--text-0)',
        }}
      >
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{hint}</div>}
    </div>
  );
}

/** Пустое состояние в духе дизайн-кода — приглушённо, «будто так и задумано». */
export function AdminEmpty({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        color: 'var(--text-3)',
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}
