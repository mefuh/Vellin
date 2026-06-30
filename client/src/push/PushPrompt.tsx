import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { usePushStore } from '../stores/pushStore';
import { useIsMobile } from '../hooks/useMediaQuery';

/** Через сколько после загрузки предлагать включить уведомления (не сразу!). */
const SHOW_AFTER_MS = 20000;

/**
 * Мягкий промпт «Включить уведомления». Не запрашивает разрешение на загрузке:
 * появляется только спустя время использования, и только если разрешение ещё не
 * запрашивалось (permission === 'default') и пользователь не скрывал баннер.
 * Само нативное разрешение запрашивается лишь по явному клику «Включить».
 */
export function PushPrompt(): React.ReactElement | null {
  const isUser = useAuthStore((s) => s.user?.kind === 'user');
  const supported = usePushStore((s) => s.supported);
  const permission = usePushStore((s) => s.permission);
  const busy = usePushStore((s) => s.busy);
  const enable = usePushStore((s) => s.enable);
  const dismissPrompt = usePushStore((s) => s.dismissPrompt);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);

  const eligible =
    isUser && supported && permission === 'default' && !usePushStore.getState().promptDismissed();

  useEffect(() => {
    if (!eligible) return;
    const id = setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => clearTimeout(id);
  }, [eligible]);

  if (!eligible || !ready) return null;

  const close = (): void => {
    setClosing(true);
    setTimeout(() => {
      dismissPrompt();
      setReady(false);
    }, 220);
  };

  const onEnable = async (): Promise<void> => {
    const res = await enable();
    if (res.ok || res.reason === 'denied') close();
  };

  return (
    <div
      role="dialog"
      aria-label="Включить уведомления"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: isMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 84px)' : 24,
        transform: `translateX(-50%) translateY(${closing ? '12px' : '0'})`,
        opacity: closing ? 0 : 1,
        width: 'min(420px, calc(100vw - 24px))',
        zIndex: 95,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: 14,
        borderRadius: 'var(--r-lg)',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
        WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
        border: '1px solid var(--glass-bd)',
        boxShadow: 'var(--shadow-3)',
        transition: 'opacity .22s ease, transform .26s cubic-bezier(.22,1,.36,1)',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 38,
          height: 38,
          borderRadius: 999,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--accent-soft)',
          color: 'var(--accent-hi)',
        }}
      >
        <Icon name="bell" size={20} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>Включить уведомления?</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.4 }}>
          Получайте сообщения, заявки и приглашения, даже когда вкладка закрыта.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void onEnable()}>
            {busy ? 'Включаем…' : 'Включить'}
          </Button>
          <Button size="sm" variant="ghost" onClick={close}>
            Позже
          </Button>
          <button
            onClick={() => {
              close();
              navigate('/settings/notifications');
            }}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textDecoration: 'underline',
            }}
          >
            Настройки
          </button>
        </div>
      </div>
    </div>
  );
}
