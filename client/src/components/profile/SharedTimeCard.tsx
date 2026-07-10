import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../../shared';
import { useSpringValue } from '../../hooks/useSpringValue';
import { useSharedTimeStore } from '../../stores/sharedTimeStore';
import { formatDurationShort, heroParts } from '../../utils/formatDuration';
import type { SharedWatchDTO } from '@vellin/shared';

const ZERO: SharedWatchDTO = {
  totalSeconds: 0,
  sessionsCount: 0,
  longestSessionSeconds: 0,
  firstWatchedAt: null,
  lastWatchedAt: null,
  together: false,
  togetherSince: null,
};

const SIZE = 176;
const SW = 9;
const R = (SIZE - SW) / 2;
const CIRC = 2 * Math.PI * R;

/** Прогресс кольца: мягко насыщается с ростом часов, но никогда не «100%». */
function ringFrac(seconds: number): number {
  const hours = seconds / 3600;
  return Math.max(0.02, 1 - Math.exp(-hours / 45));
}

const plural = (n: number, f: [string, string, string]): string => {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return f[2];
  if (m10 === 1) return f[0];
  if (m10 >= 2 && m10 <= 4) return f[1];
  return f[2];
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
/** «сегодня» / «вчера» / дата. */
function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return fmtDate(iso);
}

function subtitle(dto: SharedWatchDTO, peerName: string): string {
  if (dto.together) return 'Вы сейчас вместе — история продолжается прямо сейчас.';
  const h = dto.totalSeconds / 3600;
  if (h < 1) return `Только начало вашей истории с ${peerName}.`;
  if (h < 10) return 'Уже несколько вечеров, проведённых вместе в Vellin.';
  if (h < 50) return 'Отличная компания для совместного просмотра.';
  return 'Вы провели вместе по-настоящему много времени в Vellin.';
}

/**
 * «Совместное время» — премиальная эмоциональная карточка в чужом профиле:
 * суммарное время в комнатах вместе. Светящееся кольцо + «досчитывающееся»
 * (count-up) число, живой тик при `together`, вторичные метрики, пустое
 * состояние-приглашение. Данные — из {@link useSharedTimeStore} (гидратация из
 * DTO профиля + живые WS-обновления). Всё уважает `prefers-reduced-motion`.
 */
