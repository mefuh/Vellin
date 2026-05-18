import { useEffect, useRef, useState } from 'react';
import type { C2S, ChatMessage, ParticipantInfo } from '@vellin/shared';
import { Avatar, Button, Chip } from '../../shared';
import { Icon } from '../../shared/Icon';

interface RoomChatProps {
  messages: ChatMessage[];
  participants: ParticipantInfo[];
  you: ParticipantInfo | null;
  collapsed: boolean;
  send: (msg: C2S) => boolean;
  onToggle: () => void;
  /** If provided, clicking a participant chip opens a menu for that user. */
  onOpenParticipantMenu?: (userId: string) => void;
}

const REACTIONS = ['❤️', '😂', '😮', '🔥', '👏', '🎉', '🥲', '👀'] as const;

function genNonce(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return new Date(iso).toLocaleDateString();
}

export function RoomChat({
  messages,
  participants,
  you,
  collapsed,
  send,
  onToggle,
  onOpenParticipantMenu,
}: RoomChatProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    send({ t: 'chat_message', body, clientTs: Date.now(), nonce: genNonce() });
    setDraft('');
  };

  if (collapsed) {
    return (
      <aside
        style={{
          width: 56,
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-lg)',
          padding: '14px 8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <button onClick={onToggle} aria-label="Раскрыть чат">
          <Icon name="chat" size={18} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          {participants.slice(0, 6).map((p) => (
            <Avatar
              key={p.userId}
              name={p.username}
              seed={p.avatarSeed}
              size={28}
              status={p.isHost ? 'watching' : 'online'}
            />
          ))}
          {participants.length > 6 && (
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>+{participants.length - 6}</span>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        width: '100%',
        background: 'var(--bg-1)',
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--r-lg)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <header
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Icon name="chat" size={18} style={{ color: 'var(--text-1)' }} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Чат</h3>
        <Chip tone="neutral">{participants.length}</Chip>
        <div style={{ flex: 1 }} />
        <button onClick={onToggle} aria-label="Свернуть">
          <Icon name="close" size={16} />
        </button>
      </header>

      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        {participants.map((p) => {
          const isMe = !!you && p.userId === you.userId;
          const interactive = !!onOpenParticipantMenu && !isMe;
          return (
            <button
              key={p.userId}
              type="button"
              onClick={interactive ? () => onOpenParticipantMenu!(p.userId) : undefined}
              disabled={!interactive}
              title={
                p.role === 'owner'
                  ? 'Владелец'
                  : p.role === 'admin'
                    ? 'Админ'
                    : p.role === 'guest'
                      ? 'Гость'
                      : 'Участник'
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 999,
                background: 'var(--bg-2)',
                fontSize: 12,
                border: 'none',
                cursor: interactive ? 'pointer' : 'default',
              }}
            >
              <Avatar
                name={p.username}
                seed={p.avatarSeed}
                size={18}
                status={p.isHost ? 'watching' : 'online'}
              />
              <span style={{ color: 'var(--text-1)' }}>{p.username}</span>
              {p.role === 'owner' && (
                <Icon name="crown" size={11} style={{ color: 'var(--warn)' }} />
              )}
              {p.role === 'admin' && (
                <Icon name="pin" size={11} style={{ color: 'var(--accent)' }} />
              )}
              {p.role === 'guest' && (
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>гость</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          padding: '12px 14px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} mine={m.author.id === you?.userId} />
        ))}
      </div>

      <form
        onSubmit={submit}
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--line-1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => send({ t: 'reaction', emoji, clientTs: Date.now() })}
              style={{
                fontSize: 16,
                padding: '4px 8px',
                borderRadius: 8,
                background: 'var(--bg-2)',
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            placeholder="Написать сообщение…"
            style={{
              flex: 1,
              height: 38,
              padding: '0 14px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--line-2)',
              background: 'var(--bg-2)',
              color: 'var(--text-0)',
              fontSize: 14,
            }}
          />
          <Button type="submit" size="md" icon="send" disabled={!draft.trim()}>
            Отпр.
          </Button>
        </div>
      </form>
    </aside>
  );
}

function MessageRow({ message, mine }: { message: ChatMessage; mine: boolean }) {
  if (message.kind === 'system') {
    return (
      <div style={{ alignSelf: 'center', color: 'var(--text-2)', fontSize: 12, fontStyle: 'italic' }}>
        {message.body}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        flexDirection: mine ? 'row-reverse' : 'row',
      }}
    >
      <Avatar
        name={message.author.username}
        seed={message.author.avatarSeed}
        size={28}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          maxWidth: 220,
          alignItems: mine ? 'flex-end' : 'flex-start',
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', gap: 6 }}>
          <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{message.author.username}</span>
          <span>· {formatRelative(message.createdAt)}</span>
        </div>
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--r-md)',
            background: mine ? 'var(--accent-soft)' : 'var(--bg-3)',
            color: mine ? 'var(--accent-hi)' : 'var(--text-0)',
            fontSize: 14,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.body}
        </div>
      </div>
    </div>
  );
}
