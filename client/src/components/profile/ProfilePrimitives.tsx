import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '../../shared';
import { useIsNarrow } from '../../hooks/useMediaQuery';

/** Карточка-секция профиля в стиле settings-макета. */
export function Card({
  title,
  desc,
  icon,
  tone,
  children,
}: {
  title: string;
  desc?: string;
  icon?: IconName;
  tone?: 'danger';
  children: ReactNode;
}) {
  const isNarrow = useIsNarrow();
  return (
    <section
      style={{
        padding: isNarrow ? 16 : 24,
        background: 'var(--bg-1)',
        border: `1px solid ${tone === 'danger' ? 'rgba(209,39,27,0.3)' : 'var(--line-1)'}`,
        borderRadius: 'var(--r-lg)',
      }}
    >
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon && (
          <span style={{ color: tone === 'danger' ? 'var(--accent-hi)' : 'var(--text-1)', display: 'grid', placeItems: 'center' }}>
            <Icon name={icon} size={16} />
          </span>
        )}
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: tone === 'danger' ? 'var(--accent-hi)' : 'var(--text-0)' }}>
            {title}
          </div>
          {desc && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{desc}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  );
}

export const labelStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-2)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

export const inputStyle: CSSProperties = {
  height: 44,
  padding: '0 14px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--line-2)',
  background: 'var(--bg-2)',
  color: 'var(--text-0)',
  fontSize: 15,
  letterSpacing: '-0.01em',
  width: '100%',
  fontFamily: 'inherit',
};

/** Поле ввода с подписью (тот же стиль, что Field из AuthShell). */
export function LabeledInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  maxLength,
  style,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  maxLength?: number;
  style?: CSSProperties;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        maxLength={maxLength}
        style={{ ...inputStyle, opacity: disabled ? 0.6 : 1, ...style }}
      />
    </label>
  );
}

/** Выпадающий список с подписью — стиль совпадает с LabeledInput. */
export function LabeledSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ ...inputStyle, cursor: 'pointer', colorScheme: 'dark', opacity: disabled ? 0.6 : 1 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Многострочное поле с подписью (для bio). */
export function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={3}
        style={{ ...inputStyle, height: 'auto', padding: '10px 14px', resize: 'vertical', lineHeight: 1.45 }}
      />
      {maxLength && (
        <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'flex-end' }}>
          {value.length} / {maxLength}
        </span>
      )}
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