export function SharedTimeCard({ peerId, peerName }: { peerId: string; peerName: string }): ReactElement {
  const dto = useSharedTimeStore((s) => s.byPeer[peerId]) ?? ZERO;
  const togetherSinceMs =
    dto.together && dto.togetherSince ? Date.parse(dto.togetherSince) : null;
  const base = dto.totalSeconds;
  const isEmpty = base === 0 && !dto.together && dto.sessionsCount === 0;

  const liveNow = useCallback(
    () => base + (togetherSinceMs ? Math.max(0, (Date.now() - togetherSinceMs) / 1000) : 0),
    [base, togetherSinceMs],
  );

  // Пружинное появление карточки.
  const rootRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, []);
  useSpringValue(
    entered ? 1 : 0,
    (v) => {
      const el = rootRef.current;
      if (!el) return;
      el.style.opacity = String(Math.min(1, v));
      el.style.transform = `translateY(${(1 - v) * 14}px) scale(${0.97 + v * 0.03})`;
    },
    { stiffness: 240, damping: 24 },
  );

  // Count-up + живой тик: target (секунды) стартует с 0, летит к liveNow, а при
  // «together» инкрементится раз в секунду — пружина плавно следует.
  const bigRef = useRef<HTMLSpanElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const [target, setTarget] = useState(0);

  useEffect(() => {
    if (isEmpty) return;
    const r = requestAnimationFrame(() => setTarget(liveNow()));
    return () => cancelAnimationFrame(r);
  }, [isEmpty, liveNow]);

  useEffect(() => {
    if (isEmpty || !togetherSinceMs) return;
    const id = window.setInterval(() => setTarget(liveNow()), 1000);
    return () => window.clearInterval(id);
  }, [isEmpty, togetherSinceMs, liveNow]);

  useSpringValue(
    target,
    (v) => {
      const parts = heroParts(v);
      if (bigRef.current) bigRef.current.textContent = parts.big;
      if (unitRef.current) unitRef.current.textContent = parts.unit;
      if (subRef.current) subRef.current.textContent = parts.sub ?? '';
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(CIRC * (1 - ringFrac(v)));
    },
    { stiffness: 110, damping: 22 },
  );

  return (
    <section
      ref={rootRef}
      style={{
        opacity: 0,
        padding: 24,
        background:
          'radial-gradient(120% 140% at 15% 0%, var(--accent-soft), transparent 55%), var(--bg-1)',
        border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Совместное время</div>
        {dto.together && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1,
              color: 'var(--accent-hi)',
              background: 'var(--accent-soft)',
              padding: '4px 11px',
              borderRadius: 999,
            }}
          >
            <span
              className="shared-ring-halo"
              style={{
                flexShrink: 0,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--accent-hi)',
                animation: 'sharedLivePulse 1.6s ease-in-out infinite',
              }}
            />
            <span style={{ lineHeight: 1 }}>сейчас вместе</span>
          </span>
        )}
      </div>

      {isEmpty ? (
        <EmptyState peerName={peerName} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
            {/* Вращающийся ореол-свечение позади кольца. */}
            <div
              aria-hidden
              className="shared-ring-halo"
              style={{
                position: 'absolute',
                inset: -6,
                borderRadius: '50%',
                background:
                  'conic-gradient(from 0deg, transparent 0deg, var(--accent-glow) 80deg, transparent 220deg)',
                filter: 'blur(12px)',
                opacity: 0.6,
                animation: 'sharedRingSpin 7s linear infinite',
              }}
            />
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              style={{ position: 'relative', display: 'block' }}
            >
              <defs>
                <linearGradient id="sharedRingGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--accent-hi)" />
                  <stop offset="100%" stopColor="var(--accent)" />
                </linearGradient>
              </defs>
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--line-2)" strokeWidth={SW} />
              <circle
                ref={ringRef}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke="url(#sharedRingGrad)"
                strokeWidth={SW}
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC}
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center',
                  filter: 'drop-shadow(0 0 6px var(--accent-glow))',
                }}
              />
            </svg>
            {/* Центр: крупное «досчитывающееся» число. Главная величина
                привязана строго к центру кольца (translateY -50%), а вторая
                строка — абсолютно под ней, чтобы её наличие/отсутствие не
                смещало число вверх. */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  right: 0,
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'center',
                  gap: 4,
                  lineHeight: 1,
                }}
              >
                <span ref={bigRef} style={{ fontSize: 40, fontWeight: 750, letterSpacing: '-0.02em', color: 'var(--text-0)' }}>
                  0
                </span>
                <span ref={unitRef} style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-2)' }}>
                  минут
                </span>
              </div>
              <div
                ref={subRef}
                style={{
                  position: 'absolute',
                  top: 'calc(50% + 22px)',
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: 'var(--text-3)',
                }}
              />
            </div>
          </div>

          <p style={{ margin: '18px 0 0', maxWidth: 320, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-2)' }}>
            {subtitle(dto, peerName)}
          </p>

          <SecondaryStats dto={dto} />
        </div>
      )}
    </section>
  );
}

function SecondaryStats({ dto }: { dto: SharedWatchDTO }): ReactElement | null {
  const chips: { icon: 'film' | 'flame' | 'star' | 'heartFilled'; label: string }[] = [];
  if (dto.sessionsCount > 0) {
    chips.push({
      icon: 'film',
      label: `${dto.sessionsCount} ${plural(dto.sessionsCount, ['совместный просмотр', 'совместных просмотра', 'совместных просмотров'])}`,
    });
  }
  if (dto.longestSessionSeconds > 0) {
    chips.push({ icon: 'flame', label: `Рекорд: ${formatDurationShort(dto.longestSessionSeconds)}` });
  }
  if (dto.firstWatchedAt) {
    chips.push({ icon: 'star', label: `Вместе с ${fmtDate(dto.firstWatchedAt)}` });
  }
  if (dto.lastWatchedAt && !dto.together) {
    chips.push({ icon: 'heartFilled', label: `Последний раз ${fmtRelative(dto.lastWatchedAt)}` });
  }
  if (chips.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 }}>
      {chips.map((c, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-1)',
            background: 'var(--bg-2)',
            border: '1px solid var(--line-2)',
            padding: '5px 11px',
            borderRadius: 999,
          }}
        >
          <Icon name={c.icon} size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ peerName }: { peerName: string }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 0 4px' }}>
      <div
        style={{
          width: 76,
          height: 76,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg-2)',
          border: '1.5px dashed var(--line-3)',
          color: 'var(--text-3)',
          marginBottom: 14,
        }}
      >
        <Icon name="film" size={30} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Вы ещё не смотрели ничего вместе</div>
      <p style={{ margin: '8px 0 0', maxWidth: 300, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-3)' }}>
        Пригласите {peerName} в комнату, чтобы начать историю совместных просмотров.
      </p>
    </div>
  );
}
