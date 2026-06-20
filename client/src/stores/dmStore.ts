import { create } from 'zustand';
import type {
  DirectMessageDTO,
  DmConversation,
  DmEligibility,
  Gender,
  PublicUser,
  UserC2S,
} from '@vellin/shared';

/** Сообщение с клиентскими флагами оптимистичной отправки. */
export interface ClientDm extends DirectMessageDTO {
  /** Ещё не подтверждено сервером (оптимистично добавлено). */
  pending?: boolean;
  /** Отправка не удалась. */
  failed?: boolean;
}

/** Состояние одного открытого диалога (по id собеседника). */
export interface ThreadState {
  peer: PublicUser;
  conversationId: string;
  messages: ClientDm[];
  hasMore: boolean;
  /** Когда собеседник прочитал переписку (ISO) — для «галочек». */
  peerLastReadAt: string | null;
  online: boolean;
  /** Время последнего захода собеседника (ISO, начальное; live — из presence). */
  lastSeenAt: string | null;
  /** Пол собеседника — для грамматики «был/была в сети». */
  gender: Gender | null;
  eligibility: DmEligibility;
  loading: boolean;
  loaded: boolean;
}

const TYPING_TTL_MS = 6000;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface DmState {
  conversations: DmConversation[];
  unreadTotal: number;
  threads: Record<string, ThreadState>;
  /** peerId → момент истечения «печатает…». */
  typing: Record<string, number>;
  /** Открытый сейчас диалог (для пометки прочтения и звука). */
  activePeerId: string | null;
  _send: ((msg: UserC2S) => void) | null;

  setSender: (fn: ((msg: UserC2S) => void) | null) => void;
  setConversations: (list: DmConversation[], unreadTotal: number) => void;
  setUnreadTotal: (n: number) => void;
  setThread: (peerId: string, t: ThreadState) => void;
  patchThread: (peerId: string, patch: Partial<ThreadState>) => void;
  prependMessages: (peerId: string, older: DirectMessageDTO[], hasMore: boolean) => void;
  setActivePeer: (peerId: string | null) => void;

  /** Оптимистично отправить ЛС (текст и/или изображение). */
  send: (peer: PublicUser, body: string, image?: { url: string; width: number; height: number }) => void;
  /** Входящее/эхо сообщение из WS. */
  applyIncoming: (message: DirectMessageDTO, peer: PublicUser, unreadTotal: number, myId: string) => void;
  /** Ошибка отправки по nonce. */
  applyError: (nonce: string | undefined) => void;
  /** Кто-то прочитал (своё эхо или собеседник). */
  applyRead: (
    payload: { conversationId: string; byUserId: string; readAt: string; unreadTotal?: number },
    myId: string,
  ) => void;
  applyTyping: (fromUserId: string, typing: boolean) => void;
  /** Открыли диалог — отметить прочитанным (оптимистично + сигнал серверу). */
  markRead: (peerId: string) => void;
  sendTyping: (peerId: string, typing: boolean) => void;

  reset: () => void;
}

/** Вставка/перемещение диалога в начало списка по новому сообщению. */
function bumpConversation(
  list: DmConversation[],
  peer: PublicUser,
  message: DirectMessageDTO,
  conversationId: string,
  unreadDelta: number,
): DmConversation[] {
  const idx = list.findIndex((c) => c.peer.id === peer.id);
  const last = {
    body: message.body,
    senderId: message.senderId,
    createdAt: message.createdAt,
    hasImage: !!message.imageUrl,
  };
  if (idx === -1) {
    return [
      {
        id: conversationId,
        peer,
        lastMessage: last,
        unreadCount: Math.max(0, unreadDelta),
        peerLastReadAt: null,
        online: false,
        lastMessageAt: message.createdAt,
      },
      ...list,
    ];
  }
  const existing = list[idx];
  const updated: DmConversation = {
    ...existing,
    id: conversationId || existing.id,
    lastMessage: last,
    lastMessageAt: message.createdAt,
    unreadCount: Math.max(0, existing.unreadCount + unreadDelta),
  };
  return [updated, ...list.slice(0, idx), ...list.slice(idx + 1)];
}

