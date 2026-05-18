import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MountainPoster, VellinLogo } from '../shared';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

const surfaceStyle: CSSProperties = {
  background: 'var(--bg-1)',
  borderRadius: 'var(--r-xl)',
  border: '1px solid var(--line-2)',
  boxShadow: 'var(--shadow-2)',
  padding: '36px 36px 32px',
  width: '100%',
  maxWidth: 440,
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg-0)' }}>
      <aside
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--bg-2)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 48,
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <MountainPoster seed={1} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.7))' }} />
        <Link to="/" style={{ position: 'relative', zIndex: 1 }}>
          <VellinLogo />
        </Link>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 460, color: '#fff' }}>
          <h2 style={{ fontSize: 32, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Один поток. Все вместе.
          </h2>
          <p style={{ marginTop: 12, fontSize: 15, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
            Vellin синхронизирует видео между всеми участниками — без задержек, с реакциями и чатом.
          </p>
        </div>
      </aside>

      <main style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
        <div style={surfaceStyle}>
          <div>
            <h1 style={{ fontSize: 26, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>
              {title}
            </h1>
            <p style={{ marginTop: 6, color: 'var(--text-1)', fontSize: 14 }}>{subtitle}</p>
          </div>
          {children}
          <div style={{ marginTop: 4, color: 'var(--text-2)', fontSize: 13, textAlign: 'center' }}>
            {footer}
          </div>
        </div>
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
}

export function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
}: FieldProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        style={{
          height: 44,
          padding: '0 14px',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--line-2)',
          background: 'var(--bg-2)',
          color: 'var(--text-0)',
          fontSize: 15,
          letterSpacing: '-0.01em',
        }}
      />
    </label>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        background: 'rgba(209,39,27,0.12)',
        color: 'var(--accent-hi)',
        padding: '10px 14px',
        borderRadius: 'var(--r-md)',
        fontSize: 13,
        border: '1px solid rgba(209,39,27,0.3)',
      }}
    >
      {message}
    </div>
  );
}
