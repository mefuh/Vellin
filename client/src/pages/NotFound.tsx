import { Link } from 'react-router-dom';
import { Button, VellinLogo } from '../shared';

export function NotFound() {
  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
        background: 'var(--bg-0)',
        color: 'var(--text-0)',
      }}
    >
      <VellinLogo />
      <h1
        style={{
          fontSize: 'clamp(30px, 8vw, 48px)',
          margin: 0,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          textAlign: 'center',
        }}
      >
        404 · ничего не нашли
      </h1>
      <p style={{ color: 'var(--text-1)', maxWidth: 380, textAlign: 'center' }}>
        Возможно, комната закрыта или ссылка устарела. Попробуйте начать с главной.
      </p>
      <Link to="/">
        <Button variant="primary" size="lg" iconRight="arrow">
          На главную
        </Button>
      </Link>
    </div>
  );
}
