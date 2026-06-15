import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RoomSummary } from '@vellin/shared';
import { roomsApi } from '../api/rooms';
import { Button, Chip, Icon, MountainPoster } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useLibraryStore } from '../stores/libraryStore';
import { CreateRoomModal } from '../components/CreateRoomModal';
import { AppHeader } from '../components/AppHeader';
import { ApiHttpError } from '../api/client';

export function Library() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joinSlug, setJoinSlug] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await roomsApi.list();
      setRooms(data.rooms);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить комнаты');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Пока открыта библиотека — подписаны на live-смену превью/названия комнат.
  const videoOverrides = useLibraryStore((s) => s.overrides);
  useEffect(() => {
    useLibraryStore.getState().watch();
    return () => useLibraryStore.getState().unwatch();
  }, []);

  const join = async (slug: string) => {
    setJoinError(null);
    const trimmed = slug.trim();
    if (!trimmed) return;
    try {
      await roomsApi.get(trimmed); // existence/access check; password prompted inside Room
      navigate(`/room/${trimmed}`);
    } catch (e) {
      setJoinError(e instanceof ApiHttpError ? e.payload.message : 'Комната не найдена');
    }
  };

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)' }}>
      <AppHeader active="library" />

      <main style={{ padding: '32px max(24px, 4vw) 80px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 36, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>
              Библиотека
            </h1>
            <p style={{ marginTop: 6, color: 'var(--text-1)' }}>
              Ваши комнаты и публичные комнаты сообщества.
            </p>
          </div>
          {user?.kind === 'user' && (
            <Button variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
              Новая комната
            </Button>
          )}
        </section>

        <section
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--r-lg)',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Icon name="link" size={16} style={{ color: 'var(--text-2)' }} />
          <span style={{ color: 'var(--text-1)', fontSize: 14 }}>Перейти по slug:</span>
          {/* input + button stay grouped so the button never wraps away on
              its own line — the pair wraps together as one unit on mobile. */}
          <div style={{ display: 'flex', gap: 8, flex: '1 1 240px', minWidth: 0 }}>
            <input
              value={joinSlug}
              onChange={(e) => setJoinSlug(e.target.value)}
              placeholder="dusk-alps-7f3"
              style={{
                flex: 1,
                minWidth: 0,
                height: 38,
                padding: '0 12px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--line-2)',
                background: 'var(--bg-2)',
                color: 'var(--text-0)',
                fontSize: 14,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void join(joinSlug);
              }}
            />
            <Button variant="secondary" iconRight="arrow" onClick={() => void join(joinSlug)} disabled={!joinSlug.trim()}>
              Войти
            </Button>
          </div>
          {joinError && <span style={{ color: 'var(--accent-hi)', fontSize: 12 }}>{joinError}</span>}
        </section>

        {error && (
          <div
            style={{
              background: 'rgba(209,39,27,0.12)',
              color: 'var(--accent-hi)',
              padding: '12px 16px',
              borderRadius: 'var(--r-md)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
            gap: 16,
          }}
        >
          {loading && Array.from({ length: 4 }).map((_, i) => <RoomCardSkeleton key={i} />)}
          {!loading &&
            rooms.map((room, idx) => {
              // Живой оверрайд (room_video по WS) имеет приоритет над REST-снимком;
              // null-постер в оверрайде = видео сняли → возвращаемся к пейзажу.
              const ov = videoOverrides[room.id];
              const poster = ov ? ov.videoPoster : room.videoPoster;
              const title = ov ? ov.videoTitle : room.videoTitle;
              return (
                <Link key={room.id} to={`/room/${room.slug}`}>
                  <RoomCard room={room} idx={idx} poster={poster} title={title} />
                </Link>
              );
            })}
          {!loading && rooms.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '60px 20px',
                textAlign: 'center',
                color: 'var(--text-2)',
              }}
            >
              Пока нет комнат. Создайте первую.
            </div>
          )}
        </section>
      </main>

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreated={(slug) => navigate(`/room/${slug}`)}
        />
      )}
    </div>
  );
}

function RoomCard({
  room,
  idx,
  poster,
  title,
}: {
  room: RoomSummary;
  idx: number;
  poster: string | null;
  title: string | null;
}) {
  // Постер с внешнего CDN может не загрузиться — тогда откатываемся к пейзажу.
  const [imgFailed, setImgFailed] = useState(false);
  const [hover, setHover] = useState(false);
  useEffect(() => setImgFailed(false), [poster]);
  const showPoster = !!poster && !imgFailed;

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--bg-1)',
        border: `1px solid ${hover ? 'var(--accent)' : 'var(--line-2)'}`,
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        // Без transform: «приподнятость» на ховере передаём только тенью и
        // акцентной рамкой — никакого геометрического смещения, значит нижней
        // плашке физически нечему «отставать».
        boxShadow: hover ? '0 14px 30px rgba(0,0,0,0.4)' : '0 0 0 rgba(0,0,0,0)',
        transition: 'border-color .2s ease, box-shadow .2s ease',
      }}
    >
      <div style={{ aspectRatio: '16 / 9', position: 'relative', overflow: 'hidden', background: 'var(--bg-2)' }}>
        {showPoster ? (
          <img
            src={poster!}
            alt={title ?? room.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <MountainPoster seed={idx} />
        )}

        {/* Мягкая вуаль на ховере — статична (без смещений), даёт «медийность» и
            контраст кнопке play, при этом ничего относительно неё не «едет». */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.16)',
            opacity: hover ? 1 : 0,
            transition: 'opacity .2s ease',
            pointerEvents: 'none',
          }}
        />

        {/* Верхний скрим: воссоздаёт тёмную подложку, под которую рассчитаны
            чипы, — индикаторы остаются читаемыми на любом (в т.ч. светлом) кадре. */}
        <div
          style={{
            position: 'absolute',
            inset: '0 0 auto 0',
            height: '48%',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6, zIndex: 1 }}>
          {room.isPrivate ? (
            <Chip tone="neutral" icon="lock">приватная</Chip>
          ) : (
            <Chip tone="success" icon="globe">публичная</Chip>
          )}
          {room.participantCount > 0 && (
            <Chip tone="live">LIVE · {room.participantCount}</Chip>
          )}
        </div>

        {/* Кнопка play проявляется на ховере — карточка читается как «плитка к просмотру». */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            opacity: hover ? 1 : 0,
            transition: 'opacity .2s ease',
          }}
        >
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.55)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.25)',
              transform: hover ? 'scale(1)' : 'scale(0.8)',
              transition: 'transform .2s ease',
            }}
          >
            <Icon name="play" size={20} style={{ color: '#fff', marginLeft: 2 }} />
          </span>
        </div>

        {title && (
          // Название играющего видео — плашкой с градиентом внизу превью.
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: '26px 12px 10px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0))',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              zIndex: 1,
            }}
          >
            <Icon name="play" size={12} style={{ color: 'var(--accent-hi)', flexShrink: 0 }} />
            <span
              style={{
                color: '#fff',
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}
            >
              {title}
            </span>
          </div>
        )}
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{room.name}</h3>
        <div style={{ color: 'var(--text-2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="user" size={12} /> {room.ownerUsername}
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-3)' }} />
          <Icon name="hash" size={12} /> {room.slug}
        </div>
      </div>
    </article>
  );
}

function RoomCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--r-lg)',
        height: 240,
      }}
    />
  );
}
