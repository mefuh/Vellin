import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../shared';
import { useIsNarrow } from '../../hooks/useMediaQuery';

/**
 * Примитивы секций настроек в стиле нового hero-макета: крупный дисплейный
 * заголовок + описание над скруглённой карточкой безрамочных инлайн-полей
 * (разделители между полями рисует CSS `.settings-card`). Всё на токенах —
 * работает в обеих темах.
 */

/** Mono-uppercase подпись поля (как в макете). */
export const fieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--text-2)',
};

/** Безрамочное инлайн-поле ввода. */
export const borderlessInputStyle: CSSProperties = {
  width: '100%',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-0)',
  padding: '2px 0',
  fontFamily: 'inherit',
  fontSize: 18,
  fontWeight: 500,
  letterSpacing: '-0.01em',
};

/** Секция настроек: заголовок + описание + (опц.) карточка полей. */
export function Card({
  title,
  desc,
  children,
  contained = true,
  headingRight,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  /** Обернуть детей в скруглённую карточку безрамочных полей. */
  contained?: boolean;
  headingRight?: ReactNode;
}) {
  return (
    <section className="hero-anim" style={{ animation: 'heroFadeUp 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) both' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: desc ? 6 : 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(24px, 3vw, 32px)', letterSpacing: '-0.02em', margin: 0 }}>
          {title}
        </h2>
        {headingRight}
      </div>
      {desc && <p style={{ color: 'var(--text-2)', fontSize: 15, margin: '0 0 26px', lineHeight: 1.5 }}>{desc}</p>}
      {contained ? <div className="settings-card">{children}</div> : children}
    </section>
  );
}

/** Подпись поля с опциональным правым слотом (например счётчик символов). */
export function FieldLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <span style={{ ...fieldLabelStyle, display: 'flex', justifyContent: right ? 'space-between' : 'flex-start', marginBottom: 8 }}>
      <span>{children}</span>
      {right && <span style={{ color: 'var(--text-3)' }}>{right}</span>}
    </span>
  );
}

/** Безрамочное поле ввода с подписью. */
export function LabeledInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  maxLength,
  big,
  inputStyle,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  maxLength?: number;
  /** Крупное поле (имя пользователя). */
  big?: boolean;
  inputStyle?: CSSProperties;
}) {
  return (
    <label style={{ display: 'block' }}>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        maxLength={maxLength}
        style={{
          ...borderlessInputStyle,
          ...(big ? { fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 } : {}),
          opacity: disabled ? 0.6 : 1,
          ...inputStyle,
        }}
      />
    </label>
  );
}

/** Безрамочное многострочное поле с подписью и счётчиком. */
export function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <label style={{ display: 'block' }}>
      <FieldLabel right={maxLength ? `${value.length} / ${maxLength}` : undefined}>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        style={{ ...borderlessInputStyle, resize: 'none', lineHeight: 1.5 }}
      />
    </label>
  );
}

/** Строка статуса под формой: ошибка (красная) или успех (зелёная). */
export function StatusLine({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) {
    return <span style={{ fontSize: 13, color: 'var(--accent-hi)' }}>{error}</span>;
  }
  if (success) {
    return (
      <span style={{ fontSize: 13, color: 'var(--ok)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Icon name="check" size={14} /> {success}
      </span>
    );
  }
  return null;
}

/**
 * Плавающая панель сохранения + тост «Сохранено» (через портал в body, чтобы
 * `position:fixed` надёжно цеплялся за вьюпорт даже внутри мобильного
 * скролл-контейнера — см. заметку в global.css). `saved` и его авто-сброс
 * управляются родителем.
 */
export function SaveBar({
  dirty,
  saved,
  busy,
  canSave = true,
  onSave,
  onCancel,
}: {
  dirty: boolean;
  saved: boolean;
  busy: boolean;
  canSave?: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isNarrow = useIsNarrow();
  const bottom = isNarrow ? 84 : 28;

  // Тост «Сохранено» держим смонтированным на время выходной анимации (зеркальной
  // появлению): когда `saved` гаснет, проигрываем heroPopOutDown, затем убираем.
  const [savedVisible, setSavedVisible] = useState(false);
  const [savedClosing, setSavedClosing] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (saved) {
      clearTimeout(savedTimer.current);
      setSavedVisible(true);
      setSavedClosing(false);
    } else {
      setSavedClosing(true);
      savedTimer.current = setTimeout(() => setSavedVisible(false), 360);
    }
    return () => clearTimeout(savedTimer.current);
  }, [saved]);
  return createPortal(
    <>
      {dirty && !saved && (
        // Центрируем fixed-панель приёмом left:0/right:0 + margin:auto (надёжнее
        // flex-обёртки, которая схлопывалась) и ограничиваем ширину вьюпортом. На
        // узких экранах подпись сжимается (многоточие), кнопки не усыхают — так
        // «Сохранить» больше не уезжает за правый край. Без JS-медиазапроса.
        <div
          className="hero-anim"
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom,
            zIndex: 120,
            maxWidth: 'calc(100vw - 24px)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px 10px 18px',
            borderRadius: 18,
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            border: '1px solid var(--glass-bd)',
            boxShadow: 'var(--shadow-3)',
            animation: 'heroBarIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: 'var(--text-1)',
              flex: '0 1 auto',
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {isNarrow ? 'Есть изменения' : 'Есть несохранённые изменения'}
          </span>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ flex: 'none', padding: '10px 14px', borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Отменить
          </button>
          <button
            onClick={onSave}
            disabled={busy || !canSave}
            className="hero-press"
            style={{
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: busy || !canSave ? 'not-allowed' : 'pointer',
              opacity: busy || !canSave ? 0.6 : 1,
              boxShadow: '0 10px 26px -8px var(--accent-glow)',
            }}
          >
            {busy && (
              <span
                className="hero-anim"
                style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'heroSpin 0.7s linear infinite' }}
              />
            )}
            Сохранить
          </button>
        </div>
      )}

      {savedVisible && (
        // Центрирующий translateX(-50%) держим на обёртке, а pop-анимацию — на
        // внутреннем элементе: иначе кадр heroPopIn с `transform:none` сбивал
        // центрирование, и тост уезжал вправо на половину ширины.
        <div style={{ position: 'fixed', left: '50%', bottom, zIndex: 120, transform: 'translateX(-50%)' }}>
          <div
            className="hero-anim"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              padding: '12px 22px',
              borderRadius: 16,
              background: 'color-mix(in srgb, var(--ok) 16%, var(--glass-bg))',
              backdropFilter: 'blur(var(--glass-blur))',
              WebkitBackdropFilter: 'blur(var(--glass-blur))',
              border: '1px solid color-mix(in srgb, var(--ok) 35%, transparent)',
              boxShadow: 'var(--shadow-3)',
              animation: savedClosing
                ? 'heroPopOutDown 0.34s cubic-bezier(0.22, 1, 0.36, 1) both'
                : 'heroPopIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
            }}
          >
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--ok)', display: 'grid', placeItems: 'center', color: '#06301a', fontSize: 12, fontWeight: 800 }}>
              ✓
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ok)' }}>Сохранено</span>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

/** Акцентная кнопка-таблетка submit (email/пароль). */
export function PillSubmit({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="hero-press"
      style={{
        padding: '13px 24px',
        borderRadius: 999,
        border: 'none',
        background: 'var(--accent)',
        color: '#fff',
        fontSize: 15,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        boxShadow: '0 12px 30px -10px var(--accent-glow)',
      }}
    >
      {children}
    </button>
  );
}
