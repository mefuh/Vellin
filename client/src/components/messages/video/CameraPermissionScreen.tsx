import { createPortal } from 'react-dom';
import { Button, Icon } from '../../../shared';

/**
 * CameraPermissionManager (UI) — аккуратный экран, если доступ к камере не
 * выдан/запрещён. Не падаем с ошибкой: объясняем и предлагаем повторить.
 */
export function CameraPermissionScreen({
  onRetry,
  onClose,
}: {
  onRetry: () => void;
  onClose: () => void;
}): React.ReactElement {
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(10,8,7,0.6)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(360px, 92vw)',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          borderRadius: 'var(--r-lg)',
          padding: 22,
          textAlign: 'center',
          boxShadow: 'var(--shadow-3)',
        }}
      >
        <div style={{ width: 52, height: 52, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-hi)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
          <Icon name="video" size={26} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-0)' }}>Нужен доступ к камере</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 }}>
          Разрешите доступ к камере и микрофону, чтобы записывать видеосообщения. Если вы запретили ранее —
          включите доступ в настройках сайта и повторите.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" size="sm" onClick={onRetry}>
            Повторить
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
