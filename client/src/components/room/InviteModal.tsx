import { useEffect, useState } from 'react';
import type { InviteLink, RoomDetails } from '@vellin/shared';
import { Button } from '../../shared';
import { Icon } from '../../shared/Icon';
import { roomsApi } from '../../api/rooms';
import { ApiHttpError } from '../../api/client';

interface InviteModalProps {
  room: RoomDetails;
  canCreate: boolean;
  onClose: () => void;
}

export function InviteModal({ room, canCreate, onClose }: InviteModalProps) {
  const baseUrl = `${window.location.origin}/room/${room.slug}`;
  const [link, setLink] = useState<InviteLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (canCreate && room.isPrivate && !link) {
      setCreating(true);
      roomsApi
        .createInvite(room.id, {})
        .then((res) => setLink(res.link))
        .catch((err) => {
          setError(err instanceof ApiHttpError ? err.payload.message : 'Не удалось создать приглашение');
        })
        .finally(() => setCreating(false));
    }
  }, [canCreate, room.isPrivate, room.id, link]);

  const url = link ? link.url : baseUrl;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 90,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-xl)',
          padding: 'clamp(20px, 4vw, 28px)',
          width: '100%',
          maxWidth: 460,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: 'var(--shadow-3)',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Пригласить в комнату</h2>
          <button onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div
          style={{
            background: 'var(--bg-2)',
            padding: '12px 14px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--line-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="link" size={16} style={{ color: 'var(--text-2)' }} />
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-0)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {creating ? 'Создаём…' : url}
          </span>
          <Button size="sm" variant="secondary" icon="copy" onClick={copy} disabled={creating}>
            {copied ? 'Скопировано' : 'Копировать'}
          </Button>
        </div>

        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
          {room.isPrivate
            ? canCreate
              ? 'Приватная комната. Эта ссылка позволяет войти без пароля.'
              : 'Приватная комната. Поделитесь паролем и базовой ссылкой.'
            : 'Публичная комната — любой может войти по этой ссылке.'}
        </p>

        {error && (
          <div style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
