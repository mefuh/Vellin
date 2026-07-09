import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoomInviteInfoResponse } from '@vellin/shared';
import { Icon } from '../../shared';
import { useSpringValue } from '../../hooks/useSpringValue';
import { dmApi } from '../../api/dm';
import { ACCENT_GRAD, OUT_SHADOW } from './chatTheme';
import type { ClientDm } from '../../stores/dmStore';

const TTL_MS = 30 * 60 * 1000;

const reduceMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Phase = 'pending' | 'accepting' | 'accepted' | 'declined' | 'expired';

/**
 * Карточка-приглашение в комнату («Watch Party») — самодостаточный премиальный
 * бабл (как {@link import('./video/VideoMessageBubble').VideoMessageBubble}),
 * не текстовый пузырь. «Живая»:
 *  • появляется пружиной (slide-up + scale + settle) — {@link useSpringValue};
 *  • превью комнаты кросс-фейдится с лёгким блюром при смене контента (живая
 *    синхронизация по WS `dm_message_updated`) — {@link PreviewImage};
 *  • смена состояний (ожидание → подключение → принято/отклонено/истекло) —
 *    кросс-фейд {@link AnimatedStatusText} без скачков высоты;
 *  • кнопки с ripple + пружинным нажатием;
 *  • тап по телу карточки открывает поповер с живой инфо о комнате
 *    (число участников, владелец, что играет).
 * Всё уважает `prefers-reduced-motion`.
 */
export function RoomInviteCard({
  m,
  mine,
  fresh,
  clock,
  status,
}: {
  m: ClientDm;
  mine: boolean;
  fresh: boolean;
  clock: string;
  status: ReactNode;
}): ReactElement {
  const navigate = useNavigate();
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createdMs = new Date(m.createdAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const [infoOpen, setInfoOpen] = useState(false);

  // Тикаем ровно к моменту истечения TTL, чтобы карточка сама стала
  // «Истекло», пока открыта, — без похода на сервер и без опроса по таймеру.
  useEffect(() => {
    if (m.inviteStatus !== 'pending') return;
    const msLeft = createdMs + TTL_MS - Date.now();
    if (msLeft <= 0) return;
    const t = window.setTimeout(() => setNow(Date.now()), msLeft + 50);
    return () => window.clearTimeout(t);
  }, [m.inviteStatus, createdMs]);

  // Пружинное появление (только для свежих сообщений; история — статично).
  const rootRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(!fresh);
  useEffect(() => {
    if (!fresh) return;
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, [fresh]);
  useSpringValue(
    entered ? 1 : 0,
    (v) => {
      const el = rootRef.current;
      if (!el) return;
      el.style.opacity = String(Math.min(1, v));
      el.style.transform = `translateY(${(1 - v) * 12}px) scale(${0.9 + v * 0.1})`;
    },
    { stiffness: 260, damping: 22 },
  );

  const visuallyExpired = m.inviteStatus === 'pending' && now - createdMs > TTL_MS;
  const phase: Phase =
    m.inviteStatus === 'accepted'
      ? 'accepted'
      : m.inviteStatus === 'declined'
        ? 'declined'
        : m.inviteStatus === 'expired' || visuallyExpired
          ? 'expired'
          : responding
            ? 'accepting'
            : 'pending';

  const respond = async (action: 'accept' | 'decline'): Promise<void> => {
    setResponding(true);
    setError(null);
    try {
      const res = await dmApi.respondRoomInvite(m.id, action);
      if (res.ok) {
        if (res.redirect) navigate(`/room/${res.redirect.slug}?invite=${res.redirect.inviteToken}`);
        // Итоговый статус карточки придёт по WS (dm_message_updated) — не трогаем локально.
      } else {
        setError(res.message);
      }
    } catch {
      setError('Не удалось отправить ответ');
    } finally {
      setResponding(false);
    }
  };

  const roomName = m.inviteRoomName ?? 'Комната';
  const nowPlaying = m.inviteVideoTitle ?? 'Контент загружается…';

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        width: 'min(300px, 78vw)',
        borderRadius: 20,
        overflow: 'visible',
        background: 'var(--bg-3)',
        border: '1px solid var(--line-2)',
        boxShadow: 'var(--shadow-2)',
        transformOrigin: mine ? 'right bottom' : 'left bottom',
      }}
    >
      <button
        type="button"
        onClick={() => setInfoOpen((v) => !v)}
        aria-label="Подробнее о комнате"
        style={{
          display: 'flex',
          gap: 12,
          padding: 12,
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '20px 20px 0 0',
          color: 'inherit',
        }}
      >
        <PreviewImage poster={m.inviteVideoPoster ?? null} />
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <div style={ellip(14.5, 650, 'var(--text-0)')}>{roomName}</div>
          <div style={ellip(12.5, 500, 'var(--text-2)')}>{nowPlaying}</div>
          <div style={{ ...ellip(11, 500, 'var(--text-3)'), marginTop: 1 }}>🎬 Совместный просмотр</div>
        </div>
      </button>

      <div style={{ padding: '0 12px 12px' }}>
        <PhaseCrossfade id={phase}>
          <PhaseContent phase={phase} mine={mine} error={error} onRespond={respond} />
        </PhaseCrossfade>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 4,
          padding: '0 12px 9px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-3)',
        }}
      >
        {clock}
        {mine && status}
      </div>

      {infoOpen && <InfoPopover messageId={m.id} mine={mine} onClose={() => setInfoOpen(false)} />}
    </div>
  );
}

