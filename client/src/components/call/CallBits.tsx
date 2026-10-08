import { useEffect, useRef, useState } from 'react';
import { CallIcon, type CallGlyphName } from './CallGlyph';

/**
 * Общие детали экрана звонка — перенос winapp/lib/widgets/call/call_bits.dart.
 * Вид целиком живёт в call.css; здесь только разметка и поведение.
 */

/**
 * Показ слоя с анимацией входа и — главное — выхода.
 *
 * Обычное `{data && <Слой/>}` уходу анимироваться не даёт: как только данных
 * не стало, слой пропадает рывком. Здесь последнее непустое значение держится
 * до конца ухода, а `state` переключается кадром позже монтирования, чтобы
 * переход входа вообще случился.
 */
export function usePresence<T>(
  data: T | null,
  outMs = 500,
): { shown: T | null; state: 'in' | 'out' } {
  const live = data !== null;
  const lastRef = useRef<T | null>(data);
  if (data !== null) lastRef.current = data;
  const [mounted, setMounted] = useState(live);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (live) {
      setMounted(true);
      let second = 0;
      const first = window.requestAnimationFrame(() => {
        second = window.requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        window.cancelAnimationFrame(first);
        window.cancelAnimationFrame(second);
      };
    }
    setEntered(false);
    const t = window.setTimeout(() => {
      setMounted(false);
      lastRef.current = null;
    }, outMs);
    return () => window.clearTimeout(t);
  }, [live, outMs]);

  return { shown: mounted ? lastRef.current : null, state: live && entered ? 'in' : 'out' };
}

/** Секундный такт — только ради таймера разговора. */
export function useSecondTick(active: boolean): void {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => tick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [active]);
}

/**
 * «26:42» от момента ответа. Минуты дополняются нулём: иначе строка прыгает
 * на переходе от 9 к 10 минутам.
 */
