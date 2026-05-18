import { useEffect, useMemo, useRef, useState } from 'react';
import type { C2S, ResolvedMedia, VideoState } from '@vellin/shared';
import { Icon, Chip, MountainPoster } from '../../shared';
import { VideoController } from './VideoController';
import type { WSClient } from '../../ws/WSClient';
import { createEngine, kindLabel } from './engines/EngineRegistry';
import type { EngineError, PlayerEngine } from './engines/PlayerEngine';
import { WebTorrentEngine, type TorrentStats } from './engines/WebTorrentEngine';
import { roomsApi } from '../../api/rooms';
import { useRoomStore } from '../../stores/roomStore';

interface VideoPlayerProps {
  video: VideoState | null;
  canPlayPause: boolean;
  canSeek: boolean;
  canSetVideoUrl: boolean;
  canManagePlaylist: boolean;
  /** First item in the upcoming queue (if any). Powers the next-button. */
  nextInQueueId: string | null;
  /** Whether history has at least one entry. Powers the prev-button. */
  hasPrev: boolean;
  /** True when this client should report video_ended to the server. */
  isPlaylistLeader: boolean;
  send: (msg: C2S) => boolean;
  client: WSClient | null;
  onRequestUrl: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function VideoPlayer({
  video,
  canPlayPause,
  canSeek,
  canSetVideoUrl,
  canManagePlaylist,
  nextInQueueId,
  hasPrev,
  isPlaylistLeader,
  send,
  client,
  onRequestUrl,
}: VideoPlayerProps) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<PlayerEngine | null>(null);

  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  // True when the engine had to fall back to muted autoplay (browser autoplay
  // policy on first visit). Shows a small "unmute" pill until the user clicks.
  const [autoplayMuted, setAutoplayMuted] = useState(false);
  const [engineError, setEngineError] = useState<EngineError | null>(null);
  const [ready, setReady] = useState(false);
  // Quality settings are LOCAL per user — never sent to server.
  const [qualityLevels, setQualityLevels] = useState<string[]>([]);
  const [currentQuality, setCurrentQuality] = useState<string>('auto');
  const [qualityOpen, setQualityOpen] = useState(false);

  // Auto-hide UI: visible after mouse moves, hidden after inactivity.
  // Held visible while paused or while the quality menu is open.
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const isPaused = video?.status !== 'playing';
  const keepControlsOpen = isPaused || qualityOpen;
  const keepOpenRef = useRef(keepControlsOpen);
  keepOpenRef.current = keepControlsOpen;

  // The server resolves every set_url into a ResolvedMedia (kind + mediaUrl +
  // metadata). We trust that — clients no longer sniff URLs. When it's null
  // (e.g. legacy room snapshot before the resolver landed), we render the
  // "no video" placeholder.
  const resolved: ResolvedMedia | null = video?.resolved ?? null;
  const [torrentStats, setTorrentStats] = useState<TorrentStats | null>(null);
  const updateVideo = useRoomStore((s) => s.updateVideo);

  // Stable refs so controller (created ONCE) reads up-to-date props without rebuild.
  const canPlayPauseRef = useRef(canPlayPause);
  const canSeekRef = useRef(canSeek);
  const isLeaderRef = useRef(isPlaylistLeader);
  const videoUrlRef = useRef<string | null>(video?.url ?? null);
  const clientRef = useRef(client);
  const sendRef = useRef(send);
  canPlayPauseRef.current = canPlayPause;
  canSeekRef.current = canSeek;
  isLeaderRef.current = isPlaylistLeader;
  videoUrlRef.current = video?.url ?? null;
  clientRef.current = client;
  sendRef.current = send;

