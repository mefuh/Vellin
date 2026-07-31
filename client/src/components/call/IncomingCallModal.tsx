import { useEffect, useState } from 'react';
import { Avatar } from '../../shared';
import { Icon } from '../../shared/Icon';
import { useDmCallStore } from '../../stores/dmCallStore';

/**
 * Экран входящего звонка. Показывается поверх любой страницы, потому что звонок
 * приходит независимо от того, где сейчас пользователь.
 */
export function IncomingCallModal(): React.ReactElement | null {
  const incoming = useDmCallStore((s) => s.incoming);
  const accept = useDmCallStore((s) => s.accept);
  const decline = useDmCallStore((s) => s.decline);
  const [answering, setAnswering] = useState(false);

  // Мигание заголовка вкладки: звук может быть заглушён политикой браузера,
  // а пропускать звонок из-за этого нельзя.
  useEffect(() => {
    if (!incoming) return;
    const original = document.title;
    let on = false;
    const timer = window.setInterval(() => {
      on = !on;
      document.title = on ? `📞 ${incoming.from.username} звонит…` : original;
    }, 1000);
    return () => {
      window.clearInterval(timer);
      document.title = original;
    };
  }, [incoming]);

  if (!incoming) return null;
  const { from, call } = incoming;

  const onAccept = (withVideo: boolean): void => {
    setAnswering(true);
    accept(withVideo);
  };

  return (
    <div
      role="dialog"
      aria-label={`Входящий звонок от ${from.username}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0,0,0,0.62)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          width: 'min(380px, calc(100vw - 32px))',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-3)',
          padding: '28px 24px 22px',
          textAlign: 'center',
        }}
      >
        <Avatar name={from.username} seed={from.avatarSeed} src={from.avatarUrl} size={92} />
        <div style={{ marginTop: 16, fontSize: 20, fontWeight: 600, color: 'var(--text-0)' }}>
          {from.username}
        </div>
        <div style={{ marginTop: 6, fontSize: 13.5, color: 'var(--text-2)' }}>
          {call.video ? 'Входящий видеозвонок' : 'Входящий звонок'}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 26 }}>
          <RoundButton
            label="Отклонить"
            icon="phoneOff"
            background="var(--accent)"
            onClick={decline}
            disabled={answering}
          />
          {call.video && (
            <RoundButton
              label="Ответить с камерой"
              icon="video"
              background="var(--bg-4)"
              onClick={() => onAccept(true)}
              disabled={answering}
            />
          )}
          <RoundButton
            label="Ответить"
            icon="phone"
            background="var(--ok)"
            onClick={() => onAccept(false)}
            disabled={answering}
          />
        </div>
      </div>
    </div>
  );
}

function RoundButton({
  label,
  icon,
  background,
  onClick,
  disabled,
}: {
  label: string;
  icon: 'phone' | 'phoneOff' | 'video';
  background: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 58,
        height: 58,
        borderRadius: 999,
        border: 'none',
        background,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Icon name={icon} size={24} />
    </button>
  );
}