export const useDmStore = create<DmState>((set, get) => ({
  conversations: [],
  unreadTotal: 0,
  threads: {},
  typing: {},
  activePeerId: null,
  _send: null,

  setSender: (fn) => set({ _send: fn }),

  setConversations: (conversations, unreadTotal) => set({ conversations, unreadTotal }),
  setUnreadTotal: (unreadTotal) => set({ unreadTotal }),

  setThread: (peerId, t) => set((s) => ({ threads: { ...s.threads, [peerId]: t } })),

  patchThread: (peerId, patch) =>
    set((s) => {
      const cur = s.threads[peerId];
      if (!cur) return s;
      return { threads: { ...s.threads, [peerId]: { ...cur, ...patch } } };
    }),

  prependMessages: (peerId, older, hasMore) =>
    set((s) => {
      const cur = s.threads[peerId];
      if (!cur) return s;
      const known = new Set(cur.messages.map((m) => m.id));
      const add = older.filter((m) => !known.has(m.id));
      return { threads: { ...s.threads, [peerId]: { ...cur, messages: [...add, ...cur.messages], hasMore } } };
    }),

  setActivePeer: (activePeerId) => set({ activePeerId }),

  send: (peer, body, image) => {
    const text = body.trim();
    if (!text && !image) return;
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ClientDm = {
      id: nonce,
      conversationId: get().threads[peer.id]?.conversationId ?? '',
      senderId: 'me', // плейсхолдер; реальный senderId придёт с эхом
      body: text,
      createdAt: new Date().toISOString(),
      ...(image ? { imageUrl: image.url, imageWidth: image.width, imageHeight: image.height } : {}),
      nonce,
      pending: true,
    };
    set((s) => {
      const cur = s.threads[peer.id];
      const thread: ThreadState = cur
        ? { ...cur, messages: [...cur.messages, optimistic] }
        : {
            peer,
            conversationId: '',
            messages: [optimistic],
            hasMore: false,
            peerLastReadAt: null,
            online: false,
            lastSeenAt: null,
            gender: null,
            eligibility: { canMessage: true, reason: 'ok' },
            loading: false,
            loaded: true,
          };
      return { threads: { ...s.threads, [peer.id]: thread } };
    });
    get()._send?.({
      t: 'dm_send',
      toUserId: peer.id,
      body: text,
      nonce,
      ...(image ? { imageUrl: image.url, imageWidth: image.width, imageHeight: image.height } : {}),
    });
  },

  applyIncoming: (message, peer, unreadTotal, myId) =>
    set((s) => {
      const peerId = peer.id;
      const cur = s.threads[peerId];
      const isMine = message.senderId === myId;
      let messages: ClientDm[];
      if (cur) {
        // Сопоставить эхо своей оптимистичной отправки по nonce.
        if (message.nonce && cur.messages.some((m) => m.nonce === message.nonce)) {
          messages = cur.messages.map((m) => (m.nonce === message.nonce ? { ...message } : m));
        } else if (cur.messages.some((m) => m.id === message.id)) {
          messages = cur.messages; // дубль
        } else {
          messages = [...cur.messages, message];
        }
      } else {
        messages = [message];
      }
      const threads = cur
        ? {
            ...s.threads,
            // Подхватываем реальный conversationId (для новых диалогов он был '').
            [peerId]: { ...cur, conversationId: message.conversationId || cur.conversationId, messages },
          }
        : s.threads;
      // Непрочитанные в списке: +1 только если входящее и не открыт активный диалог.
      const isActive = s.activePeerId === peerId;
      const unreadDelta = !isMine && !isActive ? 1 : 0;
      return {
        threads,
        conversations: bumpConversation(s.conversations, peer, message, message.conversationId, unreadDelta),
        unreadTotal,
      };
    }),

  applyError: (nonce) =>
    set((s) => {
      if (!nonce) return s;
      const threads = { ...s.threads };
      for (const [pid, t] of Object.entries(threads)) {
        if (t.messages.some((m) => m.nonce === nonce)) {
          threads[pid] = {
            ...t,
            messages: t.messages.map((m) => (m.nonce === nonce ? { ...m, pending: false, failed: true } : m)),
          };
        }
      }
      return { threads };
    }),

  applyRead: (payload, myId) =>
    set((s) => {
      if (payload.byUserId === myId) {
        // Своё прочтение (с другой вкладки) — сбросить непрочитанные диалога + бейдж.
        const conversations = s.conversations.map((c) =>
          c.id === payload.conversationId ? { ...c, unreadCount: 0 } : c,
        );
        return {
          conversations,
          unreadTotal: payload.unreadTotal ?? s.unreadTotal,
        };
      }
      // Собеседник (= byUserId) прочитал мои сообщения — обновить «галочки»
      // и в открытом треде, и в списке диалогов. Ищем по id собеседника
      // (ключ треда / peer.id), надёжно даже для только что созданного диалога.
      const t = s.threads[payload.byUserId];
      const conversations = s.conversations.map((c) =>
        c.peer.id === payload.byUserId ? { ...c, peerLastReadAt: payload.readAt } : c,
      );
      return {
        conversations,
        threads: t
          ? { ...s.threads, [payload.byUserId]: { ...t, peerLastReadAt: payload.readAt } }
          : s.threads,
      };
    }),

  applyTyping: (fromUserId, typing) => {
    const prev = typingTimers.get(fromUserId);
    if (prev) clearTimeout(prev);
    if (typing) {
      set((s) => ({ typing: { ...s.typing, [fromUserId]: Date.now() + TYPING_TTL_MS } }));
      typingTimers.set(
        fromUserId,
        setTimeout(() => {
          typingTimers.delete(fromUserId);
          set((s) => {
            const next = { ...s.typing };
            delete next[fromUserId];
            return { typing: next };
          });
        }, TYPING_TTL_MS),
      );
    } else {
      typingTimers.delete(fromUserId);
      set((s) => {
        const next = { ...s.typing };
        delete next[fromUserId];
        return { typing: next };
      });
    }
  },

  markRead: (peerId) => {
    const conv = get().conversations.find((c) => c.peer.id === peerId);
    const had = conv?.unreadCount ?? 0;
    if (had > 0) {
      set((s) => ({
        conversations: s.conversations.map((c) => (c.peer.id === peerId ? { ...c, unreadCount: 0 } : c)),
        unreadTotal: Math.max(0, s.unreadTotal - had),
      }));
    }
    get()._send?.({ t: 'dm_read', peerId });
  },

  sendTyping: (peerId, typing) => {
    get()._send?.({ t: 'dm_typing', toUserId: peerId, typing });
  },

  reset: () => {
    for (const t of typingTimers.values()) clearTimeout(t);
    typingTimers.clear();
    set({ conversations: [], unreadTotal: 0, threads: {}, typing: {}, activePeerId: null, _send: null });
  },
}));
