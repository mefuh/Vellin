import { useRef } from 'react';
import { Icon } from '../../shared';
import { useVoicePlayerStore } from '../../stores/voicePlayerStore';
import { useVideoNotePlayerStore } from '../../stores/videoNotePlayerStore';
import type { ClientDm } from '../../stores/dmStore';

/** Длина окружности кольца прогресса (радиус 20). */
const RING_C = 2 * Math.PI * 20;

/**
 * Единый закреплённый мини-плеер «сейчас играет» — для голосовых И видео-
 * «кружков» одним и тем же смонтированным узлом, который лишь переключает
 * источник данных между двумя сторами (voicePlayerStore/videoNotePlayerStore).
 *
 * Раньше это были два отдельных компонента (VoiceNowPlaying/VideoNoteNowPlaying),
 * каждый монтировался/размонтировался по активности СВОЕГО типа. При цепочке
 * авто-next «голосовое → кружок → голосовое» (см. stores/mediaChain.ts) это
 * давало ДВА одновременных unmount+mount с enter/exit-анимацией и форс-рефлоу
 * (`el.offsetHeight`) ровно в момент передачи эстафеты — на телефонах заметный
 * рывок именно на переходе между сообщениями. Один persistent-компонент это
 * убирает: смена типа внутри цепочки лишь подменяет контент уже смонтированного
 * бара, а не пересоздаёт его.
 */