function ellip(fontSize: number, fontWeight: number, color: string): CSSProperties {
  return { fontSize, fontWeight, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
}

/**
 * Превью комнаты с кросс-фейдом при смене постера (живая синхронизация): новый
 * слой всплывает поверх старого из лёгкого блюра/масштаба в резкость, без
 * мигания. Уважает reduced-motion (мгновенная подмена).
 */
function PreviewImage({ poster }: { poster: string | null }): ReactElement {
  const [layers, setLayers] = useState<{ key: number; poster: string | null }[]>([{ key: 0, poster }]);
  const keyRef = useRef(0);
  const prevRef = useRef(poster);

  useEffect(() => {
    if (poster === prevRef.current) return;
    prevRef.current = poster;
    if (reduceMotion()) {
      setLayers([{ key: keyRef.current, poster }]);
      return;
    }
    keyRef.current += 1;
    const key = keyRef.current;
    setLayers((prev) => [...prev.slice(-1), { key, poster }]);
    const t = window.setTimeout(() => setLayers([{ key, poster }]), 420);
    return () => window.clearTimeout(t);
  }, [poster]);

  return (
    <div
      style={{
        position: 'relative',
        width: 68,
        height: 68,
        flexShrink: 0,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'linear-gradient(155deg,#2a2a2a,#151515)',
      }}
    >
      {layers.map((l, i) => (
        <div
          key={l.key}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: l.poster ? `#000 center/cover url(${l.poster})` : 'transparent',
            opacity: i === layers.length - 1 ? 1 : 0,
            transform: i === layers.length - 1 ? 'scale(1)' : 'scale(1.06)',
            filter: i === layers.length - 1 ? 'blur(0px)' : 'blur(6px)',
            transition: reduceMotion() ? 'none' : 'opacity .4s ease, transform .4s ease, filter .4s ease',
          }}
        >
          {!l.poster && <Icon name="film" size={26} style={{ color: 'rgba(255,255,255,0.45)' }} />}
        </div>
      ))}
    </div>
  );
}

/**
 * Блочный кросс-фейд контента фазы (ожидание → подключение → принято/…). В
 * отличие от {@link AnimatedStatusText} (однострочный, inline-block, сжимается
 * по тексту), держит ПОЛНУЮ ширину карточки — иначе ряд кнопок `width:100%`
 * считает ширину от сжатого инлайн-контейнера и уезжает влево. Уходящий слой —
 * absolute-оверлей (не влияет на высоту), входящий/устоявшийся — в потоке.
 * Уважает `prefers-reduced-motion`.
 */
function PhaseCrossfade({ id, children }: { id: string; children: ReactNode }): ReactElement {
  const [layers, setLayers] = useState<{ id: string; node: ReactNode; ph: 'enter' | 'idle' | 'leave' }[]>([
    { id, node: children, ph: 'idle' },
  ]);

  useEffect(() => {
    setLayers((prev) => {
      const active = prev.find((l) => l.ph !== 'leave');
      if (active?.id === id) return prev.map((l) => (l.id === id ? { ...l, node: children } : l));
      return [...prev.map((l) => ({ ...l, ph: 'leave' as const })), { id, node: children, ph: 'enter' as const }];
    });
  }, [id, children]);

  useEffect(() => {
    if (!layers.some((l) => l.ph === 'enter')) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() =>
        setLayers((prev) => prev.map((l) => (l.ph === 'enter' ? { ...l, ph: 'idle' } : l))),
      );
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [layers]);

  useEffect(() => {
    if (!layers.some((l) => l.ph === 'leave')) return;
    const ms = reduceMotion() ? 0 : 240;
    const t = window.setTimeout(() => setLayers((prev) => prev.filter((l) => l.ph !== 'leave')), ms);
    return () => window.clearTimeout(t);
  }, [layers]);

  const rm = reduceMotion();
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {layers.map((l) => {
        const leaving = l.ph === 'leave';
        const entering = l.ph === 'enter';
        return (
          <div
            key={l.id}
            style={{
              width: '100%',
              ...(leaving ? { position: 'absolute', top: 0, left: 0, right: 0 } : { position: 'relative' }),
              opacity: entering || leaving ? 0 : 1,
              transform: rm ? undefined : entering ? 'translateY(4px)' : leaving ? 'translateY(-4px)' : 'translateY(0)',
              transition: rm ? 'opacity .15s ease' : 'opacity .2s ease, transform .24s cubic-bezier(0.22,1,0.36,1)',
              pointerEvents: leaving ? 'none' : undefined,
            }}
          >
            {l.node}
          </div>
        );
      })}
    </div>
  );
}