export function elapsed(answeredAt: string | null | undefined): string {
  if (!answeredAt) return '--:--';
  const start = Date.parse(answeredAt);
  if (!Number.isFinite(start)) return '--:--';
  const total = Math.min(359999, Math.max(0, Math.floor((Date.now() - start) / 1000)));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Живой тёплый фон окна разговора. */
export function CallBackdrop(): React.ReactElement {
  return <div className="vc-backdrop" aria-hidden />;
}

/**
 * Дышащая точка состояния. Период задаёт смысл: 3.4 с — сеть в норме, 1.5 с —
 * слабая, 1 с — потеря связи.
 */
export function PulseDot({
  color = '#e2c99b',
  period = 3400,
}: {
  color?: string;
  period?: number;
}): React.ReactElement {
  return (
    <span
      className="vc-dot"
      aria-hidden
      style={
        {
          '--vc-dot': color,
          '--vc-dot-glow': color,
          '--vc-dot-period': `${period}ms`,
        } as React.CSSProperties
      }
    />
  );
}

/** Кольцо говорящего: пульсирующая обводка и две расходящиеся волны. */
export function SpeakingHalo({ size }: { size: number | string }): React.ReactElement {
  const value = typeof size === 'number' ? `${size}px` : size;
  return (
    <span className="vc-halo" aria-hidden style={{ '--vc-halo': value } as React.CSSProperties}>
      <span className="vc-halo-wave" />
      <span className="vc-halo-wave" />
      <span className="vc-halo-ring" />
    </span>
  );
}

/** Состояние круглой кнопки: обычная, выключено, идёт демонстрация, открыта панель. */
export type CallButtonTone = 'plain' | 'off' | 'gold' | 'active';

/** Круглая кнопка капсулы управления, 54×54. */
export function CallButton({
  glyph,
  label,
  onClick,
  tone = 'plain',
  speaking = false,
  pressed,
}: {
  glyph: CallGlyphName;
  label: string;
  onClick?: () => void;
  tone?: CallButtonTone;
  speaking?: boolean;
  /** Для переключателей — объявляется читалке экрана как нажатое состояние. */
  pressed?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="vc-btn"
      data-tone={tone}
      onClick={onClick}
      disabled={!onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
    >
      {/* Кольцо говорящего — позади иконки: поверх оно затягивало её пеленой. */}
      {speaking && <SpeakingHalo size={66} />}
      <span className="vc-btn-tone" aria-hidden />
      <CallIcon key={glyph} name={glyph} size={19} />
    </button>
  );
}

/** Сброс звонка — единственный цветной элемент интерфейса. */
export function EndCallButton({
  onClick,
  label = 'Завершить звонок',
  size = 'dock',
}: {
  onClick: () => void;
  /** В разговоре звонок завершают, на вызове — отклоняют или отменяют. */
  label?: string;
  size?: 'dock' | 'invite' | 'bar';
}): React.ReactElement {
  const iconSize = size === 'bar' ? 11 : size === 'invite' ? 22 : 21;
  return (
    <button
      type="button"
      className="vc-end"
      data-size={size}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <CallIcon name="hangup" size={iconSize} />
    </button>
  );
}

/** Круглая кнопка-иконка вне капсулы. */
export function IconButton({
  glyph,
  label,
  onClick,
  bare = false,
  size = 30,
}: {
  glyph: CallGlyphName;
  label: string;
  onClick: () => void;
  bare?: boolean;
  size?: number;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="vc-icon-btn"
      data-bare={bare || undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      style={{ '--vc-ib': `${size}px` } as React.CSSProperties}
    >
      <CallIcon name={glyph} size={Math.round(size * 0.36 * 10) / 10} />
    </button>
  );
}

/** Аватар участника с кольцом говорящего. Своё лицо приглушено. */
export function CallAvatar({
  username,
  avatarUrl,
  size,
  speaking = false,
  dim = false,
}: {
  username: string;
  avatarUrl?: string | null;
  /** Не задан — размер берётся из CSS (`--vc-av`), он меняется на телефоне. */
  size?: number;
  speaking?: boolean;
  dim?: boolean;
}): React.ReactElement {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [avatarUrl]);
  const initial = username ? username[0]!.toUpperCase() : '?';
  const showImage = !!avatarUrl && !broken;
  return (
    <span
      className="vc-avatar"
      data-dim={dim || undefined}
      style={size === undefined ? undefined : ({ '--vc-av': `${size}px` } as React.CSSProperties)}
    >
      {speaking && <SpeakingHalo size="calc(var(--vc-av) + 24px)" />}
      <span className="vc-avatar-face">
        {showImage ? (
          <img src={avatarUrl!} alt="" draggable={false} onError={() => setBroken(true)} />
        ) : (
          <span className="vc-avatar-initial" aria-hidden>
            {initial}
          </span>
        )}
      </span>
    </span>
  );
}

/** Переключатель настройки: 44×25. Сам по себе не нажимается — нажимается строка. */
export function Switch({ on }: { on: boolean }): React.ReactElement {
  return <span className="vc-switch" data-on={on || undefined} aria-hidden />;
}

/** Строка настройки с переключателем. */
export function SettingRow({
  title,
  hint,
  value,
  onChange,
  disabled,
}: {
  title: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className="vc-setting-row"
      onClick={() => onChange(!value)}
      disabled={disabled}
    >
      <span>
        <span className="vc-row-text">{title}</span>
        <span className="vc-row-hint">{hint}</span>
      </span>
      <Switch on={value} />
    </button>
  );
}

/** Выбор одного значения из ряда: разрешение, частота кадров. */
export function Segmented<T extends string | number>({
  value,
  items,
  onChange,
  label,
}: {
  value: T;
  items: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}): React.ReactElement {
  return (
    <div className="vc-segmented" role="radiogroup" aria-label={label}>
      {items.map((item) => (
        <button
          key={String(item.value)}
          type="button"
          role="radio"
          aria-checked={item.value === value}
          className="vc-segment"
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Кадр видео. Свой поток не звучит (иначе эхо): звук играет общий микшер. */
export function VideoView({
  stream,
  mirror,
  contain,
  label,
}: {
  stream: MediaStream;
  mirror?: boolean;
  contain?: boolean;
  label?: string;
}): React.ReactElement {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    // Автозапуск может не сработать без жеста — кадр тогда замрёт, звук при
    // этом идёт через общий микшер и не страдает.
    void el.play().catch(() => undefined);
  }, [stream]);
  return (
    <video
      ref={ref}
      className="vc-video"
      data-mirror={mirror || undefined}
      data-contain={contain || undefined}
      autoPlay
      playsInline
      muted
      aria-label={label}
    />
  );
}