export function NowPlaying({
  messages,
  peerUsername,
  myId,
  topOffset = 0,
}: {
  messages: ClientDm[];
  peerUsername: string;
  myId: string;
  /** Сдвиг сверху (px) — чтобы мини-плеер встал под шапкой-оверлеем. */
  topOffset?: number;
}) {
  const voiceId = useVoicePlayerStore((s) => s.currentId);
  const voicePlaying = useVoicePlayerStore((s) => s.playing);
  const voicePos = useVoicePlayerStore((s) => s.positionSec);
  const voiceDur = useVoicePlayerStore((s) => s.durationSec);
  const voiceRate = useVoicePlayerStore((s) => s.rate);
  const voiceToggleCurrent = useVoicePlayerStore((s) => s.toggleCurrent);
  const voiceCycleRate = useVoicePlayerStore((s) => s.cycleRate);
  const voiceStop = useVoicePlayerStore((s) => s.stop);

  const videoId = useVideoNotePlayerStore((s) => s.currentId);
  const videoPlaying = useVideoNotePlayerStore((s) => s.playing);
  const videoPos = useVideoNotePlayerStore((s) => s.positionSec);
  const videoDur = useVideoNotePlayerStore((s) => s.durationSec);
  const videoRate = useVideoNotePlayerStore((s) => s.rate);
  const videoToggleCurrent = useVideoNotePlayerStore((s) => s.toggleCurrent);
  const videoCycleRate = useVideoNotePlayerStore((s) => s.cycleRate);
  const videoStop = useVideoNotePlayerStore((s) => s.stop);

  // Голосовое и кружок никогда не звучат одновременно (взаимно глушат друг
  // друга при старте), но на случай гонки при передаче эстафеты отдаём
  // приоритет голосовому — обе стороны обнуляются практически синхронно.
  const kind: 'voice' | 'video' | null = voiceId ? 'voice' : videoId ? 'video' : null;
  const currentId = kind === 'voice' ? voiceId : kind === 'video' ? videoId : null;
  const playing = kind === 'voice' ? voicePlaying : kind === 'video' ? videoPlaying : false;
  const posSec = kind === 'voice' ? voicePos : kind === 'video' ? videoPos : 0;
  const durationSec = kind === 'voice' ? voiceDur : kind === 'video' ? videoDur : 0;
  const rate = kind === 'voice' ? voiceRate : kind === 'video' ? videoRate : 1;
  const toggleCurrent = kind === 'voice' ? voiceToggleCurrent : videoToggleCurrent;
  const cycleRate = kind === 'voice' ? voiceCycleRate : videoCycleRate;
  const stop = kind === 'voice' ? voiceStop : videoStop;

  const current = currentId ? messages.find((m) => m.id === currentId) : undefined;
  const active = !!current && !!kind;
  const open = active;

  // Бар смонтирован ВСЕГДА (не только пока активен) — видимость переключается
  // только opacity/transform, без пересоздания DOM на каждый старт воспроизведения.
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lastFrameRef = useRef<{ title: string; mine: boolean; frac: number; subtitle: string }>({
    title: '',
    mine: false,
    frac: 0,
    subtitle: '',
  });

  // Во время выхода (active=false) показываем последний кадр, чтобы не «прыгало».
  const mine = current ? current.senderId === myId || current.senderId === 'me' : lastFrameRef.current.mine;
  const title = current ? (mine ? 'Вы' : peerUsername) : lastFrameRef.current.title;
  const frac = active ? (durationSec > 0 ? Math.min(1, posSec / durationSec) : 0) : lastFrameRef.current.frac;
  const subtitle = active
    ? kind === 'voice'
      ? 'Голосовое сообщение'
      : 'Видеосообщение'
    : lastFrameRef.current.subtitle;
  if (active) lastFrameRef.current = { title, mine, frac, subtitle };

  return (
    <div
      style={{
        position: 'absolute',
        top: topOffset + 8,
        left: 0,
        right: 0,
        padding: '0 12px',
        zIndex: 6,
        pointerEvents: open ? 'auto' : 'none',
        transform: open ? 'translateY(0)' : 'translateY(-10px)',
        opacity: open ? 1 : 0,
        transition: reduceMotion ? 'none' : 'transform .3s cubic-bezier(0.22, 1, 0.36, 1), opacity .26s ease',
      }}
    >
      <div
        className="dm-noselect"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 56,
          padding: '0 8px 0 6px',
          // Полное скругление-пилюля — в тон блоку аватарки/ника в шапке.
          // Сплошная поверхность вместо backdrop-filter: этот бар анимируется
          // при каждом старте/окончании/переходе гс↔кружок, и на iOS блюр
          // стабильно не успевал посчитаться к первому кадру (~1с плоского
          // фона до блюра) — ни разные тайминги появления, ни меньший радиус
          // это не убрали. Проверено (см. историю правок) — без блюра рывка нет.
          borderRadius: 999,
          background: 'var(--bg-4)',
          border: '1px solid var(--line-2)',
          // Карточка теперь смонтирована постоянно (см. комментарий выше про
          // active/open) — пока она невидима (open=false), сама не должна
          // ловить клики/тапы поверх ленты, иначе перехватывала бы их незаметно.
          pointerEvents: open ? 'auto' : 'none',
          boxShadow: 'var(--shadow-2)',
        }}
      >
        {/* Play/pause + кольцо прогресса вокруг него: линия по низу обрезалась бы
            скруглением пилюли, поэтому прогресс — кольцом (как у кружков/голосовых).
            frac обновляется 60 раз/с через rAF, поэтому transition кольцу не нужен. */}
        <span style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
            <circle cx="22" cy="22" r="20" fill="none" stroke="var(--line-2)" strokeWidth="2.5" />
            <circle cx="22" cy="22" r="20" fill="none" stroke="var(--accent-hi)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - frac)} />
          </svg>
          <button
            onClick={toggleCurrent}
            aria-label={playing ? 'Пауза' : 'Воспроизвести'}
            className="dm-press"
            style={{ position: 'absolute', inset: 0, borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--text-0)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          >
            <Icon name={playing ? 'pause' : 'play'} size={19} />
          </button>
        </span>

        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{subtitle}</div>
        </div>

        <button
          onClick={cycleRate}
          aria-label="Скорость воспроизведения"
          className="dm-press"
          style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--text-1)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
        >
          {rate}X
        </button>
        <button
          onClick={stop}
          aria-label="Закрыть плеер"
          className="dm-press"
          style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--text-2)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
