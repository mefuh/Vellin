import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../../shared';
import { useSpringValue } from '../../hooks/useSpringValue';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useSharedTimeStore } from '../../stores/sharedTimeStore';
import { formatDurationShort, heroParts } from '../../utils/formatDuration';
import { SectionLabel, displayFont, monoFont } from './ProfileHeroKit';
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

const pad = (n: number) => String(n).padStart(2, '0');
function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
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

/** «≈ 1,7 дня, прожитых в одном кадре» — подпись-каптион как в макете. */
function daysCaption(totalSeconds: number): string {
  const days = (totalSeconds / 86400).toFixed(1).replace('.', ',');
  return `≈ ${days} дня, прожитых в одном кадре`;
}

// Заполнение таймлайна по накопленному совместному времени: насыщающая кривая
// (1 − e^(−t/K)) от MIN_PCT к MAX_PCT — линия всегда продвигается по мере
// начисления времени и асимптотически приближается к концу, не упираясь в потолок.
const FILL_MIN_PCT = 6;
const FILL_MAX_PCT = 96;
const FILL_TIME_CONST = 10800; // ~3 часа — за это время линия проходит ~63% пути
function secondsToFillPct(seconds: number): number {
  const f = 1 - Math.exp(-Math.max(0, seconds) / FILL_TIME_CONST);
  return FILL_MIN_PCT + (FILL_MAX_PCT - FILL_MIN_PCT) * f;
}

/**
 * «Ваше время вместе» — премиальная эмоциональная карточка в чужом профиле:
 * суммарное время в комнатах вместе. Крупное «досчитывающееся» (count-up) число
 * часов, живой тик и часы-таймер при `together`, вплетённые метрики, таймлайн
 * первый→последний сеанс, пустое состояние-приглашение. Данные — из
 * {@link useSharedTimeStore} (гидратация из DTO профиля + живые WS-обновления).
 * Всё уважает `prefers-reduced-motion` (класс `hero-anim`).
 */
