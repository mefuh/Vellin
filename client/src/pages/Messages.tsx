import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
    <div style={{ minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)', display: 'flex', flexDirection: 'column' }}>
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
        const preview = last ? (last.senderId === myId ? `Вы: ${last.body}` : last.body) : '';
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
                {last && <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>{fmtTime(last.createdAt)}</span>}
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

  // Автопрокрутка вниз при новых сообщениях.
  const msgCount = thread?.messages.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgCount, peerId]);

  // При появлении/скрытии клавиатуры (resize visual viewport) держим ленту у
  // низа, чтобы последнее сообщение не пряталось за поднявшимся композером.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const toBottom = (): void => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    vv.addEventListener('resize', toBottom);
    return () => vv.removeEventListener('resize', toBottom);
  }, []);

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
            <Icon name="prev" size={20} />
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

      {/* Лента сообщений */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px max(12px, 3%)', display: 'flex', flexDirection: 'column', gap: 2 }}>
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
        <MessageList messages={thread.messages} myId={myId} peerLastReadAt={thread.peerLastReadAt} />
      </div>

      {/* Ввод */}
      <Composer
        peer={peer}
        eligibility={thread.eligibility}
        onSend={(body) => sendMessage(peer, body)}
      />
    </div>
  );
}

function MessageList({
  messages,
  myId,
  peerLastReadAt,
}: {
  messages: ClientDm[];
  myId: string;
  peerLastReadAt: string | null;
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
                  padding: '8px 12px',
                  borderRadius: 16,
                  borderBottomRightRadius: mine ? 4 : 16,
                  borderBottomLeftRadius: mine ? 16 : 4,
                  background: mine ? 'var(--accent)' : 'var(--bg-3)',
                  color: mine ? '#fff' : 'var(--text-0)',
                  opacity: m.pending ? 0.65 : 1,
                  position: 'relative',
                }}
              >
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
                  {mine && (
                    <span style={{ display: 'inline-flex' }}>
                      {m.failed ? (
                        <span style={{ color: '#ffd0d0' }} title="Не отправлено">!</span>
                      ) : m.pending ? (
                        <Ticks read={false} faint />
                      ) : (
                        <Ticks read={read} />
                      )}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Галочки доставки: одна (отправлено) / две (прочитано). */
function Ticks({ read, faint }: { read: boolean; faint?: boolean }) {
  const color = faint ? 'rgba(255,255,255,0.5)' : read ? '#bfe3ff' : 'rgba(255,255,255,0.78)';
  const w = read ? 17 : 12;
  return (
    <svg width={w} height="11" viewBox={`0 0 ${w} 11`} fill="none" style={{ display: 'block' }}>
      <path d="M1 5.5L4 8.5L9.5 2" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {read && <path d="M6.5 8.5L12 2" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function Composer({
  peer,
  eligibility,
  onSend,
}: {
  peer: PublicUser;
  eligibility: ThreadState['eligibility'];
  onSend: (body: string) => void;
}) {
  const [text, setText] = useState('');
  const sendTyping = useDmStore((s) => s.sendTyping);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const typingActiveRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText('');
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      sendTyping(peer.id, false);
    }
    requestAnimationFrame(() => taRef.current?.focus());
  };

  if (!eligibility.canMessage) {
    const text =
      eligibility.reason === 'blocked'
        ? 'Вы не можете писать этому пользователю.'
        : eligibility.reason === 'privacy'
          ? 'Пользователь ограничил, кто может ему писать.'
          : 'Отправка сообщений недоступна.';
    return (
      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--line-1)', color: 'var(--text-3)', fontSize: 13, textAlign: 'center', flexShrink: 0 }}>
        {text}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--line-1)', flexShrink: 0 }}>
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
      <Button variant="primary" size="md" icon="send" aria-label="Отправить" disabled={!text.trim()} onClick={submit}>
        {''}
      </Button>
    </div>
  );
}
