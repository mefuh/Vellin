import { useCallback, useEffect, useRef, useState } from 'react';
import type { DmCallSnapshot, PublicUser } from '@vellin/shared';
import { useAuthStore } from '../../stores/authStore';
import { screenKey, type UseCallApi } from '../../hooks/useCall';
import {
  canShareScreen,
  loadScreenOptions,
  resolutionLabel,
  type ScreenSurface,
} from '../../hooks/screenShare';
import {
  CallAvatar,
  CallBackdrop,
  CallButton,
  EndCallButton,
  IconButton,
  PulseDot,
  VideoView,
  elapsed,
  useSecondTick,
} from './CallBits';
import { CallIcon } from './CallGlyph';
import { CallSettingsPanel } from './CallSettingsPanel';
import { ScreenSharePicker, type ScreenSharePick } from './ScreenSharePicker';

/** Состояние связи — им подписана пилюля вверху экрана разговора. */
export type CallNetState = 'connecting' | 'good' | 'weak' | 'lost';

/** Какая трансляция развёрнута, когда демонстрируют оба. */
type Focus = 'none' | 'mine' | 'peer';

/**
 * Экран разговора. Перенос `_CallScreen` из winapp/lib/widgets/call_overlay.dart:
 * те же раскладки кадра, плашки, капсула управления и своё превью.
 *
 * Дозвон и подключение сюда не доходят — их показывает окно вызова, здесь
 * разговор уже идёт.
 */