export function SharedTimeCard({
  peerId,
  peerName,
  onInvite,
}: {
  peerId: string;
  peerName: string;
  onInvite?: () => void;
}): ReactElement {
  const isMobile = useIsMobile();
  const dto = useSharedTimeStore((s) => s.byPeer[peerId]) ?? ZERO;
  const togetherSinceMs = dto.together && dto.togetherSince ? Date.parse(dto.togetherSince) : null;
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
      el.style.transform = `translateY(${(1 - v) * 14}px) scale(${0.98 + v * 0.02})`;
    },
    { stiffness: 240, damping: 24 },
  );

  // Count-up + живой тик: target (секунды) стартует с 0, летит к liveNow, а при
  // «together» инкрементится раз в секунду — пружина плавно следует. Часы-таймер
  // (clockRef) обновляем точным значением (без сглаживания) в том же интервале.
  const bigRef = useRef<HTMLSpanElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const subRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState(0);

  useEffect(() => {
    if (isEmpty) return;
    const r = requestAnimationFrame(() => setTarget(liveNow()));
    return () => cancelAnimationFrame(r);
  }, [isEmpty, liveNow]);

  useEffect(() => {
    if (isEmpty || !togetherSinceMs) return;
    const id = window.setInterval(() => {
      setTarget(liveNow());
      if (clockRef.current) clockRef.current.textContent = fmtClock((Date.now() - togetherSinceMs) / 1000);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isEmpty, togetherSinceMs, liveNow]);

  useSpringValue(
    target,
    (v) => {
      const parts = heroParts(v);
      if (bigRef.current) bigRef.current.textContent = parts.big;
      if (unitRef.current) unitRef.current.textContent = parts.unit;
      if (subRef.current) subRef.current.textContent = parts.sub ? `и ещё ${parts.sub}` : '';
      // Голова таймлайна ползёт вперёд синхронно со счётчиком.
      const pct = secondsToFillPct(v);
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (headRef.current) headRef.current.style.left = `${pct}%`;
    },
    { stiffness: 110, damping: 22 },
  );

  return (
    <section ref={rootRef} style={{ opacity: 0 }}>
      <SectionLabel>Ваше время вместе</SectionLabel>

      <div
        style={{
          position: 'relative',
          borderRadius: 28,
          padding: 'clamp(32px, 6vw, 44px)',
          background: 'radial-gradient(120% 140% at 15% 0%, var(--accent-soft), transparent 55%), var(--bg-1)',
          border: '1px solid var(--line-1)',
          overflow: 'hidden',
        }}
      >
        {/* Внутреннее свечение. */}
        <div
          aria-hidden
          className="hero-anim"
          style={{
            position: 'absolute',
            top: '-40%',
            right: '-10%',
            width: 400,
            height: 400,
            background: 'radial-gradient(circle, var(--accent-glow), transparent 65%)',
            filter: 'blur(30px)',
            animation: 'heroBreathe 6s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />

        {isEmpty ? (
          <EmptyState peerName={peerName} onInvite={onInvite} />
        ) : (
          <div style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: 'flex-start',
                justifyContent: isMobile ? 'flex-start' : 'space-between',
                gap: isMobile ? 20 : 16,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                <span
                  ref={bigRef}
                  style={{
                    ...displayFont,
                    fontWeight: 600,
                    fontSize: 'clamp(104px, 28vw, 150px)',
                    lineHeight: 0.82,
                    letterSpacing: '-0.04em',
                    background: 'linear-gradient(180deg, var(--text-0), var(--text-2))',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  0
                </span>
                <div style={{ paddingBottom: 'clamp(10px, 2vw, 20px)' }}>
                  <span
                    ref={unitRef}
                    style={{ ...displayFont, display: 'block', fontSize: 'clamp(30px, 7vw, 34px)', fontWeight: 500, color: 'var(--text-1)', lineHeight: 1 }}
                  >
                    минут
                  </span>
                  <span ref={subRef} style={{ display: 'block', fontSize: 17, color: 'var(--text-3)', marginTop: 6 }} />
                </div>
              </div>

              {/* Чип справа: live-таймер «сейчас вместе» либо «были вместе …». */}
              {dto.together ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 18px',
                    borderRadius: 999,
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--accent-glow)',
                  }}
                >
                  <span className="hero-anim" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-hi)', animation: 'heroLivePip 1.2s infinite' }} />
                  <span style={{ fontSize: 15, color: 'var(--text-1)' }}>сейчас вместе</span>
                  <span ref={clockRef} style={{ ...monoFont, fontWeight: 600, fontSize: 16, color: 'var(--accent-hi)', letterSpacing: '0.02em' }}>
                    {fmtClock(togetherSinceMs ? (Date.now() - togetherSinceMs) / 1000 : 0)}
                  </span>
                </div>
              ) : (
                dto.lastWatchedAt && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 18px', borderRadius: 999, background: 'var(--bg-2)', border: '1px solid var(--line-2)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-3)' }} />
                    <span style={{ fontSize: 15, color: 'var(--text-2)' }}>были вместе {fmtRelative(dto.lastWatchedAt)}</span>
                  </div>
                )
              )}
            </div>

            <div style={{ ...displayFont, fontSize: 'clamp(16px, 4vw, 18px)', color: 'var(--text-2)', marginTop: 24, fontStyle: 'italic' }}>
              {daysCaption(liveNow())}
            </div>

            {/* Таймлайн первый → последний сеанс. */}
            {dto.firstWatchedAt && (
              <>
                <div style={{ position: 'relative', marginTop: 30, height: 3, borderRadius: 2, background: 'var(--line-2)' }}>
                  <div
                    ref={fillRef}
                    className="hero-anim"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${secondsToFillPct(0)}%`,
                      borderRadius: 2,
                      background: 'linear-gradient(90deg, var(--accent-soft), var(--accent))',
                      backgroundSize: '200% 100%',
                      animation: 'heroShimmer 3.5s linear infinite',
                    }}
                  />
                  <div style={{ position: 'absolute', left: 0, top: '50%', width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', transform: 'translate(-50%, -50%)' }} />
                  <div
                    ref={headRef}
                    style={{ position: 'absolute', left: `${secondsToFillPct(0)}%`, top: '50%', width: 11, height: 11, borderRadius: '50%', background: 'var(--text-0)', transform: 'translate(-50%, -50%)', boxShadow: '0 0 0 4px var(--accent-glow)' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
                  <span>{fmtDate(dto.firstWatchedAt)} · первый сеанс</span>
                  <span>{dto.together ? 'сейчас' : dto.lastWatchedAt ? fmtRelative(dto.lastWatchedAt) : ''}</span>
                </div>
              </>
            )}

            <WovenStats dto={dto} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Вплетённые метрики — до 3 центрированных колонок. */
function WovenStats({ dto }: { dto: SharedWatchDTO }): ReactElement | null {
  const stats: { value: string; label: string }[] = [];
  if (dto.sessionsCount > 0) stats.push({ value: String(dto.sessionsCount), label: 'совместных сеансов' });
  if (dto.longestSessionSeconds > 0) stats.push({ value: formatDurationShort(dto.longestSessionSeconds), label: 'самая долгая сессия' });
  if (dto.firstWatchedAt) stats.push({ value: fmtDate(dto.firstWatchedAt), label: 'вы начали вместе' });
  if (stats.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 34 }}>
      {stats.map((s, i) => (
        <div key={i} style={{ flex: 1, minWidth: 110, textAlign: 'center' }}>
          <div style={{ ...displayFont, fontWeight: 600, fontSize: 'clamp(23px, 6vw, 28px)', color: 'var(--text-0)', lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6, letterSpacing: '0.02em' }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ peerName, onInvite }: { peerName: string; onInvite?: () => void }): ReactElement {
  return (
    <div style={{ position: 'relative', textAlign: 'center', padding: '16px 0 8px' }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 64,
          height: 64,
          borderRadius: 20,
          background: 'var(--bg-2)',
          border: '1.5px dashed var(--line-3)',
          color: 'var(--text-3)',
          marginBottom: 22,
        }}
      >
        <Icon name="film" size={26} />
      </div>
      <div
        style={{
          ...displayFont,
          fontWeight: 600,
          fontSize: 'clamp(26px, 3.6vw, 40px)',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          background: 'linear-gradient(180deg, var(--text-0), var(--text-2))',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Ваша история ещё не началась
      </div>
      <p style={{ fontSize: 15, color: 'var(--text-2)', maxWidth: 400, margin: '14px auto 0', lineHeight: 1.55 }}>
        Проведите первый совместный сеанс — и время рядом с {peerName} начнёт идти здесь, секунда за секундой.
      </p>
      {onInvite && (
        <button
          onClick={onInvite}
          className="hero-press"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            marginTop: 24,
            padding: '15px 28px',
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            ...displayFont,
            fontWeight: 600,
            fontSize: 15,
            color: '#fff',
            background: 'var(--accent)',
            boxShadow: '0 14px 34px -8px var(--accent-glow)',
          }}
        >
          <Icon name="chat" size={16} /> Позвать смотреть вместе
        </button>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 26, fontSize: 13, color: 'var(--text-3)' }}>
        <span>0 сеансов</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>0 минут вместе</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>старт сегодня</span>
      </div>
    </div>
  );
}