  const controller = useMemo(
    () =>
      new VideoController({
        getClockOffsetMs: () => clientRef.current?.getClockOffsetMs() ?? 0,
        onLocalIntent: (intent) => {
          const allowed =
            intent.kind === 'seek' ? canSeekRef.current : canPlayPauseRef.current;
          if (!allowed) return;
          const s = sendRef.current;
          if (intent.kind === 'play') {
            s({ t: 'video_play', positionSec: intent.positionSec, clientTs: Date.now() });
          } else if (intent.kind === 'pause') {
            s({ t: 'video_pause', positionSec: intent.positionSec, clientTs: Date.now() });
          } else {
            s({
              t: 'video_seek',
              positionSec: intent.positionSec,
              playing: intent.playing,
              clientTs: Date.now(),
            });
          }
        },
      }),
    [],
  );

  // Create/swap engine when the resolved media changes.
  useEffect(() => {
    if (!resolved) {
      engineRef.current?.destroy();
      engineRef.current = null;
      controller.detach();
      setReady(false);
      return;
    }
    setEngineError(null);
    setReady(false);

    const videoEl = videoElRef.current;
    if (!videoEl) return;
    let engine: PlayerEngine;
    try {
      engine = createEngine(resolved, videoEl);
    } catch (e) {
      setEngineError({
        kind: 'unsupported',
        message: (e as Error).message ?? 'Источник не поддерживается',
      });
      return;
    }
    engineRef.current = engine;

    const offErr = engine.on('error', (e) => setEngineError(e as EngineError));
    const offReady = engine.on('ready', () => setReady(true));
    const offMutedAutoplay = engine.on('autoplay_muted', () => {
      // Engine forced mute to bypass the browser's autoplay block. Reflect it
      // in the UI controls and surface the unmute pill — but don't block input.
      setMuted(true);
      setAutoplayMuted(true);
    });
    const offTime = engine.on('timeupdate', (t) => {
      const tn = typeof t === 'number' ? t : 0;
      setProgress(tn);
      const d = engine.getDuration();
      if (d && d !== duration) setDuration(d);
    });
    const offQualityLevels = engine.on('qualitylevels', (levels) => {
      setQualityLevels(levels as string[]);
      setCurrentQuality(engine.getCurrentQuality());
    });
    const offQualityChange = engine.on('qualitychange', (q) => {
      setCurrentQuality(typeof q === 'string' ? q : 'auto');
    });
    const offEnded = engine.on('ended', () => {
      const url = videoUrlRef.current;
      if (!url || !isLeaderRef.current) return;
      sendRef.current({ t: 'video_ended', currentUrl: url, clientTs: Date.now() });
    });

    controller.reset();
    controller.attach(engine);

    void engine
      .load(resolved.mediaUrl)
      .then(() => {
        if (video) controller.applyInitial(video);
      })
      .catch(() => {
        /* error already emitted via engine.on('error') */
      });

    return () => {
      offErr();
      offReady();
      offMutedAutoplay();
      offTime();
      offQualityLevels();
      offQualityChange();
      offEnded();
      setQualityLevels([]);
      setCurrentQuality('auto');
      setQualityOpen(false);
      setTorrentStats(null);
      setAutoplayMuted(false);
      controller.detach();
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved?.kind, resolved?.mediaUrl, controller]);

  // Torrent stats poller (1 Hz). Engine-specific — only runs when active.
  useEffect(() => {
    if (resolved?.kind !== 'torrent') return;
    const id = window.setInterval(() => {
      const eng = engineRef.current;
      if (eng instanceof WebTorrentEngine) {
        setTorrentStats(eng.getStats());
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [resolved?.kind]);

  // Background refresh when the resolved media is about to expire. Provider
  // stream URLs (yt-dlp signed links) typically live a few hours; we refresh
  // 60s before expiry so playback never pauses to re-resolve.
  useEffect(() => {
    if (!resolved || !video?.url) return;
    if (resolved.expiresAt === 0) return;
    const msUntilRefresh = resolved.expiresAt - Date.now() - 60_000;
    if (msUntilRefresh < 0) return;
    const id = window.setTimeout(() => {
      void roomsApi
        .resolve({ url: video.url! })
        .then((fresh) => {
          updateVideo((v) => (v ? { ...v, resolved: fresh } : v));
        })
        .catch(() => {
          /* let the user retry on next interaction */
        });
    }, msUntilRefresh);
    return () => window.clearTimeout(id);
  }, [resolved?.expiresAt, video?.url, updateVideo]);

  // Apply remote state updates whenever video state advances.
  useEffect(() => {
    if (!video || !engineRef.current || !ready) return;
    controller.applyEvent({
      t: 'video_apply',
      action: 'seek',
      positionSec: video.positionSec,
      anchorServerTs: video.anchorServerTs,
      emittedServerTs: Date.now(),
      status: video.status,
      seq: video.lastEventSeq,
      byUserId: video.hostUserId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.lastEventSeq, ready]);

  // Volume side effects (only after engine is ready — YT methods raise before onReady).
  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setVolume(volume, muted);
    // Clear the "muted by autoplay" pill as soon as the user unmutes through
    // the regular controls. The pill is only meant for the autoplay edge case.
    if (!muted && autoplayMuted) setAutoplayMuted(false);
  }, [volume, muted, ready, autoplayMuted]);

  // Auto-hide reconciler: every time the "keep open" condition flips, either
  // pin controls (paused / quality menu open) or arm the inactivity timer.
  useEffect(() => {
    if (keepControlsOpen) {
      setControlsVisible(true);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      return;
    }
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2500);
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [keepControlsOpen]);

  const revealControls = (): void => {
    setControlsVisible(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (keepOpenRef.current) return;
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2500);
  };

  const handleMouseLeavePlayer = (): void => {
    if (keepOpenRef.current) return;
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setControlsVisible(false);
  };

  const togglePlay = (): void => {
    const eng = engineRef.current;
    if (!eng || !canPlayPause) return;
    if (eng.isPaused()) void eng.play().catch(() => undefined);
    else eng.pause();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!canSeek || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * duration;
    engineRef.current?.seek(target);
    send({
      t: 'video_seek',
      positionSec: target,
      playing: !engineRef.current?.isPaused(),
      clientTs: Date.now(),
    });
  };

  const toggleFullscreen = (): void => {
    const wrapper = videoElRef.current?.parentElement;
    if (!wrapper) return;
    if (!document.fullscreenElement) void wrapper.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  if (!resolved || !video?.url) {
    return (
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          background: 'var(--bg-2)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
          border: '1px solid var(--line-2)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <MountainPoster seed={2} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'rgba(0,0,0,0.5)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 22, color: '#fff' }}>Видео ещё не выбрано</h2>
          {canSetVideoUrl ? (
            <button
              onClick={onRequestUrl}
              style={{
                padding: '10px 18px',
                borderRadius: 999,
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              Вставить ссылку
            </button>
          ) : (
            <p style={{ color: 'rgba(255,255,255,0.7)' }}>Ждём хоста…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseMove={revealControls}
      onMouseEnter={revealControls}
      onMouseLeave={handleMouseLeavePlayer}
      style={{
        position: 'relative',
        aspectRatio: '16 / 9',
        background: '#000',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        border: '1px solid var(--line-2)',
        cursor: controlsVisible ? 'default' : 'none',
      }}
    >
      {/* Native <video> mount — used by every active engine
          (direct / hls / dash / torrent). No iframe path remains. */}
      <video
        ref={videoElRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#000',
          cursor: controlsVisible ? 'default' : 'none',
        }}
        playsInline
      />

      {engineError && engineError.kind !== 'autoplay_blocked' && (
        <ErrorOverlay
          error={engineError}
          sourceLabel={kindLabel(resolved.kind)}
          canChangeUrl={canSetVideoUrl}
          onChangeUrl={onRequestUrl}
        />
      )}
      {/* Autoplay rescue: muted fallback didn't even work, so we ask for one
          click. A big centered Play overlay that does NOT block the rest of the
          UI (controls remain reachable). Clicking dismisses the overlay and
          triggers togglePlay, which now counts as a user gesture. */}
      {engineError?.kind === 'autoplay_blocked' && (
        <button
          onClick={() => {
            setEngineError(null);
            togglePlay();
          }}
          aria-label="Play"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            color: '#fff',
            cursor: 'pointer',
            gap: 10,
            fontSize: 16,
          }}
        >
          <span
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            }}
          >
            <Icon name="play" size={28} />
          </span>
        </button>
      )}
      {/* Soft pill shown when the engine had to fall back to muted autoplay.
          Single click restores sound. Non-blocking — the user can ignore it. */}
      {autoplayMuted && !engineError && (
        <button
          onClick={() => {
            setMuted(false);
            setAutoplayMuted(false);
          }}
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            zIndex: 3,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 999,
            background: 'rgba(20,20,24,0.85)',
            color: '#fff',
            fontSize: 13,
            cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.14)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Icon name="volumeOff" size={16} />
          Звук выключен — нажмите для включения
        </button>
      )}

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '14px 18px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 2,
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? 'auto' : 'none',
          transition: 'opacity 180ms ease',
        }}
      >
        <div
          onClick={handleSeek}
          style={{
            position: 'relative',
            height: 6,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.18)',
            cursor: canSeek && duration > 0 ? 'pointer' : 'default',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${duration ? (progress / duration) * 100 : 0}%`,
              background: 'var(--accent)',
              borderRadius: 3,
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#fff', fontSize: 13, flexWrap: 'wrap' }}>
          {canManagePlaylist && hasPrev && (
            <button
              onClick={() => send({ t: 'playlist_prev', clientTs: Date.now() })}
              title="Предыдущее видео"
              aria-label="Previous video"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 8,
                padding: '4px 8px',
                color: '#fff',
                cursor: 'pointer',
                display: 'inline-flex',
              }}
            >
              <Icon name="prev" size={18} />
            </button>
          )}
          <button onClick={togglePlay} disabled={!canPlayPause} aria-label="Play/Pause">
            <Icon name={video.status === 'playing' ? 'pause' : 'play'} size={20} />
          </button>
          {canManagePlaylist && nextInQueueId && (
            <button
              onClick={() =>
                send({ t: 'playlist_play', itemId: nextInQueueId, clientTs: Date.now() })
              }
              title="Следующее из очереди"
              aria-label="Next in queue"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 8,
                padding: '4px 8px',
                color: '#fff',
                cursor: 'pointer',
                display: 'inline-flex',
              }}
            >
              <Icon name="next" size={18} />
            </button>
          )}
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {formatTime(progress)} / {formatTime(duration)}
          </span>
          <button onClick={() => setMuted((m) => !m)} aria-label="Mute">
            <Icon name={muted || volume === 0 ? 'volumeOff' : 'volume'} size={20} />
          </button>
          <input
            className="hide-on-mobile"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setMuted(false);
              setVolume(parseFloat(e.target.value));
            }}
            style={{ width: 100, accentColor: '#fff' }}
          />
          <div style={{ flex: 1, minWidth: 0 }} />
          <Chip tone="neutral">
            {kindLabel(resolved.kind)}
            {resolved.kind === 'torrent' && torrentStats
              ? ` · ${torrentStats.peers} peers`
              : ''}
          </Chip>
          <Chip tone={video.status === 'playing' ? 'live' : 'neutral'}>
            {video.status === 'playing' ? 'LIVE' : 'PAUSED'}
          </Chip>
          {canSetVideoUrl && (
            <button onClick={onRequestUrl} title="Сменить видео" aria-label="Change video">
              <Icon name="film" size={18} />
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setQualityOpen((o) => !o)}
              title="Качество (только для вас)"
              aria-label="Quality settings"
              aria-expanded={qualityOpen}
            >
              <Icon name="settings" size={20} />
            </button>
            {qualityOpen && (
              <QualityMenu
                levels={qualityLevels}
                current={currentQuality}
                onPick={(level) => {
                  engineRef.current?.setQuality(level);
                  setCurrentQuality(level);
                  setQualityOpen(false);
                }}
                onClose={() => setQualityOpen(false)}
              />
            )}
          </div>
          <button onClick={toggleFullscreen} aria-label="Fullscreen">
            <Icon name="fullscreen" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

const YT_QUALITY_LABEL: Record<string, string> = {
  auto: 'Auto',
  tiny: '144p',
  small: '240p',
  medium: '360p',
  large: '480p',
  hd720: '720p',
  hd1080: '1080p',
  hd1440: '1440p',
  hd2160: '2160p',
  highres: 'High',
};

function QualityMenu({
  levels,
  current,
  onPick,
  onClose,
}: {
  levels: string[];
  current: string;
  onPick: (level: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent): void => {
      if (!ref.current) return;
      if (e.target instanceof Node && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  // Always offer "auto"; merge in YT's reported levels (deduped, preserving order).
  const options = useMemo(() => {
    const merged = ['auto', ...levels.filter((l) => l !== 'auto')];
    return Array.from(new Set(merged));
  }, [levels]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        minWidth: 160,
        padding: 6,
        borderRadius: 'var(--r-md)',
        background: 'rgba(20,20,24,0.96)',
        border: '1px solid var(--line-2)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        zIndex: 4,
        color: '#fff',
        fontSize: 13,
      }}
    >
      <div style={{ padding: '6px 10px 8px', fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
        Только для вас — не влияет на других
      </div>
      {options.length === 1 ? (
        <div style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.6)' }}>
          Авто (источник без вариантов)
        </div>
      ) : (
        options.map((level) => {
          const active = level === current;
          return (
            <button
              key={level}
              role="menuitemradio"
              aria-checked={active}
              onClick={() => onPick(level)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--r-sm)',
                background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: '#fff',
                cursor: 'pointer',
                gap: 12,
              }}
            >
              <span>{YT_QUALITY_LABEL[level] ?? level}</span>
              {active && <Icon name="check" size={14} />}
            </button>
          );
        })
      )}
    </div>
  );
}

function ErrorOverlay({
  error,
  sourceLabel,
  canChangeUrl,
  onChangeUrl,
}: {
  error: EngineError;
  sourceLabel: string;
  canChangeUrl: boolean;
  onChangeUrl: () => void;
}) {
  const advice = useMemo(() => {
    if (error.kind === 'youtube_embedding_disabled') return 'Владелец видео запретил встраивание. Попробуйте другую ссылку.';
    if (error.kind === 'unsupported') return 'Источник не поддерживается этим браузером, либо CORS блокирует поток.';
    if (error.kind === 'load_failed') return 'Не удалось загрузить видео. Проверьте ссылку и доступность ресурса.';
    if (error.kind === 'autoplay_blocked') return 'Браузер заблокировал автозапуск — нажмите Play вручную.';
    return 'Внутренняя ошибка плеера.';
  }, [error]);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 3,
        background: 'rgba(0,0,0,0.75)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 24,
        gap: 12,
      }}
    >
      <div style={{ fontSize: 14, opacity: 0.8 }}>{sourceLabel}</div>
      <h3 style={{ margin: 0, fontSize: 20 }}>{error.message}</h3>
      <p style={{ margin: 0, maxWidth: 460, color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>{advice}</p>
      {canChangeUrl && (
        <button
          onClick={onChangeUrl}
          style={{
            marginTop: 8,
            padding: '10px 18px',
            borderRadius: 999,
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          Сменить ссылку
        </button>
      )}
    </div>
  );
}