function PhaseContent({
  phase,
  mine,
  error,
  onRespond,
}: {
  phase: Phase;
  mine: boolean;
  error: string | null;
  onRespond: (action: 'accept' | 'decline') => void;
}): ReactElement {
  if (phase === 'pending' || phase === 'accepting') {
    if (mine) {
      return <StatusLine icon="none">Ожидание ответа…</StatusLine>;
    }
    const busy = phase === 'accepting';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <RippleButton variant="secondary" disabled={busy} onClick={() => onRespond('decline')}>
            Отклонить
          </RippleButton>
          <RippleButton variant="primary" disabled={busy} onClick={() => onRespond('accept')}>
            {busy ? 'Подключение…' : 'Присоединиться'}
          </RippleButton>
        </div>
        {error && <span style={{ fontSize: 11.5, color: 'var(--accent-hi)' }}>{error}</span>}
      </div>
    );
  }
  if (phase === 'accepted') {
    return <StatusLine icon="check">{mine ? 'Собеседник присоединился' : 'Вы присоединились'}</StatusLine>;
  }
  if (phase === 'declined') {
    return <StatusLine icon="close">{mine ? 'Приглашение отклонено' : 'Вы отклонили приглашение'}</StatusLine>;
  }
  return <StatusLine icon="close">Приглашение истекло</StatusLine>;
}

/** Кнопка карточки: ripple по нажатию + пружинный scale (класс dm-press). */
function RippleButton({
  variant,
  disabled,
  onClick,
  children,
}: {
  variant: 'primary' | 'secondary';
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);
  const spawn = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (reduceMotion()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const id = Date.now() + Math.random();
    const r = { id, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2, size };
    setRipples((prev) => [...prev, r]);
    window.setTimeout(() => setRipples((prev) => prev.filter((rr) => rr.id !== id)), 620);
  }, []);

  const primary = variant === 'primary';
  return (
    <button
      type="button"
      className="dm-press"
      disabled={disabled}
      onPointerDown={disabled ? undefined : spawn}
      onClick={onClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
        height: 34,
        borderRadius: 12,
        border: primary ? 'none' : '1px solid var(--line-2)',
        background: primary ? ACCENT_GRAD : 'var(--bg-2)',
        color: primary ? '#fff' : 'var(--text-1)',
        boxShadow: primary ? OUT_SHADOW : 'none',
        fontSize: 13.5,
        fontWeight: 600,
        fontFamily: 'inherit',
        letterSpacing: '-0.01em',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
            borderRadius: '50%',
            background: primary ? 'rgba(255,255,255,0.4)' : 'rgba(120,120,120,0.35)',
            pointerEvents: 'none',
            animation: 'inviteRipple 0.6s ease-out forwards',
          }}
        />
      ))}
    </button>
  );
}

function StatusLine({ icon, children }: { icon: 'check' | 'close' | 'none'; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)' }}>
      {icon !== 'none' && (
        <Icon name={icon} size={14} style={{ color: icon === 'check' ? 'var(--ok)' : 'var(--text-3)', flexShrink: 0 }} />
      )}
      {children}
    </div>
  );
}

/**
 * Поповер живой инфо о комнате: подгружает свежие данные (число участников,
 * владелец, что играет) при открытии. Появляется/скрывается пружиной от угла
 * карточки. Закрывается тапом мимо.
 */
function InfoPopover({
  messageId,
  mine,
  onClose,
}: {
  messageId: string;
  mine: boolean;
  onClose: () => void;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<RoomInviteInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useSpringValue(
    1,
    (v) => {
      const el = ref.current;
      if (!el) return;
      el.style.opacity = String(v);
      el.style.transform = `translateY(${(1 - v) * -6}px) scale(${0.9 + v * 0.1})`;
    },
    { stiffness: 320, damping: 24 },
  );

  useEffect(() => {
    let active = true;
    dmApi
      .roomInviteInfo(messageId)
      .then((res) => active && setInfo(res))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [messageId]);

  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Следующий кадр — чтобы тот же клик, что открыл поповер, его не закрыл.
    const t = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        [mine ? 'right' : 'left']: 8,
        width: 'min(260px, 74vw)',
        transformOrigin: mine ? 'right bottom' : 'left bottom',
        opacity: 0,
        zIndex: 30,
        background: 'var(--bg-4)',
        border: '1px solid var(--line-2)',
        borderRadius: 16,
        padding: 14,
        boxShadow: 'var(--shadow-3)',
      }}
    >
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Загрузка…</div>
      ) : !info ? (
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Информация недоступна</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-0)' }}>{info.roomName}</div>
          {!info.available ? (
            <div style={{ fontSize: 13, color: 'var(--accent-hi)' }}>Комната больше недоступна</div>
          ) : (
            <>
              <InfoRow icon="film" label={info.videoTitle ?? 'Контент загружается…'} />
              <InfoRow icon="users" label={`${info.participantCount} из ${info.maxParticipants} участников`} />
              <InfoRow icon="crown" label={`Владелец: ${info.ownerUsername}`} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label }: { icon: 'film' | 'users' | 'crown'; label: string }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-1)' }}>
      <Icon name={icon} size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}
