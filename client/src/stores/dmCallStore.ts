import { create } from 'zustand';
import type {
  DmCallMediaState,
  DmCallSnapshot,
  PublicUser,
  RtcConfig,
  UserC2S,
} from '@vellin/shared';

/** Как показан звонок: скрыт, свёрнут в полоску или развёрнут на весь экран. */
export type DmCallUiMode = 'hidden' | 'minimized' | 'expanded';

interface IncomingCall {
  call: DmCallSnapshot;
  from: PublicUser;
}

interface DmCallState {
  /** Идущий звонок (дозвон или разговор). null — звонка нет. */
  call: DmCallSnapshot | null;
  /** Собеседник текущего звонка. */
  peer: PublicUser | null;
  /** Входящий, на который ещё не ответили. */
  incoming: IncomingCall | null;
  /** ICE-серверы этого звонка — приходят только соединению, ведущему разговор. */
  rtc: RtcConfig | null;
  /** Идентификатор своего соединения из hello: по нему понятно, наш ли звонок. */
  myConnId: string | null;
  /**
   * Прежние соединения этой вкладки, которые вели идущий звонок. После
   * обрыва связи с сервером вкладка получает новое соединение, а в снимке
   * звонка до ответа на `dmcall_rejoin` остаётся старое. Без этой памяти
   * вкладка на миг считала звонок чужим, выходила из разговора — и выход
   * отправлял серверу отбой: звонок рвался после любой просадки сети.
   */
  ownedConnIds: string[];
  uiMode: DmCallUiMode;
  /** Текст последней ошибки для показа пользователю. */
  error: string | null;
  /** Свой nonce ожидаемого звонка — чтобы не путать с чужими ответами. */
  pendingNonce: string | null;
  /**
   * Ответ уже отправлен, а свой снимок звонка ещё не пришёл. Без этого окно
   * вызова успевало мигнуть: входящий уже снят, а звонок, где мы значимся
   * участником, приходит только следующим сообщением.
   */
  accepting: boolean;

  setMyConnId: (connId: string) => void;
  setSender: (fn: ((msg: UserC2S) => void) | null) => void;
  send: (msg: UserC2S) => void;

  onRing: (call: DmCallSnapshot, from: PublicUser, rtc: RtcConfig) => void;
  onState: (call: DmCallSnapshot, peer: PublicUser, rtc?: RtcConfig) => void;
  onError: (message: string, nonce?: string) => void;
  /** Собеседник включил или выключил микрофон либо камеру. */
  onPeerMedia: (userId: string, media: DmCallMediaState) => void;

  /** Веду ли разговор именно я (эта вкладка), а не другое моё устройство. */
  isMine: () => boolean;

  invite: (toUserId: string, video: boolean) => void;
  accept: (video: boolean) => void;
  decline: () => void;
  hangup: () => void;
  setUiMode: (mode: DmCallUiMode) => void;
  clearError: () => void;
  reset: () => void;

  _send: ((msg: UserC2S) => void) | null;
}

let nonceSeq = 0;

export const useDmCallStore = create<DmCallState>((set, get) => ({
  call: null,
  peer: null,
  incoming: null,
  rtc: null,
  myConnId: null,
  ownedConnIds: [],
  uiMode: 'hidden',
  error: null,
  pendingNonce: null,
  accepting: false,
  _send: null,

  setMyConnId: (connId) =>
    set((s) => {
      // Звонок вела эта вкладка — её прежнее соединение остаётся «своим»,
      // пока звонок не кончится.
      const keep = s.call && s.myConnId && s.isMine() ? [...s.ownedConnIds, s.myConnId] : s.ownedConnIds;
      return { myConnId: connId, ownedConnIds: keep };
    }),
  setSender: (fn) => set({ _send: fn }),
  send: (msg) => get()._send?.(msg),

  onRing: (call, from, rtc) => {
    // Звонок звонит на всех вкладках, но ведёт его та, что ответит.
    set({ incoming: { call, from }, rtc, error: null });
  },

  onState: (call, peer, rtc) => {
    const owned = new Set([get().myConnId, ...get().ownedConnIds]);
    const mine = owned.has(call.callerConnId ?? null) || owned.has(call.calleeConnId ?? null);

    if (call.phase === 'ended') {
      set({
        call: null,
        peer: null,
        incoming: null,
        rtc: null,
        uiMode: 'hidden',
        pendingNonce: null,
        accepting: false,
        ownedConnIds: [],
      });
      return;
    }

    set((s) => ({
      call,
      peer,
      rtc: rtc ?? s.rtc,
      // Ответили на другом устройстве — гасим у себя входящий.
      incoming: call.phase === 'active' && !mine ? null : s.incoming,
      uiMode: mine ? (s.uiMode === 'hidden' ? 'expanded' : s.uiMode) : 'hidden',
      accepting: mine ? false : s.accepting,
    }));
  },

  /**
   * Переключение микрофона и камеры сервер шлёт отдельным сообщением, без
   * нового снимка состояния. Без этого включённая по ходу разговора камера
   * собеседника не появлялась на экране: видео рисуется по флагу из снимка.
   */
  onPeerMedia: (userId, media) => {
    const { call } = get();
    if (!call) return;
    // Только участники: в звонке один на один состояние от кого-то ещё взяться
    // не может, а записанное вслепую попадало в состав звонка.
    if (userId !== call.callerId && userId !== call.calleeId) return;
    set({ call: { ...call, media: { ...call.media, [userId]: media } } });
  },

  onError: (message, nonce) => {
    const { pendingNonce } = get();
    // Ошибка чужой попытки (другая вкладка) нас не касается.
    if (nonce && pendingNonce && nonce !== pendingNonce) return;
    set({
      error: message,
      call: null,
      peer: null,
      rtc: null,
      uiMode: 'hidden',
      pendingNonce: null,
      accepting: false,
      ownedConnIds: [],
    });
  },

  isMine: () => {
    const { call, myConnId, ownedConnIds } = get();
    if (!call || !myConnId) return false;
    const owned = new Set([myConnId, ...ownedConnIds]);
    return owned.has(call.callerConnId ?? '') || owned.has(call.calleeConnId ?? '');
  },

  invite: (toUserId, video) => {
    const nonce = `dmcall_${Date.now()}_${nonceSeq++}`;
    set({ pendingNonce: nonce, error: null });
    get().send({ t: 'dmcall_invite', toUserId, video, nonce });
  },

  accept: (video) => {
    const inc = get().incoming;
    if (!inc) return;
    // Собеседник известен из входящего — показываем его, пока не пришёл снимок
    // звонка: иначе окно на миг осталось бы без имени и лица.
    set({ incoming: null, accepting: true, peer: inc.from });
    get().send({ t: 'dmcall_accept', callId: inc.call.callId, video });
  },

  decline: () => {
    const inc = get().incoming;
    if (!inc) return;
    set({ incoming: null });
    get().send({ t: 'dmcall_decline', callId: inc.call.callId });
  },

  hangup: () => {
    const { call } = get();
    if (!call) return;
    // До ответа это отмена, после — обычный отбой; сервер разберётся сам.
    get().send({ t: 'dmcall_hangup', callId: call.callId });
  },

  setUiMode: (uiMode) => set({ uiMode }),
  clearError: () => set({ error: null }),

  reset: () =>
    set({
      call: null,
      peer: null,
      incoming: null,
      rtc: null,
      uiMode: 'hidden',
      error: null,
      pendingNonce: null,
      accepting: false,
      ownedConnIds: [],
    }),
}));
