import { useState } from 'react';
import type { C2S, PlaylistItem } from '@vellin/shared';
import { Button, Chip } from '../../shared';
import { Icon } from '../../shared/Icon';

interface Props {
  playlist: PlaylistItem[];
  canManage: boolean;
  send: (msg: C2S) => boolean;
}

function formatAge(addedAt: number): string {
  const diff = (Date.now() - addedAt) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return `${Math.floor(diff / 86400)} дн`;
}

function shortenUrl(url: string): string {
  if (url.length <= 60) return url;
  return `${url.slice(0, 32)}…${url.slice(-20)}`;
}

/**
 * Placeholder label shown while the server's resolver is still fetching the
 * canonical title. Prefer a friendly source name (hostname) over a raw URL.
 * Magnet links don't have a hostname, so we surface the magnet's display name.
 */
function placeholderLabel(url: string): string {
  if (url.startsWith('magnet:')) {
    const dn = /[?&]dn=([^&]+)/.exec(url)?.[1];
    if (dn) {
      try {
        return decodeURIComponent(dn.replace(/\+/g, ' '));
      } catch {
        /* fallthrough */
      }
    }
    return 'Torrent';
  }
  try {
    const u = new URL(url);
    return `Видео с ${u.hostname.replace(/^www\./, '')}`;
  } catch {
    return shortenUrl(url);
  }
}

export function PlaylistPanel({ playlist, canManage, send }: Props) {
  const [open, setOpen] = useState(true);
  const [draftUrl, setDraftUrl] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onAdd = (e: React.FormEvent): void => {
    e.preventDefault();
    const url = draftUrl.trim();
    if (!url) return;
    send({ t: 'playlist_add', url, clientTs: Date.now() });
    setDraftUrl('');
  };
  const onRemove = (id: string): void => {
    send({ t: 'playlist_remove', itemId: id, clientTs: Date.now() });
  };
  const onPlay = (id: string): void => {
    send({ t: 'playlist_play', itemId: id, clientTs: Date.now() });
  };
  const onDrop = (targetId: string): void => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const fromIdx = playlist.findIndex((p) => p.id === dragId);
    const toIdx = playlist.findIndex((p) => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const next = [...playlist];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    send({ t: 'playlist_reorder', itemIds: next.map((p) => p.id), clientTs: Date.now() });
    setDragId(null);
    setOverId(null);
  };

  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--r-lg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          borderBottom: open ? '1px solid var(--line-1)' : 'none',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="list" size={16} />
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Очередь</h3>
        <Chip tone={playlist.length > 0 ? 'accent' : 'neutral'}>{playlist.length}</Chip>
        <div style={{ flex: 1 }} />
        <Icon name="chevronD" size={14} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </header>

      {open && (
        <>
          {canManage && (
            <form
              onSubmit={onAdd}
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--line-1)',
                display: 'flex',
                gap: 8,
              }}
            >
              <input
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://… — название подтянется автоматически"
                style={{
                  flex: 1,
                  height: 34,
                  padding: '0 12px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--line-2)',
                  background: 'var(--bg-2)',
                  color: 'var(--text-0)',
                  fontSize: 13,
                }}
              />
              <Button type="submit" size="sm" icon="plus" disabled={!draftUrl.trim()}>
                В очередь
              </Button>
            </form>
          )}

          <div style={{ padding: playlist.length ? '6px 0' : 0 }}>
            {playlist.length === 0 ? (
              <div
                style={{
                  padding: '18px 14px',
                  color: 'var(--text-2)',
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                Очередь пуста.{' '}
                {canManage
                  ? 'Добавьте видео — оно запустится автоматически, когда текущее закончится.'
                  : 'Когда кто-то добавит видео, оно появится здесь.'}
              </div>
            ) : (
              playlist.map((item, idx) => (
                <div
                  key={item.id}
                  draggable={canManage}
                  onDragStart={() => canManage && setDragId(item.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  onDragOver={(e) => {
                    if (!canManage || !dragId) return;
                    e.preventDefault();
                    setOverId(item.id);
                  }}
                  onDrop={(e) => {
                    if (!canManage) return;
                    e.preventDefault();
                    onDrop(item.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    background: overId === item.id ? 'var(--bg-3)' : 'transparent',
                    opacity: dragId === item.id ? 0.4 : 1,
                    borderTop: idx === 0 ? 'none' : '1px solid var(--line-1)',
                  }}
                >
                  {canManage && (
                    <span
                      style={{
                        color: 'var(--text-2)',
                        cursor: 'grab',
                        display: 'inline-flex',
                      }}
                      title="Перетащите для изменения порядка"
                    >
                      <Icon name="gripVertical" size={14} />
                    </span>
                  )}
                  <span
                    style={{
                      width: 22,
                      fontSize: 11,
                      color: 'var(--text-2)',
                      fontFamily: 'var(--font-mono)',
                      textAlign: 'right',
                    }}
                  >
                    {idx + 1}.
                  </span>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--text-0)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title ?? placeholderLabel(item.url)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      от {item.addedByUsername} · {formatAge(item.addedAt)}
                    </span>
                  </div>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => onPlay(item.id)}
                        aria-label="Запустить это видео"
                        title="Запустить сейчас"
                        style={{
                          color: 'var(--accent)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'inline-flex',
                        }}
                      >
                        <Icon name="play" size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        aria-label="Удалить из очереди"
                        title="Удалить"
                        style={{
                          color: 'var(--text-2)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 4,
                        }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
