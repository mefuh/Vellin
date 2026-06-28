import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { DmConversation, PublicUser } from '@vellin/shared';
import { Avatar, Button, Icon, type IconName } from '../shared';
import { useAuthStore } from '../stores/authStore';
import { useDmStore, type ClientDm, type ThreadState } from '../stores/dmStore';
import { usePresenceStore } from '../stores/presenceStore';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { usePresence } from '../hooks/usePresence';
import { dmApi } from '../api/dm';
import { ApiHttpError } from '../api/client';
import { lastSeenLabel } from '../utils/lastSeen';
import { AppHeader } from '../components/AppHeader';
import { VoicePlayer } from '../components/messages/VoicePlayer';
import { VoiceNowPlaying } from '../components/messages/VoiceNowPlaying';
import { useVoicePlayerStore } from '../stores/voicePlayerStore';
import { useVoiceRecorder, type RecordResult } from '../hooks/useVoiceRecorder';
import { computeVoiceMeta } from '../utils/audioPeaks';
import {
  ACCENT_GRAD,
  ACCENT_GRAD_BTN,
  ACCENT_TEXT,
  ACCENT_TEXT_SOFT,
  BTN_GLOW,
  ON_ACCENT_DIM,
  OUT_SHADOW,
  R_BUBBLE_IN,
  R_BUBBLE_OUT,
} from '../components/messages/chatTheme';

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

  const list = (
    <ConversationList conversations={conversations} activeUsername={username} myId={user.id} compact={!isMobile} />
  );
  const chat = username ? <ChatPane key={username} username={username} myId={user.id} /> : <EmptyChat />;

  if (isMobile) {
    // Мобайл: либо список, либо открытый чат на весь экран.
    if (username) {
      // Чат — на весь экран (100dvh), а под выехавшую клавиатуру отдаём ровно её
      // высоту нижним паддингом. Высоту НЕ берём из visualViewport.height
      // напрямую (в standalone оно приходит короче экрана → панель «всплывала»);
      // нужна только дельта-клавиатура (keyboardHeight).
      const kb = vp?.keyboardHeight ?? 0;
      const wrapStyle: CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100dvh',
        paddingBottom: kb ? `${kb}px` : undefined,
        background: 'var(--bg-0)',
        color: 'var(--text-0)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      };
      return <div style={wrapStyle}>{chat}</div>;
    }
    return (
      <div style={{ height: '100svh', overflow: 'hidden', background: 'var(--bg-0)', color: 'var(--text-0)', display: 'flex', flexDirection: 'column' }}>
        <AppHeader active="messages" />
        <div style={{ flex: 1, minHeight: 0 }}>{list}</div>
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
          {list}
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
  compact,
}: {
  conversations: DmConversation[];
  activeUsername?: string;
  myId: string;
  /** Десктоп-сайдбар: чуть компактнее заголовок/отступы. */
  compact?: boolean;
}) {
  const presence = usePresenceStore((s) => s.byId);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? conversations.filter((c) => c.peer.username.toLowerCase().includes(q))
    : conversations;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {/* Шапка списка: заголовок + «написать» + поиск */}
      <div
        style={{
          flexShrink: 0,
          padding: compact ? '14px 14px 12px' : '8px 16px 12px',
          // Прозрачный фон — заголовок совпадает с контейнером (bg-0 на мобилке,
          // bg-1 в сайдбаре). Стекло/блюр тут не нужны: блок не лежит над скроллом.
          background: 'transparent',
          borderBottom: '1px solid var(--line-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: compact ? 22 : 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-0)' }}>
            Сообщения
          </h1>
          <button
            onClick={() => navigate('/friends')}
            aria-label="Написать"
            title="Написать"
            className="dm-press"
            style={{
              width: 38,
              height: 38,
              flexShrink: 0,
              borderRadius: 999,
              border: 'none',
              background: ACCENT_GRAD_BTN,
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              boxShadow: BTN_GLOW,
            }}
          >
            <Icon name="edit" size={17} />
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 40,
            padding: '0 14px',
            borderRadius: 20,
            background: 'var(--bg-2)',
            border: '1px solid var(--line-2)',
          }}
        >
          <Icon name="search" size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              color: 'var(--text-0)',
              fontSize: 15,
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Очистить"
              className="dm-press"
              style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Строки (снизу — место под плавающий док на мобилке) */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: compact ? '6px 8px 14px' : '6px 8px 96px' }}>
        {conversations.length === 0 ? (
          <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
            Здесь появятся ваши переписки. Откройте профиль друга и нажмите «Написать».
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
            Ничего не найдено
          </div>
        ) : (
          filtered.map((c) => (
            <ConversationRow
              key={c.id}
              c={c}
              myId={myId}
              online={presence[c.peer.id]?.online ?? c.online}
              active={activeUsername === c.peer.username}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** Одна строка списка диалогов в стиле макета. */
function ConversationRow({
  c,
  myId,
  online,
  active,
}: {
  c: DmConversation;
  myId: string;
  online: boolean;
  active: boolean;
}) {
  const last = c.lastMessage;
  const mine = !!last && last.senderId === myId;
  const read =
    mine && c.peerLastReadAt != null && new Date(c.peerLastReadAt).getTime() >= new Date(last!.createdAt).getTime();

  // Иконка-маркер вложения в превью (голосовое/фото).
  const marker = last?.hasVoice ? 'mic' : last?.hasImage ? 'image' : null;
  const previewText = last
    ? last.hasVoice
      ? 'Голосовое сообщение'
      : last.hasImage
        ? last.body || 'Фото'
        : last.body
    : '';
  const prefix = mine ? 'Вы: ' : '';

  return (
    <Link
      to={`/messages/${encodeURIComponent(c.peer.username)}`}
      className="dm-row dm-noselect"
      data-active={active}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '11px 10px',
        borderRadius: 18,
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <Avatar name={c.peer.username} seed={c.peer.avatarSeed} src={c.peer.avatarUrl} size={54} status={online ? 'online' : 'offline'} />
      <div style={{ flex: 1, minWidth: 0, borderBottom: active ? 'none' : '1px solid var(--line-1)', paddingBottom: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.peer.username}
          </span>
          {last && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {mine && <Ticks read={read} color={read ? 'var(--accent-hi)' : 'var(--text-3)'} />}
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtTime(last.createdAt)}</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 14,
              color: c.unreadCount > 0 ? 'var(--text-1)' : 'var(--text-2)',
              overflow: 'hidden',
            }}
          >
            {marker && <Icon name={marker} size={14} style={{ color: ACCENT_TEXT_SOFT, flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {prefix}
              {previewText}
            </span>
          </span>
          {c.unreadCount > 0 && (
            <span
              style={{
                flexShrink: 0,
                minWidth: 20,
                height: 20,
                padding: '0 6px',
                borderRadius: 10,
                background: ACCENT_GRAD,
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                display: 'grid',
                placeItems: 'center',
                boxShadow: BTN_GLOW,
              }}
            >
              {c.unreadCount > 99 ? '99+' : c.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Скелетон ленты на время загрузки переписки: чередующиеся «пузыри-заглушки»
 *  с пробегающим бликом (вместо голого «Загрузка…»). */
function ThreadSkeleton() {
  // Чередуем стороны и ширины, чтобы заглушка читалась как настоящая переписка.
  const rows: { mine: boolean; w: number; h: number }[] = [
    { mine: false, w: 58, h: 38 },
    { mine: false, w: 42, h: 38 },
    { mine: true, w: 64, h: 56 },
    { mine: false, w: 50, h: 38 },
    { mine: true, w: 38, h: 38 },
    { mine: true, w: 54, h: 38 },
    { mine: false, w: 60, h: 48 },
  ];
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10, padding: '16px max(12px, 3%) 20px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: r.mine ? 'flex-end' : 'flex-start' }}>
          <div
            className="dm-skel"
            style={{
              width: `${r.w}%`,
              height: r.h,
              borderRadius: r.mine ? R_BUBBLE_OUT : R_BUBBLE_IN,
              // Сдвиг фазы блика по рядам — пробегающая волна вместо синхронного мерцания.
              ...({ '--skel-delay': `${i * 0.12}s` } as CSSProperties),
            }}
          />
        </div>
      ))}
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
  const [lightbox, setLightbox] = useState<{ url: string; rect: DOMRect | null } | null>(null);

  const setThread = useDmStore((s) => s.setThread);
  const setActivePeer = useDmStore((s) => s.setActivePeer);
  const markRead = useDmStore((s) => s.markRead);
  const sendMessage = useDmStore((s) => s.send);
  const prependMessages = useDmStore((s) => s.prependMessages);

  const thread = useDmStore((s) => (peerId ? s.threads[peerId] : undefined));
  const typingUntil = useDmStore((s) => (peerId ? s.typing[peerId] : undefined));
  const typingKind = useDmStore((s) => (peerId ? s.typingKind[peerId] : undefined));
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
    return <ThreadSkeleton />;
  }

  const peer = thread.peer;
  const online = peerPresence?.online ?? thread.online;
  const isTyping = typingUntil != null && typingUntil > Date.now();
  const room = peerPresence?.currentRoom ?? null;
  const subtitle = isTyping ? (
    <span style={{ color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {typingKind === 'voice' ? (
        <>
          <Icon name="mic" size={13} style={{ marginRight: -1 }} />
          записывает голосовое
        </>
      ) : (
        'печатает'
      )}
      <TypingDots />
    </span>
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
        className="dm-noselect"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '11px 12px',
          // PWA standalone: на мобилке чат во весь экран — уводим шапку из-под
          // статус-бара (на десктопе/в сайдбаре inset = 0, без изменений).
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 11px)',
          borderBottom: '1px solid var(--line-1)',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          flexShrink: 0,
        }}
      >
        {isMobile && (
          <button
            onClick={() => navigate('/messages')}
            aria-label="Назад"
            className="dm-press"
            style={{ display: 'grid', placeItems: 'center', width: 36, height: 38, flexShrink: 0, borderRadius: 'var(--r-md)', border: 'none', background: 'transparent', color: ACCENT_TEXT, cursor: 'pointer' }}
          >
            <Icon name="chevron" size={22} stroke={2.4} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        <Link
          to={`/u/${encodeURIComponent(peer.username)}`}
          style={{ display: 'flex', alignItems: 'center', gap: 11, color: 'inherit', textDecoration: 'none', minWidth: 0, flex: 1 }}
        >
          <Avatar name={peer.username} seed={peer.avatarSeed} src={peer.avatarUrl} size={40} status={online ? 'online' : 'offline'} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {peer.username}
            </div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                marginTop: 1,
                color: isTyping || online ? ACCENT_TEXT_SOFT : 'var(--text-2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </div>
          </div>
        </Link>
        {/* Действия (звонок/видео — оформление; функционал добавим позже). */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <HeaderActionButton icon="video" label="Видеозвонок" />
          <HeaderActionButton icon="phone" label="Позвонить" />
        </div>
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
          onOpenImage={(url, rect) => setLightbox({ url, rect })}
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

      {lightbox && <Lightbox url={lightbox.url} rect={lightbox.rect} peer={peer} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/** Полноэкранный просмотр изображения (по образцу макета): чёрный фон, шапка с
 *  собеседником и кнопкой закрытия. Механика открытия/закрытия не меняется. */
/** Кривые перехода фото: открытие — мягкий «вылет», закрытие — собранный заход. */
const PHOTO_OPEN_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const PHOTO_CLOSE_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const PHOTO_MS = 320;

/**
 * Просмотр фото с hero-зумом «из миниатюры» (FLIP): картинка раскрывается из
 * того места в ленте, где её тапнули, подложка плавно затемняется; при закрытии
 * — обратный заход в ту же точку. Источник — DOMRect миниатюры (`rect`).
 */
function Lightbox({ url, rect, peer, onClose }: { url: string; rect: DOMRect | null; peer: PublicUser; onClose: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [shown, setShown] = useState(false); // затемнение + ui
  const closingRef = useRef(false);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Трансформа, помещающая полноэкранную картинку обратно в исходную миниатюру. */
  const transformToSource = useCallback((): string | null => {
    const img = imgRef.current;
    if (!img || !rect) return null;
    const f = img.getBoundingClientRect();
    if (f.width < 1 || f.height < 1) return null;
    const scale = rect.width / f.width;
    const tx = rect.left + rect.width / 2 - (f.left + f.width / 2);
    const ty = rect.top + rect.height / 2 - (f.top + f.height / 2);
    return `translate(${tx}px, ${ty}px) scale(${scale})`;
  }, [rect]);

  // Открытие: ставим картинку в позицию миниатюры и пускаем к центру.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img && !reduceMotion) {
      const from = transformToSource();
      if (from) {
        img.style.transition = 'none';
        img.style.transform = from;
        void img.offsetWidth; // reflow — зафиксировать стартовую позицию
        requestAnimationFrame(() => {
          img.style.transition = `transform ${PHOTO_MS}ms ${PHOTO_OPEN_EASE}`;
          img.style.transform = 'translate(0, 0) scale(1)';
        });
      }
    }
    requestAnimationFrame(() => setShown(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestClose = useCallback((): void => {
    if (closingRef.current) return;
    closingRef.current = true;
    setShown(false);
    const img = imgRef.current;
    const to = reduceMotion ? null : transformToSource();
    if (img && to) {
      img.style.transition = `transform ${PHOTO_MS}ms ${PHOTO_CLOSE_EASE}`;
      img.style.transform = to;
      window.setTimeout(onClose, PHOTO_MS);
    } else {
      window.setTimeout(onClose, reduceMotion ? 0 : 180);
    }
  }, [onClose, reduceMotion, transformToSource]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  return (
    <div onClick={requestClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', flexDirection: 'column' }}>
      {/* Затемнение-подложка (плавно) */}
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: shown ? 1 : 0, transition: `opacity ${PHOTO_MS}ms ease`, pointerEvents: 'none' }} />
      {/* Шапка: собеседник + закрыть */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 14px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.65), transparent)',
          opacity: shown ? 1 : 0,
          transition: `opacity ${PHOTO_MS}ms ease`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar name={peer.username} seed={peer.avatarSeed} src={peer.avatarUrl} size={36} />
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {peer.username}
          </div>
        </div>
        <button
          onClick={requestClose}
          aria-label="Закрыть"
          className="dm-press"
          style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      {/* Изображение */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: '0 16px 24px' }}>
        <img
          ref={imgRef}
          src={url}
          alt=""
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, objectFit: 'contain', willChange: 'transform' }}
        />
      </div>
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
  onOpenImage: (url: string, rect: DOMRect) => void;
  onImageLoad: () => void;
}) {
  const peerReadMs = peerLastReadAt ? new Date(peerLastReadAt).getTime() : 0;
  // Анимируем только сообщения, появившиеся после открытия чата (не историю).
  const mountTsRef = useRef(Date.now());
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastDay = '';
  return (
    <>
      {messages.map((m) => {
        const mine = m.senderId === myId || m.senderId === 'me';
        const day = dayLabel(m.createdAt);
        const showDay = day !== lastDay;
        lastDay = day;
        const read = mine && peerReadMs >= new Date(m.createdAt).getTime() && !m.pending;
        const fresh = !reduceMotion && new Date(m.createdAt).getTime() >= mountTsRef.current - 2000;
        const status = !mine ? null : m.failed ? (
          <span style={{ color: '#ffd0d0' }} title="Не отправлено">!</span>
        ) : m.pending ? (
          <Ticks read={false} faint />
        ) : (
          <Ticks read={read} />
        );
        return (
          <div key={m.nonce ?? m.id}>
            {showDay && (
              <div style={{ display: 'grid', placeItems: 'center', margin: '14px 0 14px' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)', background: 'var(--bg-2)', padding: '4px 13px', borderRadius: 13 }}>
                  {day}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', padding: '3px 0' }}>
              <div
                style={{
                  maxWidth: '76%',
                  display: 'flex',
                  transformOrigin: mine ? 'right bottom' : 'left bottom',
                  ...(fresh ? { animation: 'dmBubbleIn 0.24s cubic-bezier(0.22, 1, 0.36, 1) both' } : null),
                }}
              >
              {(() => {
                const isImage = !!m.imageUrl;
                const isVoice = !!m.voiceUrl;
                const bareImage = isImage && !m.body;
                const timeColor = mine ? ON_ACCENT_DIM : 'var(--text-3)';
                return (
                  <div
                    style={{
                      position: 'relative',
                      maxWidth: '100%',
                      padding: isVoice ? '9px 13px 8px 9px' : bareImage ? 0 : isImage ? 4 : '8px 13px 6px',
                      borderRadius: mine ? R_BUBBLE_OUT : R_BUBBLE_IN,
                      background: bareImage ? 'transparent' : mine ? ACCENT_GRAD : 'var(--bg-3)',
                      border: !mine && !bareImage ? '1px solid var(--line-2)' : 'none',
                      color: mine ? '#fff' : 'var(--text-0)',
                      boxShadow: mine && !bareImage ? OUT_SHADOW : 'none',
                      opacity: m.pending ? 0.7 : 1,
                      overflow: 'hidden',
                    }}
                  >
                    {isVoice ? (
                      <VoicePlayer
                        messageId={m.id}
                        url={m.voiceUrl!}
                        durationSec={m.voiceDurationSec ?? 0}
                        peaks={m.voicePeaks ?? []}
                        mine={mine}
                        played={!!m.voicePlayed}
                        pending={m.pending}
                        clock={fmtTime(m.createdAt)}
                        statusSlot={status}
                      />
                    ) : isImage ? (
                      <>
                        <img
                          src={m.imageUrl}
                          alt=""
                          loading="lazy"
                          onLoad={onImageLoad}
                          onClick={(e) => onOpenImage(m.imageUrl!, e.currentTarget.getBoundingClientRect())}
                          style={{
                            display: 'block',
                            maxWidth: 'min(260px, 72vw)',
                            maxHeight: 340,
                            width: 'auto',
                            height: 'auto',
                            borderRadius: bareImage ? 'inherit' : 12,
                            cursor: 'pointer',
                          }}
                        />
                        {m.body && (
                          <span style={{ display: 'block', padding: '6px 9px 0', fontSize: 15, lineHeight: 1.32, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {m.body}
                          </span>
                        )}
                        {bareImage ? (
                          // Время поверх фото — тёмный чип в углу.
                          <span style={{ position: 'absolute', bottom: 8, right: 8, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#fff', padding: '3px 8px', background: 'rgba(0,0,0,0.45)', borderRadius: 11 }}>
                            {fmtTime(m.createdAt)}
                            {status}
                          </span>
                        ) : (
                          <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: timeColor, padding: '3px 7px 1px' }}>
                            {fmtTime(m.createdAt)}
                            {status}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 15, lineHeight: 1.32, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</span>
                        <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 1, fontSize: 11, fontWeight: 500, color: timeColor }}>
                          {fmtTime(m.createdAt)}
                          {status}
                        </span>
                      </>
                    )}
                  </div>
                );
              })()}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Анимированное многоточие индикатора «печатает…» (три бегущие точки). */
function TypingDots() {
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2.5, paddingBottom: 1 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 3.5,
            height: 3.5,
            borderRadius: 999,
            background: 'currentColor',
            ...(reduceMotion ? null : { animation: `dmTypingDot 1.1s ease-in-out ${i * 0.16}s infinite` }),
          }}
        />
      ))}
    </span>
  );
}

/** Круглая кнопка действия в шапке чата (видео/звонок). Пока без обработчика —
 *  функционал телефонии добавим позже, сейчас только оформление по макету. */
function HeaderActionButton({ icon, label }: { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      // Телефония ещё не реализована — кнопки заглушены до появления функционала.
      disabled
      aria-disabled
      aria-label={`${label} — скоро`}
      title={`${label} — скоро`}
      style={{
        width: 37,
        height: 37,
        flexShrink: 0,
        borderRadius: 999,
        border: '1px solid var(--line-1)',
        background: 'var(--bg-3)',
        color: 'var(--text-0)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'not-allowed',
        opacity: 0.4,
      }}
    >
      <Icon name={icon} size={18} />
    </button>
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

/** Появление акцентной кнопки-действия (отправить/голосовое) — один мягкий «pop». */
const ACTION_POP = 'dmActionPop 0.18s cubic-bezier(0.22, 1, 0.36, 1) both';

/** Минимальная длительность записи, ниже — считаем случайным тапом. */
const MIN_VOICE_MS = 700;
/** На сколько нужно увести палец влево, чтобы отменить запись. */
const CANCEL_SWIPE_PX = 70;
/** На сколько нужно увести палец вверх, чтобы зафиксировать запись (hands-free). */
const LOCK_LIFT_PX = 40;

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
  const [recExiting, setRecExiting] = useState(false); // полоса записи «уезжает» при отмене
  const sendTyping = useDmStore((s) => s.sendTyping);
  const recorder = useVoiceRecorder();
  const isMobile = useIsMobile();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Превью вложения: присутствие для симметричных появления/исчезания. Во время
  // выхода показываем последнее вложение (presence держит его смонтированным).
  const attachPresence = usePresence(attach != null, 220);
  const lastAttachRef = useRef<Attachment | null>(null);
  if (attach) lastAttachRef.current = attach;
  const shownAttach = attach ?? lastAttachRef.current;
  const typingActiveRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRef = useRef<{ startX: number; startY: number; active: boolean }>({ startX: 0, startY: 0, active: false });
  const lockedRef = useRef(false);

  const armCancel = (v: boolean): void => {
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

  // Пока идёт запись — сигналим собеседнику «записывает голосовое…», обновляя
  // сигнал (TTL 6с), чтобы индикатор не истёк на длинной записи.
  useEffect(() => {
    if (!recorder.recording) return;
    sendTyping(peer.id, true, 'voice');
    const iv = window.setInterval(() => sendTyping(peer.id, true, 'voice'), 3000);
    return () => {
      window.clearInterval(iv);
      sendTyping(peer.id, false, 'voice');
    };
  }, [recorder.recording, peer.id, sendTyping]);

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
    // Полоса записи «смахивается в корзину» (см. recExiting в RecordingBar):
    // схлопывается влево + роняется + blur. Размонтаж после завершения discard.
    setRecExiting(true);
    await recorder.cancel();
    window.setTimeout(() => setRecExiting(false), 260);
  };

  const onMicDown = async (e: ReactPointerEvent): Promise<void> => {
    if (voiceBusy) return;
    e.preventDefault();
    const pid = e.pointerId;
    holdRef.current = { startX: e.clientX, startY: e.clientY, active: true };
    lockedRef.current = false;
    setLocked(false);
    setLockProgress(0);
    armCancel(false);

    // Жест ведём через слушатели на window, а не на кнопке: события приходят,
    // даже когда палец уходит далеко за пределы кнопки (захват указателя на
    // мобильных ненадёжен и обрывается, как только палец покидает элемент).
    const move = (ev: PointerEvent): void => {
      if (ev.pointerId === pid) onMicMove(ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent): void => {
      if (ev.pointerId !== pid) return;
      detachWin();
      void onMicUp(ev.clientX, ev.clientY);
    };
    const cancelH = (ev: PointerEvent): void => {
      if (ev.pointerId !== pid) return;
      detachWin();
      void onMicCancel();
    };
    function detachWin(): void {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancelH);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancelH);

    const ok = await recorder.start();
    if (!ok) {
      holdRef.current.active = false;
      detachWin();
      return;
    }
    // Палец отпустили раньше, чем стартанул рекордер — отбрасываем (слишком
    // быстрый тап, аудио нет). Но НЕ когда жест перешёл в фиксацию.
    if (!holdRef.current.active && !lockedRef.current) {
      await recorder.cancel();
    }
  };

  // Во время удержания — только визуальная обратная связь (подсветка фиксации /
  // отмены). Решение (зафиксировать/отменить/отправить) принимаем ТОЛЬКО на
  // отпускании пальца — чтобы ничего не размонтировалось посреди жеста (иначе
  // ломается захват указателя и сбивается отсчёт записи).
  const onMicMove = (clientX: number, clientY: number): void => {
    if (!holdRef.current.active) return;
    const dy = holdRef.current.startY - clientY; // вверх — положительно
    const dx = holdRef.current.startX - clientX; // влево — положительно
    // Шкала следует за пальцем в обе стороны: повёл вверх — заполняется, повёл
    // обратно вниз — опустошается (можно «передумать» и не фиксировать).
    setLockProgress(Math.max(0, Math.min(1, dy / LOCK_LIFT_PX)));
    armCancel(dy < LOCK_LIFT_PX * 0.5 && dx > CANCEL_SWIPE_PX);
  };

  const onMicUp = async (clientX: number, clientY: number): Promise<void> => {
    if (!holdRef.current.active) return;
    holdRef.current.active = false;
    const dy = holdRef.current.startY - clientY;
    const dx = holdRef.current.startX - clientX;
    setLockProgress(0);
    // 1) Отпустили выше порога → фиксируем. Если передумал — успел опуститься
    //    ниже порога, и сюда не попадём (уйдёт в отправку).
    if (dy >= LOCK_LIFT_PX) {
      lockedRef.current = true;
      setLocked(true);
      armCancel(false);
      return;
    }
    // 2) Свайп влево → отмена.
    if (dx > CANCEL_SWIPE_PX) {
      armCancel(false);
      await cancelRecord();
      return;
    }
    // 3) Иначе — стоп и отправка.
    armCancel(false);
    const res = await recorder.stop();
    if (res) await handleRecorded(res);
  };

  // Прерывание жеста браузером (например, увод системой) — отбрасываем запись.
  const onMicCancel = async (): Promise<void> => {
    if (!holdRef.current.active) return;
    holdRef.current.active = false;
    setLockProgress(0);
    armCancel(false);
    await cancelRecord();
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
      setAttach(null);
      setUploadErr(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить изображение');
      // Освобождаем objectURL после обратной анимации (превью ещё видно при выходе).
      window.setTimeout(() => URL.revokeObjectURL(preview), 280);
    } finally {
      setUploading(false);
    }
  };

  const clearAttach = (): void => {
    const url = attach?.preview;
    setAttach(null);
    setUploadErr(null);
    if (url) window.setTimeout(() => URL.revokeObjectURL(url), 280);
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
    <div
      className="dm-noselect"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 14px',
        // Нижний отступ учитывает «дом-индикатор» (safe-area). При открытой
        // клавиатуре inset = 0 — двойного зазора не будет.
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
        borderTop: '1px solid var(--line-1)',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        flexShrink: 0,
      }}
    >
      {(attachPresence.mounted || uploadErr) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {attachPresence.mounted && shownAttach && (
            <div
              style={{
                position: 'relative',
                width: 64,
                height: 64,
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid var(--line-2)',
                flexShrink: 0,
                transformOrigin: 'bottom left',
                // Симметрия: появление снизу с лёгким масштабом ↔ обратный уход.
                opacity: attachPresence.open ? 1 : 0,
                transform: reduceMotion ? undefined : attachPresence.open ? 'translateY(0) scale(1)' : 'translateY(7px) scale(0.95)',
                transition: reduceMotion ? 'opacity .18s ease' : 'opacity .2s ease, transform .22s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <img src={shownAttach.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: uploading ? 0.5 : 1, transition: 'opacity .2s ease' }} />
              {uploading && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.25)' }}>
                  <Spinner />
                </div>
              )}
              <button
                onClick={clearAttach}
                aria-label="Убрать изображение"
                className="dm-press"
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
        {recorder.recording || recExiting ? (
          <RecordingBar
            elapsedMs={recorder.elapsedMs}
            cancelArmed={cancelArmed}
            hold={isMobile && !locked}
            getLevel={recorder.getLevel}
            exiting={recExiting && !recorder.recording}
          />
        ) : (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={voiceBusy}
              aria-label="Прикрепить изображение"
              title="Прикрепить изображение"
              className="dm-press"
              style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, flexShrink: 0, borderRadius: 999, border: 'none', background: 'var(--bg-3)', color: 'var(--text-0)', cursor: voiceBusy ? 'default' : 'pointer' }}
            >
              <Icon name="image" size={19} />
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
              className="dm-input"
              style={{
                flex: 1,
                resize: 'none',
                maxHeight: 140,
                minHeight: 42,
                padding: '11px 16px',
                borderRadius: 'var(--r-xl)',
                border: '1px solid var(--line-2)',
                background: 'var(--bg-2)',
                color: 'var(--text-0)',
                fontSize: 15,
                fontFamily: 'inherit',
                lineHeight: 1.4,
                outline: 'none',
              }}
            />
          </>
        )}
        {recExiting && !recorder.recording ? (
          // Запись отменяется — полоса уезжает, справа держим место.
          <div style={{ width: 44, flexShrink: 0 }} />
        ) : recorder.recording ? (
          isMobile && !locked ? (
            // Мобилка (удержание): микрофон + подсказка фиксации; отпускание =
            // отправить, свайп влево = отмена, протяжка вверх = зафиксировать.
            <>
              <LockHint progress={lockProgress} />
              <MicButton recording cancelArmed={cancelArmed} busy={voiceBusy} lift={lockProgress} onPointerDown={onMicDown} />
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
                className="dm-press dm-anim"
                style={{ width: 44, height: 44, padding: 0, flexShrink: 0, borderRadius: 999, background: ACCENT_GRAD_BTN, boxShadow: BTN_GLOW, animation: ACTION_POP }}
              >
                {''}
              </Button>
            </>
          )
        ) : (
          // Покой: микрофон ⇄ отправка плавным кросс-фейдом (в обе стороны).
          <ComposerAction
            canSend={canSend}
            isMobile={isMobile}
            voiceBusy={voiceBusy}
            onSend={submit}
            onMicDown={onMicDown}
            onDesktopRecord={() => void startClickRecord()}
          />
        )}
      </div>
      {recorder.error && <span style={{ fontSize: 12, color: 'var(--accent-hi)' }}>{recorder.error}</span>}
    </div>
  );
}

/** Полоса активной записи: пульсирующая точка + таймер + живая волна + подсказка. */
function RecordingBar({
  elapsedMs,
  cancelArmed,
  hold,
  getLevel,
  exiting,
}: {
  elapsedMs: number;
  cancelArmed: boolean;
  hold: boolean;
  getLevel: () => number;
  exiting?: boolean;
}) {
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const s = Math.floor(elapsedMs / 1000);
  const mm = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // Вход и выход — две взаимоисключающие keyframe-анимации (без гонки transition
  // c fill-кадром входа). Выход = растворение на месте (см. dmRecDiscard).
  const anim = reduceMotion
    ? undefined
    : exiting
      ? 'dmRecDiscard 0.22s cubic-bezier(0.22, 1, 0.36, 1) both'
      : 'dmRecIn 0.24s cubic-bezier(0.22, 1, 0.36, 1) both';
  return (
    <div
      className="dm-noselect"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 14px',
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--accent)',
        background: 'var(--accent-soft)',
        transformOrigin: 'center',
        // reduce-motion: без движения — просто исчезновение.
        opacity: reduceMotion && exiting ? 0 : 1,
        transition: reduceMotion ? 'opacity .18s ease' : undefined,
        animation: anim,
        willChange: 'transform, opacity',
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: 999, background: '#ff453a', animation: exiting ? undefined : 'vellinPulse 1.1s ease-in-out infinite', flexShrink: 0 }} />
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 600, color: 'var(--text-0)', minWidth: 32, flexShrink: 0 }}>{mm}</span>
      <LiveWaveform getLevel={getLevel} dim={cancelArmed} collapsed={exiting} />
      <span style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0, color: cancelArmed ? '#ff6b6b' : 'var(--text-2)' }}>
        {cancelArmed ? 'Отпустите для отмены' : hold ? '‹ отмена' : 'Идёт запись…'}
      </span>
    </div>
  );
}

/** Живая волна записи: бежит влево, высота столбиков = громкость микрофона.
 *  `collapsed` — при отмене все столбики опадают к базовой линии (флэтлайн). */
function LiveWaveform({ getLevel, dim, collapsed }: { getLevel: () => number; dim?: boolean; collapsed?: boolean }) {
  const BARS = 32;
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.05));
  const lastPushRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    let mounted = true;
    const tick = (t: number): void => {
      if (!mounted) return;
      // Добавляем новый столбик ~каждые 55мс — получается ровная бегущая волна.
      if (t - lastPushRef.current >= 55) {
        lastPushRef.current = t;
        const lvl = getLevel();
        setLevels((prev) => {
          const next = prev.slice(1);
          next.push(Math.max(0.06, lvl));
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
    };
  }, [getLevel]);
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        height: 26,
        overflow: 'hidden',
        opacity: dim ? 0.4 : 1,
        transition: 'opacity .15s ease',
      }}
    >
      {levels.map((lv, i) => (
        <span
          key={i}
          style={{
            flex: '1 1 0',
            minWidth: 2,
            maxWidth: 5,
            height: '100%',
            borderRadius: 3,
            background: 'var(--accent-hi)',
            // scaleY вместо height — анимация на композиторе, без layout-трэша.
            // При отмене опадаем к базовой линии (флэтлайн «разрядки»).
            transform: `scaleY(${collapsed ? 0.08 : Math.max(0.08, 0.08 + lv * 0.92)})`,
            transformOrigin: 'center',
            transition: collapsed ? 'transform .22s cubic-bezier(0.4, 0, 1, 1)' : 'transform .09s ease-out',
            willChange: 'transform',
          }}
        />
      ))}
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
        borderRadius: 999,
        border: '1px solid var(--line-2)',
        background: 'var(--bg-3)',
        color: 'var(--text-0)',
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

/**
 * Хвостовое действие композера в покое: плавный кросс-фейд микрофон ⇄ отправка.
 * Оба слоя всегда смонтированы в одном 44px-слоте и переключаются по `canSend`
 * через opacity+scale в обе стороны (симметрично, прерываемо). Неактивный слой
 * убираем из фокуса/AT через `visibility:hidden` с задержкой по выходу.
 */
function ComposerAction({
  canSend,
  isMobile,
  voiceBusy,
  onSend,
  onMicDown,
  onDesktopRecord,
}: {
  canSend: boolean;
  isMobile: boolean;
  voiceBusy: boolean;
  onSend: () => void;
  onMicDown: (e: ReactPointerEvent) => void;
  onDesktopRecord: () => void;
}) {
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = (active: boolean): CSSProperties => ({
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    opacity: active ? 1 : 0,
    transform: reduceMotion ? undefined : active ? 'scale(1)' : 'scale(0.9)',
    visibility: active ? 'visible' : 'hidden',
    pointerEvents: active ? 'auto' : 'none',
    // visibility переключаем мгновенно на входе и с задержкой на выходе — чтобы
    // ушедший слой не ловил фокус, но успел доиграть прозрачность.
    transition: reduceMotion
      ? `opacity .15s ease, visibility 0s ${active ? '0s' : '.15s'}`
      : `opacity .18s ease, transform .18s cubic-bezier(0.22, 1, 0.36, 1), visibility 0s ${active ? '0s' : '.18s'}`,
  });
  return (
    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
      <div style={layer(!canSend)}>
        {isMobile ? (
          <MicButton recording={false} cancelArmed={false} busy={voiceBusy} onPointerDown={onMicDown} />
        ) : (
          <IconButton icon="mic" label="Записать голосовое" busy={voiceBusy} onClick={onDesktopRecord} />
        )}
      </div>
      <div style={layer(canSend)}>
        <Button
          variant="primary"
          size="md"
          icon="send"
          aria-label="Отправить"
          onClick={onSend}
          className="dm-press"
          style={{ width: 44, height: 44, padding: 0, borderRadius: 999, background: ACCENT_GRAD_BTN, boxShadow: BTN_GLOW }}
        >
          {''}
        </Button>
      </div>
    </div>
  );
}

/** Кнопка микрофона: зажать-и-держать для записи, свайп влево — отмена. */
function MicButton({
  recording,
  cancelArmed,
  busy,
  lift = 0,
  onPointerDown,
}: {
  recording: boolean;
  cancelArmed: boolean;
  busy: boolean;
  /** Подъём кнопки за пальцем при протяжке к замку (0..1). */
  lift?: number;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  return (
    <button
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      disabled={busy}
      aria-label={recording ? 'Запись — отпустите, чтобы отправить' : 'Записать голосовое'}
      title="Удерживайте, чтобы записать"
      style={{
        flexShrink: 0,
        width: 44,
        height: 44,
        padding: 0,
        borderRadius: 999,
        border: 'none',
        background: cancelArmed ? '#ff4d4f' : ACCENT_GRAD_BTN,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        cursor: busy ? 'default' : 'pointer',
        transform: `translateY(${-lift * 12}px) scale(${recording ? 1.08 : 1})`,
        transition: 'transform .12s ease-out, background .15s ease',
        boxShadow: BTN_GLOW,
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

/**
 * Аффорданс фиксации записи: вертикальный «жёлоб» с замком над кнопкой
 * микрофона. По мере протяжки вверх (progress 0→1) снизу поднимается акцентная
 * заливка (scaleY — без layout), у порога замок «защёлкивается» (scale-bump),
 * а пульсирующая стрелка-подсказка гаснет.
 */
function LockHint({ progress }: { progress: number }) {
  const p = Math.min(1, progress);
  const active = p >= 1;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        right: 1,
        bottom: '100%',
        marginBottom: 8,
        width: 44,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 38,
          height: 64,
          borderRadius: 19,
          background: 'var(--bg-3)',
          border: `1px solid ${active ? 'transparent' : 'var(--line-2)'}`,
          overflow: 'hidden',
          boxShadow: active ? BTN_GLOW : 'var(--shadow-1)',
          transition: 'box-shadow .2s ease, border-color .2s ease',
        }}
      >
        {/* Заливка снизу вверх — scaleY от нижнего края (на композиторе). */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: ACCENT_GRAD_BTN,
            transform: `scaleY(${p})`,
            transformOrigin: 'bottom',
            transition: 'transform .08s linear',
          }}
        />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <Icon
            name="lock"
            size={17}
            style={{
              color: active || p > 0.5 ? '#fff' : 'var(--text-1)',
              transform: `scale(${active ? 1.18 : 1})`,
              transition: 'transform .2s cubic-bezier(0.23, 1, 0.32, 1), color .15s ease',
            }}
          />
        </div>
      </div>
      {/* Пульсирующая стрелка вверх (внешний span — анимация, чтобы не конфликтовать с rotate). */}
      <span style={{ display: 'block', opacity: 0.9 - p * 0.9, animation: 'vellinNudgeUp 1s ease-in-out infinite' }}>
        <Icon name="chevron" size={16} style={{ display: 'block', transform: 'rotate(-90deg)', color: 'var(--accent-hi)' }} />
      </span>
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
