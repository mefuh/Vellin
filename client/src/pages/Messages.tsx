import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { DmConversation, PublicUser } from '@vellin/shared';
import { Avatar, Button, Icon } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useDmStore, type ClientDm, type ThreadState } from '../stores/dmStore';
import { usePresenceStore } from '../stores/presenceStore';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { dmApi } from '../api/dm';
import { ApiHttpError } from '../api/client';
import { lastSeenLabel } from '../utils/lastSeen';
import { AppHeader } from '../components/AppHeader';
import { VoicePlayer } from '../components/messages/VoicePlayer';
import { VoiceNowPlaying } from '../components/messages/VoiceNowPlaying';
import { useVoicePlayerStore } from '../stores/voicePlayerStore';
import { useVoiceRecorder, type RecordResult } from '../hooks/useVoiceRecorder';
import { computeVoiceMeta } from '../utils/audioPeaks';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'Сегодня';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function Messages() {
  const { username } = useParams<{ username?: string }>();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const conversations = useDmStore((s) => s.conversations);
  const setConversations = useDmStore((s) => s.setConversations);

  // Открытый чат на мобилке занимает весь экран и подстраивается под клавиатуру.
  const chatOpen = isMobile && !!username;
  const vp = useVisualViewport(chatOpen);

  useEffect(() => {
    let alive = true;
    void dmApi
      .conversations()
      .then((res) => {
        if (alive) setConversations(res.conversations, res.unreadTotal);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [setConversations]);

  // Пока открыт полноэкранный чат — запрещаем прокрутку body (фикс-контейнер
  // не должен «резинить» под собой страницу).
  useEffect(() => {
    if (!chatOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [chatOpen]);

  if (user && user.kind === 'guest') return <Navigate to="/library" replace />;
  if (!user) return <Navigate to="/login" replace />;

  const list = <ConversationList conversations={conversations} activeUsername={username} myId={user.id} />;
  const chat = username ? <ChatPane key={username} username={username} myId={user.id} /> : <EmptyChat />;

  if (isMobile) {
    // Мобайл: либо список, либо открытый чат на весь экран.
    if (username) {
      // Высоту берём из visual viewport — тогда композер «едет» вместе с
      // выезжающей клавиатурой и не прячется за ней. Фоллбэк — 100svh.
      const wrapStyle: CSSProperties = vp
        ? {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: vp.height,
            transform: `translateY(${vp.offsetTop}px)`,
            background: 'var(--bg-0)',
            color: 'var(--text-0)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }
        : {
            minHeight: '100svh',
            background: 'var(--bg-0)',
            color: 'var(--text-0)',
            display: 'flex',
            flexDirection: 'column',
          };
      return <div style={wrapStyle}>{chat}</div>;
    }
    return (
      <div style={{ minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)' }}>
        <AppHeader active="messages" />
        <main style={{ padding: '16px 12px 104px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 style={{ fontSize: 24, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>Сообщения</h1>
          {list}
        </main>
      </div>
    );
  }

  return (
    <div style={{ height: '100svh', overflow: 'hidden', background: 'var(--bg-0)', color: 'var(--text-0)', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="messages" />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          maxWidth: 1120,
          width: '100%',
          margin: '0 auto',
          padding: '20px max(24px, 3vw) 28px',
          display: 'grid',
          gridTemplateColumns: '340px minmax(0, 1fr)',
          gridTemplateRows: 'minmax(0, 1fr)',
          gap: 20,
        }}
      >
        <aside
          style={{
            minHeight: 0,
            background: 'var(--bg-1)',
            border: '1px solid var(--line-1)',
            borderRadius: 'var(--r-lg)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--line-1)' }}>
            <h1 style={{ fontSize: 18, margin: 0, fontWeight: 600 }}>Сообщения</h1>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: 8 }}>{list}</div>
        </aside>
        <section
          style={{
            minHeight: 0,
            background: 'var(--bg-1)',
            border: '1px solid var(--line-1)',
            borderRadius: 'var(--r-lg)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {chat}
        </section>
      </div>
    </div>
  );
}

// ── Список диалогов ───────────────────────────────────────────────────────

function ConversationList({
  conversations,
  activeUsername,
  myId,
}: {
  conversations: DmConversation[];
  activeUsername?: string;
  myId: string;
}) {
  const presence = usePresenceStore((s) => s.byId);
  if (conversations.length === 0) {
    return (
      <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
        Здесь появятся ваши переписки. Откройте профиль друга и нажмите «Написать».
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {conversations.map((c) => {
        const online = presence[c.peer.id]?.online ?? c.online;
        const active = activeUsername === c.peer.username;
        const last = c.lastMessage;
        const previewBody = last
          ? last.hasVoice
            ? '🎤 Голосовое сообщение'
            : last.hasImage
              ? last.body
                ? `📷 ${last.body}`
                : '📷 Фото'
              : last.body
          : '';
        const preview = last && last.senderId === myId ? `Вы: ${previewBody}` : previewBody;
        // Галочки — только если последнее сообщение отправлено мной.
        const mine = !!last && last.senderId === myId;
        const read =
          mine &&
          c.peerLastReadAt != null &&
          new Date(c.peerLastReadAt).getTime() >= new Date(last!.createdAt).getTime();
        return (
          <Link
            key={c.id}
            to={`/messages/${encodeURIComponent(c.peer.username)}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              background: active ? 'var(--bg-3)' : 'transparent',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <Avatar
              name={c.peer.username}
              seed={c.peer.avatarSeed}
              src={c.peer.avatarUrl}
              size={46}
              status={online ? 'online' : 'offline'}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {c.peer.username}
                </span>
                {last && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {mine && <Ticks read={read} color={read ? '#5aa7e6' : 'var(--text-3)'} />}
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtTime(last.createdAt)}</span>
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    color: c.unreadCount > 0 ? 'var(--text-1)' : 'var(--text-3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {preview}
                </span>
                {c.unreadCount > 0 && (
                  <span
                    style={{
                      flexShrink: 0,
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      borderRadius: 9,
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {c.unreadCount > 99 ? '99+' : c.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function EmptyChat() {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)', padding: 24, textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Icon name="chat" size={48} style={{ color: 'var(--line-3, var(--text-3))', opacity: 0.5 }} />
        <span style={{ fontSize: 14 }}>Выберите диалог, чтобы начать переписку</span>
      </div>
    </div>
  );
}

// ── Открытый чат ──────────────────────────────────────────────────────────

function ChatPane({ username, myId }: { username: string; myId: string }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [peerId, setPeerId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const setThread = useDmStore((s) => s.setThread);
  const setActivePeer = useDmStore((s) => s.setActivePeer);
  const markRead = useDmStore((s) => s.markRead);
  const sendMessage = useDmStore((s) => s.send);
  const prependMessages = useDmStore((s) => s.prependMessages);

  const thread = useDmStore((s) => (peerId ? s.threads[peerId] : undefined));
  const typingUntil = useDmStore((s) => (peerId ? s.typing[peerId] : undefined));
  const peerPresence = usePresenceStore((s) => (peerId ? s.byId[peerId] : undefined));
  const watch = usePresenceStore((s) => s.watch);
  const unwatch = usePresenceStore((s) => s.unwatch);

  const scrollRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef<PublicUser | null>(null);
  // «Прилипание» к низу: true, пока пользователь у нижнего края ленты.
  const pinnedRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Раз в 30с форсим ре-рендер, чтобы относительное «был в сети …» дотикивало.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Загрузка треда по username.
  useEffect(() => {
    let alive = true;
    setLoadError(null);
    void dmApi
      .thread(username)
      .then((res) => {
        if (!alive) return;
        peerRef.current = res.peer;
        const t: ThreadState = {
          peer: res.peer,
          conversationId: res.conversationId,
          messages: res.messages,
          hasMore: res.hasMore,
          peerLastReadAt: res.peerLastReadAt,
          online: res.online,
          lastSeenAt: res.peerLastSeenAt,
          gender: res.peerGender,
          eligibility: res.eligibility,
          loading: false,
          loaded: true,
        };
        setThread(res.peer.id, t);
        setPeerId(res.peer.id);
        setActivePeer(res.peer.id);
        usePresenceStore
          .getState()
          .seed(res.peer.id, { online: res.online, currentRoom: null, lastSeenAt: res.peerLastSeenAt });
        watch(res.peer.id);
        markRead(res.peer.id);
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось открыть переписку');
      });
    return () => {
      alive = false;
      setActivePeer(null);
      if (peerRef.current) unwatch(peerRef.current.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // При открытии диалога — всегда к низу.
  useEffect(() => {
    pinnedRef.current = true;
    scrollToBottom();
  }, [peerId, scrollToBottom]);

  // Новое сообщение — докручиваем вниз, только если пользователь был у низа
  // (иначе не дёргаем при чтении истории).
  const msgCount = thread?.messages.length ?? 0;
  useEffect(() => {
    if (pinnedRef.current) scrollToBottom();
  }, [msgCount, scrollToBottom]);

  // Авто-следующее голосовое + отметка «прослушано». Резолвер читает свежий
  // тред из стора (getState), поэтому ставим его один раз на peerId.
  useEffect(() => {
    if (!peerId) return;
    const vp = useVoicePlayerStore.getState();
    const isUnplayedIncoming = (m: ClientDm): boolean =>
      !!m.voiceUrl && m.senderId !== myId && m.senderId !== 'me' && !m.voicePlayed;
    // Авто-проигрывание как плейлист: после текущего — следующее голосовое по
    // порядку, независимо от отправителя (так последовательность ГС играет
    // подряд). Отметку «прослушано» при этом ставим только входящим.
    vp.setNextResolver((currentId) => {
      const t = useDmStore.getState().threads[peerId];
      if (!t) return null;
      const idx = t.messages.findIndex((m) => m.id === currentId);
      if (idx < 0) return null;
      for (let i = idx + 1; i < t.messages.length; i++) {
        const m = t.messages[i];
        if (m.voiceUrl) {
          return { id: m.id, url: m.voiceUrl, durationSec: m.voiceDurationSec ?? 0 };
        }
      }
      return null;
    });
    vp.setOnStart((messageId) => {
      const t = useDmStore.getState().threads[peerId];
      const m = t?.messages.find((x) => x.id === messageId);
      if (m && isUnplayedIncoming(m)) useDmStore.getState().markVoicePlayed(messageId);
    });
    return () => {
      const cur = useVoicePlayerStore.getState();
      cur.setNextResolver(null);
      cur.setOnStart(null);
      cur.stop();
    };
  }, [peerId, myId]);

  // При появлении/скрытии клавиатуры (resize visual viewport) держим ленту у
  // низа, чтобы последнее сообщение не пряталось за поднявшимся композером.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const toBottom = (): void => {
      if (pinnedRef.current) scrollToBottom();
    };
    vv.addEventListener('resize', toBottom);
    return () => vv.removeEventListener('resize', toBottom);
  }, [scrollToBottom]);

  const loadEarlier = async () => {
    if (!thread || !peerId || !thread.messages[0]) return;
    setLoadingMore(true);
    try {
      const res = await dmApi.thread(username, thread.messages[0].createdAt);
      prependMessages(peerId, res.messages, res.hasMore);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  if (loadError) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)', padding: 24 }}>{loadError}</div>
    );
  }
  if (!thread || !peerId) {
    return <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>Загрузка…</div>;
  }

  const peer = thread.peer;
  const online = peerPresence?.online ?? thread.online;
  const isTyping = typingUntil != null && typingUntil > Date.now();
  const room = peerPresence?.currentRoom ?? null;
  const subtitle = isTyping ? (
    <span style={{ color: 'var(--accent-hi)' }}>печатает…</span>
  ) : online ? (
    room ? (
      <span style={{ color: 'var(--accent-hi)' }}>смотрит «{room.name}»</span>
    ) : (
      'в сети'
    )
  ) : (
    lastSeenLabel(peerPresence?.lastSeenAt ?? thread.lastSeenAt, thread.gender)
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Шапка чата */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid var(--line-1)',
          flexShrink: 0,
        }}
      >
        {isMobile && (
          <button
            onClick={() => navigate('/messages')}
            aria-label="Назад"
            style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 'var(--r-md)', border: 'none', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer' }}
          >
            <Icon name="chevron" size={24} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        <Link to={`/u/${encodeURIComponent(peer.username)}`} style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
          <Avatar name={peer.username} seed={peer.avatarSeed} src={peer.avatarUrl} size={40} status={online ? 'online' : 'offline'} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peer.username}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>{subtitle}</div>
          </div>
        </Link>
      </header>

      {/* Лента сообщений + плавающий мини-плеер «сейчас играет» (оверлей, чтобы
          его появление не сдвигало ленту и не вызывало автоскролл к сообщению). */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <VoiceNowPlaying messages={thread.messages} peerUsername={peer.username} myId={myId} />
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px max(12px, 3%)', display: 'flex', flexDirection: 'column', gap: 2 }}
        >
        {thread.hasMore && (
          <div style={{ display: 'grid', placeItems: 'center', paddingBottom: 8 }}>
            <Button size="sm" variant="ghost" disabled={loadingMore} onClick={() => void loadEarlier()}>
              {loadingMore ? 'Загрузка…' : 'Показать раньше'}
            </Button>
          </div>
        )}
        {thread.messages.length === 0 && (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Нет сообщений. Напишите первым!
          </div>
        )}
        <MessageList
          messages={thread.messages}
          myId={myId}
          peerLastReadAt={thread.peerLastReadAt}
          onOpenImage={setLightbox}
          onImageLoad={() => {
            if (pinnedRef.current) scrollToBottom();
          }}
        />
        </div>
      </div>

      {/* Ввод */}
      <Composer
        peer={peer}
        eligibility={thread.eligibility}
        onSend={(body, image, voice) => sendMessage(peer, body, image, voice)}
      />

      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/** Полноэкранный просмотр изображения. */
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        zIndex: 1200,
      }}
    >
      <img
        src={url}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain' }}
      />
      <button
        onClick={onClose}
        aria-label="Закрыть"
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          right: 16,
          display: 'grid',
          placeItems: 'center',
          width: 40,
          height: 40,
          borderRadius: 999,
          border: 'none',
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}

function MessageList({
  messages,
  myId,
  peerLastReadAt,
  onOpenImage,
  onImageLoad,
}: {
  messages: ClientDm[];
  myId: string;
  peerLastReadAt: string | null;
  onOpenImage: (url: string) => void;
  onImageLoad: () => void;
}) {
  const peerReadMs = peerLastReadAt ? new Date(peerLastReadAt).getTime() : 0;
  let lastDay = '';
  return (
    <>
      {messages.map((m) => {
        const mine = m.senderId === myId || m.senderId === 'me';
        const day = dayLabel(m.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;
        const read = mine && peerReadMs >= new Date(m.createdAt).getTime() && !m.pending;
        const status = !mine ? null : m.failed ? (
          <span style={{ color: '#ffd0d0' }} title="Не отправлено">!</span>
        ) : m.pending ? (
          <Ticks read={false} faint />
        ) : (
          <Ticks read={read} />
        );
        return (
          <div key={m.id}>
            {showDay && (
              <div style={{ display: 'grid', placeItems: 'center', margin: '12px 0 8px' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--bg-2)', padding: '3px 10px', borderRadius: 999 }}>
                  {day}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', padding: '2px 0' }}>
              <div
                style={{
                  maxWidth: '74%',
                  padding: m.voiceUrl ? '7px 9px' : m.imageUrl ? 4 : '8px 12px',
                  borderRadius: 16,
                  borderBottomRightRadius: mine ? 4 : 16,
                  borderBottomLeftRadius: mine ? 16 : 4,
                  background: mine ? 'var(--accent)' : 'var(--bg-3)',
                  color: mine ? '#fff' : 'var(--text-0)',
                  opacity: m.pending ? 0.65 : 1,
                  overflow: 'hidden',
                }}
              >
                {m.voiceUrl ? (
                  <VoicePlayer
                    messageId={m.id}
                    url={m.voiceUrl}
                    durationSec={m.voiceDurationSec ?? 0}
                    peaks={m.voicePeaks ?? []}
                    mine={mine}
                    played={!!m.voicePlayed}
                    pending={m.pending}
                    clock={fmtTime(m.createdAt)}
                    statusSlot={status}
                  />
                ) : m.imageUrl ? (
                  <>
                    <img
                      src={m.imageUrl}
                      alt=""
                      loading="lazy"
                      onLoad={onImageLoad}
                      onClick={() => onOpenImage(m.imageUrl!)}
                      style={{
                        display: 'block',
                        maxWidth: 'min(260px, 72vw)',
                        maxHeight: 340,
                        width: 'auto',
                        height: 'auto',
                        borderRadius: 12,
                        cursor: 'pointer',
                      }}
                    />
                    {m.body && (
                      <span style={{ display: 'block', padding: '6px 8px 0', fontSize: 14, lineHeight: 1.42, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {m.body}
                      </span>
                    )}
                    <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, fontSize: 10, color: mine ? 'rgba(255,255,255,0.78)' : 'var(--text-3)', padding: '3px 8px 1px' }}>
                      {fmtTime(m.createdAt)}
                      {status}
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 14, lineHeight: 1.42, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        float: 'right',
                        marginLeft: 10,
                        marginTop: 6,
                        fontSize: 10,
                        color: mine ? 'rgba(255,255,255,0.75)' : 'var(--text-3)',
                        transform: 'translateY(2px)',
                      }}
                    >
                      {fmtTime(m.createdAt)}
                      {status}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Галочки доставки: одна (отправлено) / две (прочитано). */
function Ticks({ read, faint, color }: { read: boolean; faint?: boolean; color?: string }) {
  const stroke = color ?? (faint ? 'rgba(255,255,255,0.5)' : read ? '#bfe3ff' : 'rgba(255,255,255,0.78)');
  const w = read ? 17 : 12;
  return (
    <svg width={w} height="11" viewBox={`0 0 ${w} 11`} fill="none" style={{ display: 'block' }}>
      <path d="M1 5.5L4 8.5L9.5 2" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {read && <path d="M6.5 8.5L12 2" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

interface Attachment {
  url: string;
  width: number;
  height: number;
  /** Локальный objectURL для мгновенного превью. */
  preview: string;
}

/** Минимальная длительность записи, ниже — считаем случайным тапом. */
const MIN_VOICE_MS = 700;
/** На сколько нужно увести палец влево, чтобы отменить запись. */
const CANCEL_SWIPE_PX = 70;
/** На сколько нужно увести палец вверх, чтобы зафиксировать запись (hands-free). */
const LOCK_LIFT_PX = 60;

function Composer({
  peer,
  eligibility,
  onSend,
}: {
  peer: PublicUser;
  eligibility: ThreadState['eligibility'];
  onSend: (
    body: string,
    image?: { url: string; width: number; height: number },
    voice?: { url: string; durationSec: number; peaks: number[] },
  ) => void;
}) {
  const [text, setText] = useState('');
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockProgress, setLockProgress] = useState(0);
  const sendTyping = useDmStore((s) => s.sendTyping);
  const recorder = useVoiceRecorder();
  const isMobile = useIsMobile();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingActiveRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRef = useRef<{ startX: number; startY: number; active: boolean }>({ startX: 0, startY: 0, active: false });
  const cancelArmedRef = useRef(false);
  const lockedRef = useRef(false);

  const armCancel = (v: boolean): void => {
    cancelArmedRef.current = v;
    setCancelArmed(v);
  };

  // Пока идёт запись — глушим выделение текста и callout-меню (иначе долгое
  // удержание кнопки на телефоне выделяет соседний текст / открывает меню).
  useEffect(() => {
    if (!recorder.recording) return;
    const s = document.body.style;
    s.setProperty('user-select', 'none');
    s.setProperty('-webkit-user-select', 'none');
    s.setProperty('-webkit-touch-callout', 'none');
    return () => {
      s.removeProperty('user-select');
      s.removeProperty('-webkit-user-select');
      s.removeProperty('-webkit-touch-callout');
    };
  }, [recorder.recording]);

  // Сброс состояний жеста при завершении записи.
  useEffect(() => {
    if (!recorder.recording) {
      lockedRef.current = false;
      setLocked(false);
      setLockProgress(0);
      armCancel(false);
    }
  }, [recorder.recording]);

  const handleRecorded = async (res: RecordResult): Promise<void> => {
    if (res.durationMs < MIN_VOICE_MS) {
      setUploadErr('Запись слишком короткая — удерживайте дольше');
      return;
    }
    setUploadErr(null);
    setVoiceBusy(true);
    try {
      const meta = await computeVoiceMeta(res.blob, res.durationMs / 1000);
      const ext = res.mimeType.includes('mp4') ? 'm4a' : res.mimeType.includes('ogg') ? 'ogg' : 'webm';
      const up = await dmApi.uploadVoice(res.blob, `voice.${ext}`);
      onSend('', undefined, {
        url: up.url,
        durationSec: Math.max(1, Math.round(meta.durationSec * 10) / 10),
        peaks: meta.peaks,
      });
    } catch (e) {
      setUploadErr(e instanceof ApiHttpError ? e.payload.message : 'Не удалось отправить голосовое');
    } finally {
      setVoiceBusy(false);
    }
  };

  // Десктоп: запись по клику (не удержанием). Старт → стоп-и-отправить / отмена.
  const startClickRecord = async (): Promise<void> => {
    if (voiceBusy || recorder.recording) return;
    armCancel(false);
    await recorder.start();
  };
  const stopAndSend = async (): Promise<void> => {
    if (!recorder.recording) return;
    const res = await recorder.stop();
    if (res) await handleRecorded(res);
  };
  const cancelRecord = async (): Promise<void> => {
    if (!recorder.recording) return;
    await recorder.cancel();
  };

  const onMicDown = async (e: ReactPointerEvent): Promise<void> => {
    if (voiceBusy) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    holdRef.current = { startX: e.clientX, startY: e.clientY, active: true };
    lockedRef.current = false;
    setLocked(false);
    setLockProgress(0);
    armCancel(false);
    const ok = await recorder.start();
    if (!ok) {
      holdRef.current.active = false;
      return;
    }
    // Палец отпустили раньше, чем стартанул рекордер — завершаем сразу.
    if (!holdRef.current.active) {
      const res = await recorder.stop();
      if (res && !cancelArmedRef.current) await handleRecorded(res);
    }
  };

  const onMicMove = (e: ReactPointerEvent): void => {
    if (!holdRef.current.active || lockedRef.current) return;
    const dy = holdRef.current.startY - e.clientY; // вверх — положительно
    setLockProgress(Math.max(0, Math.min(1, dy / LOCK_LIFT_PX)));
    if (dy > LOCK_LIFT_PX) {
      // Протянули вверх — фиксируем запись: палец можно отпустить.
      lockedRef.current = true;
      setLocked(true);
      armCancel(false);
      return;
    }
    armCancel(holdRef.current.startX - e.clientX > CANCEL_SWIPE_PX);
  };

  const onMicUp = async (): Promise<void> => {
    if (!holdRef.current.active) return;
    holdRef.current.active = false;
    if (lockedRef.current) return; // запись зафиксирована — продолжаем без пальца
    if (cancelArmedRef.current) {
      await recorder.cancel();
      armCancel(false);
      return;
    }
    const res = await recorder.stop();
    armCancel(false);
    if (res) await handleRecorded(res);
  };

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (typingActiveRef.current) sendTyping(peer.id, false);
    };
  }, [peer.id, sendTyping]);

  const pokeTyping = () => {
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      sendTyping(peer.id, true);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      sendTyping(peer.id, false);
    }, 3000);
  };

  const pickImage = async (file: File | null | undefined): Promise<void> => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadErr('Можно прикреплять только изображения');
      return;
    }
    setUploadErr(null);
    const preview = URL.createObjectURL(file);
    setAttach({ url: '', width: 0, height: 0, preview });
    setUploading(true);
    try {
      const res = await dmApi.uploadImage(file);
      setAttach({ url: res.url, width: res.width, height: res.height, preview });
    } catch (e) {
      URL.revokeObjectURL(preview);
      setAttach(null);
      setUploadErr(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить изображение');
    } finally {
      setUploading(false);
    }
  };

  const clearAttach = (): void => {
    if (attach?.preview) URL.revokeObjectURL(attach.preview);
    setAttach(null);
    setUploadErr(null);
  };

  const canSend = (text.trim().length > 0 || (attach != null && attach.url !== '')) && !uploading;

  const submit = () => {
    if (!canSend) return;
    const body = text.trim();
    if (attach && attach.url) {
      onSend(body, { url: attach.url, width: attach.width, height: attach.height });
    } else if (body) {
      onSend(body);
    } else {
      return;
    }
    setText('');
    clearAttach();
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      sendTyping(peer.id, false);
    }
    requestAnimationFrame(() => taRef.current?.focus());
  };

  if (!eligibility.canMessage) {
    const reasonText =
      eligibility.reason === 'blocked'
        ? 'Вы не можете писать этому пользователю.'
        : eligibility.reason === 'privacy'
          ? 'Пользователь ограничил, кто может ему писать.'
          : 'Отправка сообщений недоступна.';
    return (
      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--line-1)', color: 'var(--text-3)', fontSize: 13, textAlign: 'center', flexShrink: 0 }}>
        {reasonText}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--line-1)', flexShrink: 0 }}>
      {(attach || uploadErr) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {attach && (
            <div style={{ position: 'relative', width: 64, height: 64, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line-2)', flexShrink: 0 }}>
              <img src={attach.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: uploading ? 0.5 : 1 }} />
              {uploading && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                  <Spinner />
                </div>
              )}
              <button
                onClick={clearAttach}
                aria-label="Убрать изображение"
                style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          )}
          {uploadErr && <span style={{ fontSize: 12, color: 'var(--accent-hi)' }}>{uploadErr}</span>}
        </div>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            void pickImage(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {recorder.recording ? (
          <RecordingBar elapsedMs={recorder.elapsedMs} cancelArmed={cancelArmed} hold={isMobile && !locked} />
        ) : (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={voiceBusy}
              aria-label="Прикрепить изображение"
              title="Прикрепить изображение"
              style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, flexShrink: 0, borderRadius: 'var(--r-lg)', border: '1px solid var(--line-2)', background: 'var(--bg-2)', color: 'var(--text-1)', cursor: voiceBusy ? 'default' : 'pointer' }}
            >
              <Icon name="image" size={20} />
            </button>
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                pokeTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Сообщение…"
              style={{
                flex: 1,
                resize: 'none',
                maxHeight: 140,
                minHeight: 42,
                padding: '11px 14px',
                borderRadius: 'var(--r-lg)',
                border: '1px solid var(--line-2)',
                background: 'var(--bg-2)',
                color: 'var(--text-0)',
                fontSize: 14,
                fontFamily: 'inherit',
                lineHeight: 1.4,
                outline: 'none',
              }}
            />
          </>
        )}
        {recorder.recording ? (
          isMobile && !locked ? (
            // Мобилка (удержание): микрофон + подсказка фиксации; отпускание =
            // отправить, свайп влево = отмена, протяжка вверх = зафиксировать.
            <>
              <LockHint progress={lockProgress} />
              <MicButton
                recording
                cancelArmed={cancelArmed}
                busy={voiceBusy}
                onPointerDown={onMicDown}
                onPointerMove={onMicMove}
                onPointerUp={onMicUp}
                onPointerCancel={onMicUp}
              />
            </>
          ) : (
            // Десктоп или зафиксированная запись: отдельные «отмена» и «отправить».
            <>
              <IconButton icon="trash" label="Отменить запись" onClick={() => void cancelRecord()} />
              <Button
                variant="primary"
                size="md"
                icon="send"
                aria-label="Отправить голосовое"
                disabled={voiceBusy}
                onClick={() => void stopAndSend()}
                style={{ width: 42, height: 42, padding: 0, flexShrink: 0 }}
              >
                {''}
              </Button>
            </>
          )
        ) : canSend ? (
          <Button
            variant="primary"
            size="md"
            icon="send"
            aria-label="Отправить"
            onClick={submit}
            style={{ width: 42, height: 42, padding: 0, flexShrink: 0 }}
          >
            {''}
          </Button>
        ) : isMobile ? (
          <MicButton
            recording={false}
            cancelArmed={false}
            busy={voiceBusy}
            onPointerDown={onMicDown}
            onPointerMove={onMicMove}
            onPointerUp={onMicUp}
            onPointerCancel={onMicUp}
          />
        ) : (
          // Десктоп в покое: клик начинает запись.
          <IconButton icon="mic" label="Записать голосовое" busy={voiceBusy} onClick={() => void startClickRecord()} />
        )}
      </div>
      {recorder.error && <span style={{ fontSize: 12, color: 'var(--accent-hi)' }}>{recorder.error}</span>}
    </div>
  );
}

/** Полоса активной записи: пульсирующая точка + таймер + подсказка. */
function RecordingBar({ elapsedMs, cancelArmed, hold }: { elapsedMs: number; cancelArmed: boolean; hold: boolean }) {
  const s = Math.floor(elapsedMs / 1000);
  const mm = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // На ПК запись по клику — подсказки про свайп нет, просто «Идёт запись…».
  const hint = hold ? (cancelArmed ? 'Отпустите для отмены' : '‹ отмена · вверх — зафиксировать') : 'Идёт запись…';
  return (
    <div
      style={{
        flex: 1,
        minHeight: 42,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 14px',
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--line-2)',
        background: 'var(--bg-2)',
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: '#ff4d4f', animation: 'vellinPulse 1s ease-in-out infinite', flexShrink: 0 }} />
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{mm}</span>
      <span style={{ marginLeft: 'auto', fontSize: 12, whiteSpace: 'nowrap', color: cancelArmed ? '#ff6b6b' : 'var(--text-3)' }}>
        {hint}
      </span>
    </div>
  );
}

/** Простая квадратная кнопка-иконка (мик/корзина) для десктопного управления записью. */
function IconButton({
  icon,
  label,
  busy,
  onClick,
}: {
  icon: 'mic' | 'trash';
  label: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      style={{
        flexShrink: 0,
        width: 42,
        height: 42,
        padding: 0,
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--line-2)',
        background: 'var(--bg-2)',
        color: 'var(--text-1)',
        display: 'grid',
        placeItems: 'center',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

/** Кнопка микрофона: зажать-и-держать для записи, свайп влево — отмена. */
function MicButton({
  recording,
  cancelArmed,
  busy,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  recording: boolean;
  cancelArmed: boolean;
  busy: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
}) {
  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      disabled={busy}
      aria-label={recording ? 'Запись — отпустите, чтобы отправить' : 'Записать голосовое'}
      title="Удерживайте, чтобы записать"
      style={{
        flexShrink: 0,
        width: 42,
        height: 42,
        padding: 0,
        borderRadius: 'var(--r-lg)',
        border: recording ? 'none' : '1px solid var(--line-2)',
        background: recording ? (cancelArmed ? '#ff4d4f' : 'var(--accent)') : 'var(--bg-2)',
        color: recording ? '#fff' : 'var(--text-1)',
        display: 'grid',
        placeItems: 'center',
        cursor: busy ? 'default' : 'pointer',
        transform: recording ? 'scale(1.08)' : 'none',
        transition: 'transform .15s ease, background .15s ease',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Icon name={cancelArmed ? 'trash' : 'mic'} size={20} />
    </button>
  );
}

/** Подсказка фиксации записи: «потяни вверх», подсвечивается у порога. */
function LockHint({ progress }: { progress: number }) {
  const p = Math.min(1, progress);
  const active = p >= 1;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        right: 0,
        bottom: '100%',
        marginBottom: 10,
        width: 42,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 34,
          height: 46,
          borderRadius: 18,
          background: active ? 'var(--accent)' : 'var(--bg-3)',
          border: '1px solid var(--line-2)',
          display: 'grid',
          placeItems: 'center',
          opacity: 0.55 + 0.45 * p,
          transform: `translateY(${-6 * p}px)`,
          transition: 'background .15s ease',
        }}
      >
        <Icon name="pin" size={16} style={{ color: active ? '#fff' : 'var(--text-2)' }} />
      </div>
      <Icon name="chevron" size={14} style={{ transform: 'rotate(-90deg)', color: 'var(--text-3)', animation: 'vellinPulse 1.2s ease-in-out infinite' }} />
    </div>
  );
}

/** Маленький крутящийся индикатор (для превью при загрузке). */
function Spinner() {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        border: '2px solid rgba(255,255,255,0.35)',
        borderTopColor: '#fff',
        animation: 'vellinBufferSpin .7s linear infinite',
        display: 'block',
      }}
    />
  );
}
