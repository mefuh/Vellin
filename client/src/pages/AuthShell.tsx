import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { VellinLockup, VellinMark } from '../landing/VellinMark';
import '../landing/vx.css';
import '../landing/auth.css';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Оболочка входа, регистрации и гостевого входа — окно входа клиента для
 * Windows, развёрнутое на страницу: тот же тёплый свет сверху, знак V над
 * формой, поля с подписями прописными и светлая кнопка-пилюля. Формы без
 * карточки: в приложении её нет, и форма стоит прямо на свету.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const titleId = useId();
  return (
    <div className="vx vx-auth">
      <header className="vx-auth__top">
        <Link to="/" aria-label="Vellin — на главную">
          <VellinLockup size={24} direction="row" />
        </Link>
      </header>

      <main className="vx-auth__main">
        <section className="vx-auth__column vx-intro" aria-labelledby={titleId}>
          <VellinMark size={60} />
          <div className="vx-auth__heading">
            <h1 id={titleId}>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="vx-auth__body">{children}</div>
          <p className="vx-auth__footer">{footer}</p>
        </section>
      </main>
    </div>
  );
}

interface FieldProps {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  /**
   * Имя поля. Нужно браузерам и менеджерам паролей: без `name`/`id` Chrome и
   * Safari не предлагают сохранённые email и пароль. `id` дублирует `name`.
   */
  name?: string;
  hint?: string;
}

export function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  name,
  hint,
}: FieldProps) {
  const fallbackId = useId();
  const id = name ?? fallbackId;
  const hintId = `${id}-hint`;
  return (
    <div className="vx-field">
      <label htmlFor={id} className="vx-field__label">
        {label}
      </label>
      <input
        className="vx-field__input"
        type={type}
        name={name}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <span id={hintId} className="vx-field__hint">
          {hint}
        </span>
      )}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="vx-notice" role="alert">
      {message}
    </div>
  );
}
