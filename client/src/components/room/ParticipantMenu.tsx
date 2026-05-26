import { useEffect, useRef } from 'react';
import type { ParticipantInfo } from '@vellin/shared';
import { Avatar } from '../../shared';
import { Icon } from '../../shared/Icon';

interface Props {
  participant: ParticipantInfo;
  you: ParticipantInfo;
  onKick: (userId: string) => void;
  onSetRole: (userId: string, role: 'admin' | 'member') => void;
  onOpenPermissions: (userId: string) => void;
  onClose: () => void;
}

type Action = {
  key: string;
  label: string;
  icon: 'userMinus' | 'userPlus' | 'lock' | 'crown';
  danger?: boolean;
  onClick: () => void;
};

function buildActions(target: ParticipantInfo, you: ParticipantInfo, props: Props): Action[] {
  const actions: Action[] = [];
  const myRole = you.role;
  const targetRole = target.role;
  if (myRole === 'superadmin') {
    // Главный админ сервиса — может кикнуть кого угодно, включая владельца.
    if (target.userId !== you.userId) {
      actions.push({
        key: 'kick',
        label: 'Удалить из комнаты',
        icon: 'userMinus',
        danger: true,
        onClick: () => props.onKick(target.userId),
      });
    }
    return actions;
  }
  if (myRole === 'owner') {
    if (targetRole === 'member') {
      actions.push({
        key: 'promote',
        label: 'Назначить админом',
        icon: 'userPlus',
        onClick: () => props.onSetRole(target.userId, 'admin'),
      });
      actions.push({
        key: 'perms',
        label: 'Настроить права',
        icon: 'lock',
        onClick: () => props.onOpenPermissions(target.userId),
      });
      actions.push({
        key: 'kick',
        label: 'Удалить из комнаты',
        icon: 'userMinus',
        danger: true,
        onClick: () => props.onKick(target.userId),
      });
    } else if (targetRole === 'admin') {
      actions.push({
        key: 'demote',
        label: 'Снять с админа',
        icon: 'crown',
        onClick: () => props.onSetRole(target.userId, 'member'),
      });
      actions.push({
        key: 'kick',
        label: 'Удалить из комнаты',
        icon: 'userMinus',
        danger: true,
        onClick: () => props.onKick(target.userId),
      });
    } else if (targetRole === 'guest') {
      actions.push({
        key: 'kick',
        label: 'Удалить из комнаты',
        icon: 'userMinus',
        danger: true,
        onClick: () => props.onKick(target.userId),
      });
    }
  } else if (myRole === 'admin') {
    if (targetRole === 'member' || targetRole === 'guest') {
      actions.push({
        key: 'kick',
        label: 'Удалить из комнаты',
        icon: 'userMinus',
        danger: true,
        onClick: () => props.onKick(target.userId),
      });
    }
  }
  return actions;
}

export function ParticipantMenu(props: Props) {
  const { participant, you, onClose } = props;
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent): void => {
      if (!ref.current) return;
      if (e.target instanceof Node && !ref.current.contains(e.target)) onClose();
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const actions = buildActions(participant, you, props);
  if (actions.length === 0) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        role="menu"
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-lg)',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          boxShadow: 'var(--shadow-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={participant.username} seed={participant.avatarSeed} size={36} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{participant.username}</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'capitalize' }}>
              {participant.role}
            </span>
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--line-1)' }} />
        {actions.map((a) => (
          <button
            key={a.key}
            role="menuitem"
            onClick={a.onClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              background: 'var(--bg-2)',
              color: a.danger ? 'var(--accent-hi)' : 'var(--text-0)',
              fontSize: 14,
              cursor: 'pointer',
              border: 'none',
              textAlign: 'left',
            }}
          >
            <Icon name={a.icon} size={16} />
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
