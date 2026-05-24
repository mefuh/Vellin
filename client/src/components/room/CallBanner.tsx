import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from '../../shared';
import { useRoomStore } from '../../stores/roomStore';
import { useCallContext } from '../../hooks/CallContext';

const AUTO_DISMISS_MS = 8000;

/**
 * Soft top-of-room banner that appears when somebody starts a call from the
 * empty state. Auto-dismisses after 8s. Suppressed for the user who's already
 * in the call. Uses a ref to track the previous member count so reconnects
 * (which broadcast a fresh snapshot) don't retrigger the banner.
 */
export function CallBanner() {
  const callMembers = useRoomStore((s) => s.call.members);
  const startedByUserId = useRoomStore((s) => s.call.startedByUserId);
  const participants = useRoomStore((s) => s.participants);
  const you = useRoomStore((s) => s.you);
  const myCallState = useRoomStore((s) => s.myCallState);
  const { join, state: callState } = useCallContext();

  const [visible, setVisible] = useState(false);
  const prevHadCall = useRef(callMembers.length > 0);

  useEffect(() => {
    const hasCall = callMembers.length > 0;
    if (!prevHadCall.current && hasCall && myCallState !== 'in') {
      setVisible(true);
    }
    if (!hasCall) setVisible(false);
    prevHadCall.current = hasCall;
  }, [callMembers.length, myCallState]);

  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [visible]);

  // Hide once the user joins the call.
  useEffect(() => {
    if (myCallState === 'in') setVisible(false);
  }, [myCallState]);

  if (!visible || callMembers.length === 0) return null;

  const starter = participants.find((p) => p.userId === startedByUserId);
  const starterName = starter?.username ?? 'Кто-то';
  const isGuest = you?.kind === 'guest';

  return (
    <div
      style={{
        margin: '8px 16px 0',
        padding: '10px 14px',
        borderRadius: 'var(--r-md)',
        background: 'var(--accent-soft)',
        color: 'var(--text-0)',
        border: '1px solid rgba(209,39,27,0.28)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
      }}
    >
      <Icon name="phone" size={16} style={{ color: 'var(--accent-hi)' }} />
      <span style={{ flex: 1 }}>
        {starterName} начал голосовой звонок · участников: {callMembers.length}
      </span>
      {!isGuest && (
        <Button
          variant="primary"
          size="sm"
          icon="phone"
          disabled={callState === 'connecting'}
          onClick={() => {
            setVisible(false);
            void join({ withVideo: false });
          }}
        >
          {callState === 'connecting' ? 'Подключаемся…' : 'Войти'}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => setVisible(false)}>
        {isGuest ? 'Скрыть' : 'Не сейчас'}
      </Button>
    </div>
  );
}
