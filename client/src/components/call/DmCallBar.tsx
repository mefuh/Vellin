import { useLayoutEffect } from 'react';
import type { DmCallSnapshot, PublicUser } from '@vellin/shared';
import type { UseCallApi } from '../../hooks/useCall';
import { screenKey } from '../../hooks/useCall';
import { CallAvatar, EndCallButton, IconButton, PulseDot, elapsed, useSecondTick } from './CallBits';

/** Высота полосы свёрнутого звонка. */
const BAR_HEIGHT = 44;

/**
 * Свёрнутый звонок: полоса во всю ширину над сайтом. Перенос `_CallBar` из
 * winapp/lib/widgets/call_overlay.dart.
 *
 * Полоса раздвигает сайт, а не накрывает его, иначе она перекрывала бы шапку
 * раздела: своя высота уходит в `--call-bar`, по которой страницы считают
 * высоту и отступ. Видео при этом не монтируется — дорожки продолжают идти,
 * поэтому разворот мгновенный.
 */
export function DmCallBar({
  api,
  call,
  peer,
  onExpand,
  onHangup,
}: {
  api: UseCallApi;
  call: DmCallSnapshot;
  peer: PublicUser;
  onExpand: () => void;
  onHangup: () => void;
}): React.ReactElement {
  useSecondTick(true);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--call-bar', `calc(${BAR_HEIGHT}px + env(safe-area-inset-top, 0px))`);
    root.dataset.callBar = '';
    return () => {
      root.style.removeProperty('--call-bar');
      delete root.dataset.callBar;
    };
  }, []);

  const sharing = !!api.screenShare;
  // Демонстрация идёт и в свёрнутом звонке — о ней надо помнить.
  const peerSharing =
    call.media[peer.id]?.screen === true && api.remoteStreams.has(screenKey(peer.id));
  const ringing = call.phase === 'ringing';

  return (
    <div className="vc vc-bar" role="region" aria-label={`Звонок с ${peer.username}`}>
      <button
        type="button"
        className="vc-bar-open"
        onClick={onExpand}
        title="Развернуть звонок"
        aria-label={`Развернуть звонок с ${peer.username}`}
      >
        <CallAvatar username={peer.username} avatarUrl={peer.avatarUrl} />
        <span className="vc-bar-name vc-ellipsis">{peer.username}</span>
        <span className="vc-timer">{ringing ? 'Дозвон…' : elapsed(call.answeredAt)}</span>
        {(sharing || peerSharing) && (
          <span className="vc-bar-share">
            <PulseDot period={2000} />
            <span className="vc-pill-text vc-ellipsis">
              {sharing ? 'вы демонстрируете' : 'демонстрация экрана'}
            </span>
          </span>
        )}
      </button>
      <div className="vc-bar-actions">
        {sharing && (
          <IconButton glyph="screen" label="Остановить демонстрацию" onClick={api.stopScreenShare} size={28} bare />
        )}
        <IconButton
          glyph={api.micOn ? 'mic' : 'micOff'}
          label={api.micOn ? 'Выключить микрофон' : 'Включить микрофон'}
          onClick={api.toggleMic}
          size={28}
          bare
        />
        <EndCallButton size="bar" onClick={onHangup} />
      </div>
    </div>
  );
}
