import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { C2S, ChatMessage } from '@vellin/shared';
import { Avatar } from '../../shared';
import { Icon } from '../../shared/Icon';
import { useRoomStore } from '../../stores/roomStore';

// How long a freshly-arrived message lingers as a pop-up while the player
// controls are hidden. Must match the vellinFsChatPop animation in global.css.
const EPHEMERAL_MS = 6500;
const MAX_EXPANDED = 12;

// One calm recipe for every chip: a soft, even, frosted backing — enough to
// read cleanly over any frame without harsh outlines or text shadows.
const CHIP_FILL = 'rgba(32,34,42,0.52)';
const CHIP_BLUR = 'blur(12px)';
const CHIP_RADIUS = 16;

// Same set the server accepts (handlers/reactions.ts) and the regular chat uses.
const REACTIONS = ['❤️', '😂', '😮', '🔥', '👏', '🎉', '🥲', '👀'] as const;

function genNonce(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface FullscreenChatOverlayProps {
  /** True while the player controls are visible (mouse active / paused). */
  expanded: boolean;
  send: (msg: C2S) => boolean;
  /** Reports the chat input's focus so the player can pin its controls open. */
  onInputFocusChange: (focused: boolean) => void;
}

/**
 * Chat layer drawn on top of the video while the player is in fullscreen, so a
 * desktop watcher keeps full access to the chat — reading, sending messages and
 * sending reactions — without leaving fullscreen. The regular chat is untouched
 * and still owns everything outside fullscreen.
 *
 * Two cross-faded layers share the same bottom-right anchor:
 *  - panel — recent history, a reaction row and a send input, shown while the
 *    controls are up;
 *  - ephemeral — only just-arrived messages, shown while the player is idle so
 *    new chat is still noticed without the controls being up.
 */
export function FullscreenChatOverlay({
  expanded,
  send,
  onInputFocusChange,
}: FullscreenChatOverlayProps) {
  const messages = useRoomStore((s) => s.messages);
  const [ephemeralIds, setEphemeralIds] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const seenRef = useRef<Set<string> | null>(null);
  const timersRef = useRef<number[]>([]);

  // Seed "seen" with the history already on screen when the overlay mounts
  // (i.e. when fullscreen opens) so existing messages don't replay as new.
  if (seenRef.current === null) {
    seenRef.current = new Set(messages.map((m) => m.id));
  }

  useEffect(() => {
    const seen = seenRef.current!;
    const fresh = messages.filter((m) => !seen.has(m.id));
    if (fresh.length === 0) return;
    for (const m of fresh) seen.add(m.id);
    setEphemeralIds((cur) => [...cur, ...fresh.map((m) => m.id)]);
    for (const m of fresh) {
      const timer = window.setTimeout(() => {
        setEphemeralIds((cur) => cur.filter((id) => id !== m.id));
      }, EPHEMERAL_MS);
      timersRef.current.push(timer);
    }
  }, [messages]);

  useEffect(
    () => () => {
      for (const t of timersRef.current) window.clearTimeout(t);
    },
    [],
  );

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    send({ t: 'chat_message', body, clientTs: Date.now(), nonce: genNonce() });
    setDraft('');
  };

  const panel = messages.slice(-MAX_EXPANDED);
  const ephemeral = messages.filter((m) => ephemeralIds.includes(m.id));

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 84,
        width: 'clamp(248px, 24vw, 360px)',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    >
      {/* Panel — history, reactions and send input. Shown while controls are up. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '18px 16px',
          opacity: expanded ? 1 : 0,
          transition: 'opacity 220ms ease',
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: 8,
            overflow: 'hidden',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 48px)',
            maskImage: 'linear-gradient(to bottom, transparent, #000 48px)',
          }}
        >
          {panel.map((m) => (
            <ChatLine key={m.id} message={m} ephemeral={false} />
          ))}
        </div>

        <div
          style={{
            marginTop: 12,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: expanded ? 'auto' : 'none',
          }}
        >
          {/* Reaction row — same emoji set as the regular chat. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 38,
              padding: '0 6px',
              borderRadius: CHIP_RADIUS,
              background: CHIP_FILL,
              backdropFilter: CHIP_BLUR,
              WebkitBackdropFilter: CHIP_BLUR,
            }}
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => send({ t: 'reaction', emoji, clientTs: Date.now() })}
                aria-label={`Реакция ${emoji}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: '5px 4px',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>

          <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => onInputFocusChange(true)}
              onBlur={() => onInputFocusChange(false)}
              maxLength={2000}
              placeholder="Сообщение…"
              aria-label="Сообщение в чат"
              style={{
                flex: 1,
                minWidth: 0,
                height: 38,
                padding: '0 15px',
                borderRadius: CHIP_RADIUS,
                background: CHIP_FILL,
                backdropFilter: CHIP_BLUR,
                WebkitBackdropFilter: CHIP_BLUR,
                border: 'none',
                color: '#fff',
                fontSize: 13,
              }}
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Отправить"
              style={{
                flexShrink: 0,
                width: 38,
                height: 38,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: CHIP_FILL,
                backdropFilter: CHIP_BLUR,
                WebkitBackdropFilter: CHIP_BLUR,
                color: 'rgba(255,255,255,0.92)',
              }}
            >
              <Icon name="send" size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* Ephemeral — only just-arrived messages, shown while the player is idle.
          Bottom padding matches the panel's reaction+input area so the newest
          message stays in place across the cross-fade. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '18px 16px 114px',
          overflow: 'hidden',
          opacity: expanded ? 0 : 1,
          transition: 'opacity 160ms ease',
        }}
      >
        {ephemeral.map((m) => (
          <ChatLine key={m.id} message={m} ephemeral />
        ))}
      </div>
    </div>
  );
}

function ChatLine({ message, ephemeral }: { message: ChatMessage; ephemeral: boolean }) {
  const animation = ephemeral
    ? `vellinFsChatPop ${EPHEMERAL_MS}ms ease forwards`
    : 'vellinFsChatIn 220ms ease';

  if (message.kind === 'system') {
    return (
      <div
        style={{
          alignSelf: 'center',
          maxWidth: '100%',
          padding: '4px 12px',
          borderRadius: 999,
          background: CHIP_FILL,
          backdropFilter: CHIP_BLUR,
          WebkitBackdropFilter: CHIP_BLUR,
          color: 'rgba(255,255,255,0.66)',
          fontSize: 11,
          fontStyle: 'italic',
          textAlign: 'center',
          animation,
        }}
      >
        {message.body}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 9,
        alignItems: 'flex-start',
        padding: '8px 12px',
        borderRadius: CHIP_RADIUS,
        background: CHIP_FILL,
        backdropFilter: CHIP_BLUR,
        WebkitBackdropFilter: CHIP_BLUR,
        animation,
      }}
    >
      <Avatar name={message.author.username} seed={message.author.avatarSeed} size={22} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#c4ccff',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 1,
          }}
        >
          {message.author.username}
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.4,
            color: 'rgba(255,255,255,0.95)',
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
