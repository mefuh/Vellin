import { Link } from 'react-router-dom';
import { Button, VellinLogo } from '../shared';

export function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        background: 'var(--bg-0)',
        color: 'var(--text-0)',
      }}
    >
      <VellinLogo />
      <h1 style={{ fontSize: 48, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>
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