export function CallScreen({
  api,
  call,
  peer,
  net,
  showMyPreview,
  setShowMyPreview,
  onMinimize,
  onHangup,
  onError,
}: {
  api: UseCallApi;
  call: DmCallSnapshot;
  peer: PublicUser;
  net: CallNetState;
  /** Показывать свою демонстрацию крупно, когда собеседник не демонстрирует. */
  showMyPreview: boolean;
  setShowMyPreview: (v: boolean) => void;
  onMinimize: () => void;
  onHangup: () => void;
  onError: (message: string) => void;
}): React.ReactElement {
  useSecondTick(true);
  const me = useAuthStore((s) => s.user);
  const [focus, setFocus] = useState<Focus>('none');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidePreviewOpen, setSidePreviewOpen] = useState(true);
  // Выбор источника демонстрации: null — закрыт, иначе запуск или настройка.
  const [picker, setPicker] = useState<'start' | 'adjust' | null>(null);

  const share = api.screenShare;
  const sharing = !!share;
  const peerScreenStream = api.remoteStreams.get(screenKey(peer.id)) ?? null;
  const peerStream = api.remoteStreams.get(peer.id) ?? null;
  const peerSharing = call.media[peer.id]?.screen === true && !!peerScreenStream;
  const peerCam = call.media[peer.id]?.video === true && !!peerStream;
  const myCamTrack = api.myStream?.getVideoTracks()[0] ?? null;
  const myCam = !!myCamTrack && myCamTrack.enabled && myCamTrack.readyState === 'live';
  const peerMuted = call.media[peer.id]?.audio === false;
  const mySpeaking = !!me && api.micOn && api.speaking.has(me.id);
  const peerSpeaking = api.speaking.has(peer.id);
  const shareSupported = canShareScreen();

  // Раскладка кадра — теми же правилами, что в приложении. Своя демонстрация
  // крупно, когда собеседник не демонстрирует и превью включено, либо когда
  // демонстрируют оба и развёрнута именно она.
  const myScreenBig =
    sharing && ((!peerSharing && showMyPreview) || (peerSharing && focus === 'mine'));
  const peerScreenBig = peerSharing && (!sharing || focus === 'peer');
  const bothSharing = sharing && peerSharing && focus === 'none';
  // Кадр свободен под собеседника: ни одна демонстрация его не занимает.
  const stageFree = !peerSharing && !myScreenBig;
  const selfPipVisible = !(!peerSharing && !peerCam && !myCam) && !bothSharing;
  const peerCamThumb = peerCam && (myScreenBig || peerScreenBig);

  const myName = me?.username ?? 'Вы';

  // Escape закрывает только верхний слой: окно демонстрации поверх настроек
  // уходит первым, а сам разговор Escape не сворачивает.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (picker) setPicker(null);
      else if (settingsOpen) setSettingsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [picker, settingsOpen]);

  // Фокус — в капсулу управления, когда экран разговора открылся.
  const dockRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    dockRef.current
      ?.querySelector<HTMLButtonElement>('.vc-btn')
      ?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }, []);

  const onPick = useCallback(
    async (pick: ScreenSharePick) => {
      const adjusting = picker === 'adjust';
      setPicker(null);
      setShowMyPreview(pick.showPreview);
      const result = adjusting
        ? await api.updateScreenShare(pick.surface, pick.options)
        : await api.startScreenShare(pick.surface, pick.options);
      if (result === 'failed') {
        onError(adjusting ? 'Не удалось изменить демонстрацию' : 'Не удалось начать демонстрацию экрана');
      } else if (result === 'no-audio') {
        onError('Звук захватить не удалось — демонстрация идёт без него');
      }
    },
    [api, picker, setShowMyPreview, onError],
  );

  const toggleCamera = useCallback(async () => {
    const wasOn = myCam;
    const on = await api.toggleCamera();
    // Включить не вышло — камеру занял кто-то другой или её отключили. Без
    // сообщения человек жмёт кнопку и не понимает, почему ничего не вышло.
    if (!wasOn && !on) onError('Камера недоступна — возможно, её занял другой сеанс');
  }, [api, myCam, onError]);

  const stopShare = useCallback(() => {
    api.stopScreenShare();
    setShowMyPreview(false);
    setFocus('none');
  }, [api, setShowMyPreview]);

  const quality = share ? `${resolutionLabel(share.options.resolution)} · ${share.options.fps} FPS` : '';
  const shareTitle = share
    ? share.surface === 'monitor'
      ? 'экран'
      : share.surface === 'window'
        ? share.label
          ? `окно «${share.label}»`
          : 'окно'
        : share.label
          ? `вкладку «${share.label}»`
          : 'вкладку'
    : '';

  return (
    <>
      <CallBackdrop />

      <div className="vc-frame">
        {bothSharing && peerScreenStream && share ? (
          <div className="vc-split">
            <div className="vc-split-cell">
              <button
                type="button"
                className="vc-split-tile"
                data-accent
                onClick={() => setFocus('peer')}
                aria-label={`Развернуть экран: ${peer.username}`}
              >
                <VideoView stream={peerScreenStream} contain label={`Экран: ${peer.username}`} />
                <span className="vc-split-label">
                  <PulseDot period={2000} />
                  <span className="vc-pill-text">Экран: {peer.username}</span>
                </span>
              </button>
            </div>
            <div className="vc-split-cell">
              <button
                type="button"
                className="vc-split-tile"
                onClick={() => setFocus('mine')}
                aria-label="Развернуть ваш экран"
              >
                <VideoView stream={share.stream} contain label="Ваш экран" />
                <span className="vc-split-label">
                  <PulseDot period={2000} />
                  <span className="vc-pill-text">Ваш экран</span>
                </span>
              </button>
            </div>
            <div className="vc-glass-pill vc-split-hint">
              <span className="vc-plaque">Две трансляции · нажмите на любую, чтобы развернуть</span>
            </div>
          </div>
        ) : peerScreenBig && peerScreenStream ? (
          <div className="vc-screen-stage">
            <VideoView stream={peerScreenStream} contain label={`Экран: ${peer.username}`} />
          </div>
        ) : myScreenBig && share ? (
          <div className="vc-screen-stage" data-own>
            <VideoView stream={share.stream} contain label="Ваш экран" />
          </div>
        ) : stageFree && peerCam && peerStream ? (
          <VideoView stream={peerStream} label={peer.username} />
        ) : stageFree && !peerCam && myCam ? (
          <div className="vc-center">
            <CallAvatar username={peer.username} avatarUrl={peer.avatarUrl} size={132} speaking={peerSpeaking} />
          </div>
        ) : (
          <div className="vc-center">
            <div className="vc-duo">
              <Person
                name={peer.username}
                initialFrom={peer.username}
                avatarUrl={peer.avatarUrl ?? null}
                speaking={peerSpeaking}
                muted={peerMuted}
              />
              {/* Подписано «Вы», но лицо и буква — свои: подпись объясняет, кто
                  это, а не заменяет человека. */}
              <Person
                name="Вы"
                initialFrom={myName}
                avatarUrl={me?.avatarUrl ?? null}
                speaking={mySpeaking}
                muted={!api.micOn}
                dim
              />
            </div>
          </div>
        )}

        <div className="vc-shade" aria-hidden />

        {/* Имя собеседника внизу слева — только когда кадр занят им. */}
        {stageFree && (peerCam || myCam) && (
          <div className="vc-peer-label">
            <span className="vc-panel-title vc-ellipsis">{peer.username}</span>
            {peerMuted && <MutedChip />}
          </div>
        )}

        {/* Плашки поверх кадра. */}
        {peerScreenBig && (
          <div className="vc-glass-pill vc-plaque-pill" data-pos="right">
            <PulseDot period={2000} />
            <span className="vc-plaque vc-plaque-long">{peer.username} демонстрирует экран</span>
            {/* На узком экране — коротко, чтобы глагол не обрезался. */}
            <span className="vc-plaque vc-plaque-short" aria-hidden>
              Экран: {peer.username}
            </span>
          </div>
        )}

        {share && (
          <MyShareBadge
            title={shareTitle}
            quality={quality}
            previewShown={showMyPreview || peerSharing}
            onAdjust={shareSupported ? () => setPicker('adjust') : undefined}
            onTogglePreview={peerSharing ? undefined : () => setShowMyPreview(!showMyPreview)}
          />
        )}

        {myScreenBig && !peerSharing && (
          <button
            type="button"
            className="vc-glass-pill vc-plaque-pill vc-preview-pill"
            data-pos="right"
            onClick={() => setShowMyPreview(false)}
          >
            <CallIcon name="eyeOff" size={13} />
            <span className="vc-plaque">Так это видит {peer.username} · скрыть</span>
          </button>
        )}

        {/* Вернуться к двум трансляциям. */}
        {sharing && peerSharing && focus !== 'none' && (
          <button type="button" className="vc-glass-pill vc-both-pill" onClick={() => setFocus('none')}>
            <CallIcon name="split" size={12} />
            <span className="vc-plaque">Показать обе трансляции</span>
          </button>
        )}

        {/* Вторая трансляция карточкой слева, когда одна развёрнута. */}
        {sharing && peerSharing && focus !== 'none' && share && peerScreenStream && (
          <SidePreview
            open={sidePreviewOpen}
            title={focus === 'peer' ? 'Ваша трансляция' : `Экран: ${peer.username}`}
            stream={focus === 'peer' ? share.stream : peerScreenStream}
            onToggle={() => setSidePreviewOpen(!sidePreviewOpen)}
            onExpand={focus === 'peer' ? undefined : () => setFocus('peer')}
          />
        )}

        {/* Камера собеседника отдельным превью, когда кадр занят экраном. */}
        {peerCamThumb && peerStream && (
          <div className="vc-tile vc-peer-cam" data-speaking={peerSpeaking || undefined}>
            <VideoView stream={peerStream} label={peer.username} />
            {peerSpeaking && <span className="vc-speaking-frame" aria-hidden />}
            <span className="vc-tile-label">
              <span className="vc-ellipsis">{peer.username}</span>
            </span>
          </div>
        )}

        {/* Своё превью: уезжает влево, когда открыта панель настроек. */}
        <div
          className="vc-tile vc-self"
          data-hidden={selfPipVisible ? undefined : ''}
          data-shift={selfPipVisible && settingsOpen ? '' : undefined}
          data-speaking={mySpeaking || undefined}
          aria-hidden={!selfPipVisible}
        >
          {myCam && api.myStream ? (
            <VideoView stream={api.myStream} mirror label="Ваша камера" />
          ) : (
            <div className="vc-self-empty">
              <CallAvatar username={myName} avatarUrl={me?.avatarUrl ?? null} dim />
            </div>
          )}
          {mySpeaking && <span className="vc-speaking-frame" aria-hidden />}
          <span className="vc-tile-label">
            Вы
            {!api.micOn && <CallIcon name="micMutedSmall" size={11} />}
          </span>
        </div>
      </div>

      {/* Пилюля состояния связи и таймер; «свернуть» слева. */}
      <div className="vc-top">
        <span className="vc-minimize">
          <IconButton glyph="minus" label="Свернуть звонок" onClick={onMinimize} />
        </span>
        <StatusPill net={net} time={elapsed(call.answeredAt)} />
      </div>

      {/* Капсула управления. */}
      <div className="vc-dock" ref={dockRef}>
        <div className="vc-capsule" role="toolbar" aria-label="Управление звонком">
          <CallButton
            glyph={api.micOn ? 'mic' : 'micOff'}
            label={api.micOn ? 'Выключить микрофон' : 'Включить микрофон'}
            tone={api.micOn ? 'plain' : 'off'}
            speaking={mySpeaking}
            onClick={api.toggleMic}
          />
          <CallButton
            glyph={myCam ? 'camera' : 'cameraOff'}
            label={myCam ? 'Выключить камеру' : 'Включить камеру'}
            tone={myCam ? 'plain' : 'off'}
            onClick={() => void toggleCamera()}
          />
          {/* Демонстрацию браузеры на телефонах не умеют — там кнопки нет. */}
          {shareSupported && (
            <CallButton
              glyph="screen"
              label={sharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
              tone={sharing ? 'gold' : 'plain'}
              pressed={sharing}
              onClick={() => (sharing ? stopShare() : setPicker('start'))}
            />
          )}
          <CallButton
            glyph="gear"
            label="Настройки звонка"
            tone={settingsOpen ? 'active' : 'plain'}
            pressed={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          />
        </div>
        <EndCallButton onClick={onHangup} />
      </div>

      {settingsOpen && (
        <CallSettingsPanel
          peerId={peer.id}
          peerName={peer.username}
          onClose={() => setSettingsOpen(false)}
          onSwitchMic={(id) => {
            if (id) void api.switchMic(id);
          }}
          micCheck={{ start: api.startMicCheck, stop: api.stopMicCheck }}
          onSwitchCamera={(id) => {
            if (id) void api.switchCamera(id);
          }}
        />
      )}

      {picker && (
        <ScreenSharePicker
          peerName={peer.username}
          adjusting={picker === 'adjust'}
          initialSurface={(share?.surface ?? 'monitor') as ScreenSurface}
          initialOptions={share?.options ?? loadScreenOptions()}
          showPreview={showMyPreview}
          onCancel={() => setPicker(null)}
          onPick={(pick) => void onPick(pick)}
        />
      )}
    </>
  );
}

/** Прощальный кадр: тот же фон разговора и короткая надпись. */
export function EndedCurtain({ peerName }: { peerName: string | null }): React.ReactElement {
  return (
    <>
      <CallBackdrop />
      <div className="vc-curtain" role="status">
        <div>
          <span className="vc-section">Звонок завершён</span>
          {peerName && <span className="vc-display-name">{peerName}</span>}
        </div>
      </div>
    </>
  );
}

/** Голосовой звонок: колонка с аватаром и именем. */
function Person({
  name,
  initialFrom,
  avatarUrl,
  speaking,
  muted,
  dim = false,
}: {
  name: string;
  initialFrom: string;
  avatarUrl: string | null;
  speaking: boolean;
  muted: boolean;
  dim?: boolean;
}) {
  return (
    <div className="vc-person" data-dim={dim || undefined}>
      <CallAvatar username={initialFrom} avatarUrl={avatarUrl} speaking={speaking} dim={dim} />
      <span className="vc-person-name">{name}</span>
      {muted && <span className="vc-pill-text vc-person-muted">Микрофон выключен</span>}
    </div>
  );
}

/** Пилюля состояния связи с таймером. */
function StatusPill({ net, time }: { net: CallNetState; time: string }) {
  const [color, period, text] =
    net === 'connecting'
      ? ['#c9a45c', 1200, 'Подключение…']
      : net === 'good'
        ? ['#d8cbb4', 3400, 'Соединение стабильно']
        : net === 'weak'
          ? ['#c9a45c', 1500, 'Нестабильная сеть']
          : ['#d65c52', 1000, 'Переподключение…'];
  return (
    <div className="vc-glass-pill vc-status-pill" role="status">
      <PulseDot key={text} color={color} period={period} />
      <span className="vc-pill-text">{text}</span>
      <span className="vc-status-sep" aria-hidden />
      <span className="vc-timer" aria-label={`Длительность ${time}`}>
        {time}
      </span>
    </div>
  );
}

/** Метка «микрофон выключен» рядом с именем. */
function MutedChip() {
  return (
    <span className="vc-muted-chip">
      <CallIcon name="micMutedSmall" size={11} />
      <span className="vc-row-hint">Микрофон выключен</span>
    </span>
  );
}

/**
 * Плашка «вы демонстрируете»: что уходит собеседнику и с каким качеством.
 * Нажатие открывает настройку идущей демонстрации — она меняется без
 * перезапуска, и у собеседника картинка не мигает.
 */
function MyShareBadge({
  title,
  quality,
  previewShown,
  onAdjust,
  onTogglePreview,
}: {
  title: string;
  quality: string;
  previewShown: boolean;
  onAdjust?: () => void;
  onTogglePreview?: () => void;
}) {
  return (
    <div className="vc-glass-pill vc-share-badge" data-toggle={onTogglePreview ? '' : undefined}>
      <button
        type="button"
        className="vc-share-badge-main"
        onClick={onAdjust}
        disabled={!onAdjust}
        title={onAdjust ? 'Настроить демонстрацию' : undefined}
      >
        <PulseDot period={2000} />
        <span className="vc-pill-text vc-ellipsis vc-share-badge-title">Вы демонстрируете {title}</span>
        <span className="vc-plaque">{quality}</span>
      </button>
      {onTogglePreview && (
        <button type="button" className="vc-tiny-pill" onClick={onTogglePreview}>
          {previewShown ? 'Скрыть' : 'Показать мне'}
        </button>
      )}
    </div>
  );
}

/**
 * Карточка второй трансляции слева. Сворачивается в пилюлю «Превью
 * трансляции».
 */
function SidePreview({
  open,
  title,
  stream,
  onToggle,
  onExpand,
}: {
  open: boolean;
  title: string;
  stream: MediaStream;
  onToggle: () => void;
  /** Развернуть эту трансляцию на весь кадр (только для чужой). */
  onExpand?: () => void;
}) {
  if (!open) {
    return (
      <button type="button" className="vc-glass-pill vc-side-pill" onClick={onToggle}>
        <CallIcon name="monitor" size={13} />
        <span className="vc-pill-text">Превью трансляции</span>
      </button>
    );
  }
  return (
    <div className="vc-side" data-accent={onExpand ? '' : undefined}>
      <div className="vc-side-head">
        <span className="vc-plaque vc-ellipsis">{title}</span>
        {onExpand ? (
          <button type="button" className="vc-side-expand" onClick={onExpand}>
            развернуть
          </button>
        ) : (
          <IconButton glyph="minus" label="Свернуть превью" onClick={onToggle} size={22} bare />
        )}
      </div>
      <div className="vc-side-video">
        <VideoView stream={stream} contain label={title} />
      </div>
    </div>
  );
}
