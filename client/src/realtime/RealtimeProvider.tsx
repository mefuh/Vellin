import { useEffect, useRef } from 'react';
import type { UserS2C } from '@vellin/shared';
import { useAuthStore } from '../stores/authStore';
import { useDmCallStore } from '../stores/dmCallStore';
import { dmCallMediaBus, dmCallSignalBus, dmCallSpeakingBus } from '../ws/dmCallBuses';
import { useNotificationsStore } from '../stores/notificationsStore';
import { useFriendsStore } from '../stores/friendsStore';
import { usePresenceStore } from '../stores/presenceStore';
import { useLibraryStore } from '../stores/libraryStore';
import { useDmStore } from '../stores/dmStore';
import { useSharedTimeStore } from '../stores/sharedTimeStore';
import { realtimeApi } from '../api/realtime';
import { UserSocket } from '../ws/UserSocket';
import { playDmSound } from '../utils/sound';
import {
  createActivityTracker,
  IDLE_TIMEOUT_MS,
  ROOM_IDLE_TIMEOUT_MS,
  type ActivityPolicy,
  type ActivityTracker,
} from './activityTracker';
import { useRoomStore } from '../stores/roomStore';
import { isMobileDevice } from '../utils/platform';

/**
 * Порог простоя зависит от того, чем занят пользователь:
 * — вне комнаты: минута бездействия и он офлайн;
 * — в комнате, где ничего не играет и нет звонка: пять минут;
 * — в комнате с играющим видео или в звонке: онлайн всегда, простой не считаем
 *   (он смотрит/разговаривает, а мышь при этом трогать незачем).
 */
const activityPolicy = (): ActivityPolicy => {
  const { room, video, myCallState } = useRoomStore.getState();
  if (!room) return { idleMs: IDLE_TIMEOUT_MS, keepAlive: false };
  const keepAlive = video?.status === 'playing' || myCallState === 'in';
  return { idleMs: ROOM_IDLE_TIMEOUT_MS, keepAlive };
};

/**
 * Держит app-wide пользовательский realtime-канал для авторизованного
 * (не гостевого) пользователя и маршрутизирует UserS2C в сторы. Монтируется
 * один раз в App. Гости канал не открывают.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const token = useAuthStore((s) => s.token);
  const isUser = useAuthStore((s) => s.user?.kind === 'user');
  // Сокет создаётся ниже по ходу эффекта, а нужен уже в обработчике hello
  // (возврат в звонок после перезагрузки страницы).
  const socketRef = useRef<UserSocket | null>(null);

  useEffect(() => {
    if (!token || !isUser) return;

    const notifications = useNotificationsStore.getState();
    const friends = useFriendsStore.getState();
    const myId = useAuthStore.getState().user?.id ?? '';

    const onMessage = (msg: UserS2C): void => {
      switch (msg.t) {
        case 'hello':
          notifications.setSnapshot(msg.notifications, msg.unreadCount);
          useDmStore.getState().setUnreadTotal(msg.dmUnreadTotal);
          // Идентификатор соединения нужен звонкам: по нему вкладка понимает,
          // её ли это разговор или он идёт на другом устройстве.
          useDmCallStore.getState().setMyConnId(msg.connId);
          if (msg.activeCall) {
            // Перезагрузили страницу посреди разговора — возвращаемся в него.
            socketRef.current?.send({ t: 'dmcall_rejoin', callId: msg.activeCall.callId });
          }
          for (const p of msg.presence) usePresenceStore.getState().apply(p);
          // Подтягиваем список друзей; presence из снапшота применится после.
          void friends.refresh().then(() => {
            for (const p of msg.presence) useFriendsStore.getState().applyPresence(p);
          });
          break;
        case 'notification':
          notifications.add(msg.notification, msg.unreadCount);
          // Заявки/принятия меняют списки — friends_changed придёт следом, но
          // для надёжности обновляем и здесь.
          if (msg.notification.type !== 'room_invite') void friends.refresh();
          break;
        case 'notifications_removed':
          // Действие отыграно (заявка принята/отклонена/отменена) — убираем
          // отыгранные уведомления из белла, чтобы не засорялись.
          notifications.removeMany(msg.ids, msg.unreadCount);
          break;
        case 'presence':
          usePresenceStore.getState().apply(msg.presence);
          useFriendsStore.getState().applyPresence(msg.presence);
          break;
        case 'room_video':
          useLibraryStore.getState().apply(msg.roomId, msg.videoPoster, msg.videoTitle);
          break;
        case 'shared_time':
          useSharedTimeStore.getState().apply(msg);
          break;
        case 'friends_changed':
          void friends.refresh();
          break;
        case 'dm_message': {
          const dm = useDmStore.getState();
          dm.applyIncoming(msg.message, msg.peer, msg.unreadTotal, myId);
          const incoming = msg.message.senderId !== myId;
          if (incoming) {
            // Звук — если вкладка не в фокусе или открыт другой диалог.
            const active = dm.activePeerId === msg.peer.id && !document.hidden;
            if (!active) playDmSound();
            // Открытый и видимый диалог — сразу помечаем прочитанным.
            if (dm.activePeerId === msg.peer.id && !document.hidden) dm.markRead(msg.peer.id);
          }
          break;
        }
        case 'dm_message_updated':
          // Видео-«кружок» дотранскодирован (processing→ready) — подменяем бабл.
          useDmStore.getState().applyMessageUpdate(msg.message, msg.peer);
          break;
        case 'dm_read':
          useDmStore.getState().applyRead(msg, myId);
          break;
        case 'dm_voice_played':
          useDmStore.getState().applyVoicePlayed(msg.messageId);
          break;
        case 'dm_typing':
          useDmStore.getState().applyTyping(msg.fromUserId, msg.typing, msg.kind);
          break;
        case 'dm_error':
          useDmStore.getState().applyError(msg.nonce);
          break;
        case 'runtime':
          // Живое применение тех.работ: экран-заглушка/запрет выхода админа
          // включаются и снимаются мгновенно, без перезагрузки страницы.
          useAuthStore.getState().setMaintenance(msg.maintenance.enabled, msg.maintenance.message);
          break;

        // ── Звонки в личных сообщениях ──────────────────────────────────
        case 'dmcall_ring':
          useDmCallStore.getState().onRing(msg.call, msg.from, msg.rtc);
          break;
        case 'dmcall_state':
          useDmCallStore.getState().onState(msg.call, msg.peer, msg.rtc);
          break;
        case 'dmcall_signal':
          // Мимо стора: SDP и ICE не должны вызывать перерисовку.
          dmCallSignalBus.emit(msg.fromUserId, msg.payload);
          break;
        case 'dmcall_speaking':
          dmCallSpeakingBus.emit(msg.fromUserId, msg.speaking);
          break;
        case 'dmcall_media': {
          const media = { audio: msg.audio, video: msg.video };
          // В стор — состояние собеседника решает, показывать ли его видео.
          useDmCallStore.getState().onPeerMedia(msg.fromUserId, media);
          dmCallMediaBus.emit(msg.fromUserId, media);
          break;
        }
        case 'dmcall_error':
          useDmCallStore.getState().onError(msg.message, msg.nonce);
          break;

        case 'ping':
          // Keep-alive: на него отвечает сам сокет, здесь делать нечего.
          break;

        default: {
          // Проверка полноты: новый тип сообщения нельзя молча потерять.
          const unhandled: never = msg;
          void unhandled;
          break;
        }
      }
    };

    let activity: ActivityTracker | null = null;

    const socket = new UserSocket({
      getTicket: async () => (await realtimeApi.ticket()).ticket,
      onMessage,
      // После каждого (ре)коннекта переподписываемся на открытый профиль. Небольшая
      // задержка — чтобы сервер успел навесить слушатель сообщений (иначе ранний
      // watch может потеряться в гонке сразу после open).
      onOpen: () =>
        setTimeout(() => {
          usePresenceStore.getState().rewatch();
          useLibraryStore.getState().rewatch();
          // Сервер по умолчанию считает свежее соединение активным — синхронизируем
          // реальным состоянием (важно после реконнекта, если пользователь простаивал).
          if (activity) socket.send({ t: 'activity', active: activity.getActive() });
        }, 250),
    });
    socketRef.current = socket;
    usePresenceStore.getState().setSender((m) => socket.send(m));
    useLibraryStore.getState().setSender((m) => socket.send(m));
    useDmStore.getState().setSender((m) => socket.send(m));
    useDmCallStore.getState().setSender((m) => socket.send(m));
    // На мобильных простой не отслеживаем: открытый сокет = онлайн (как раньше).
    // На тач-устройствах события активности редкие (скролл/тап раз в минуту —
    // это нормальное чтение, а не «ушёл»), а сворачивание/блокировка экрана уже
    // само по себе рвёт сокет и корректно уводит в офлайн через detach().
    let unsubRoom: (() => void) | null = null;
    if (!isMobileDevice()) {
      activity = createActivityTracker(
        (active) => socket.send({ t: 'activity', active }),
        activityPolicy,
      );
      // Политика зависит от комнаты — пересчитываем при её смене (вошёл/вышел,
      // видео заиграло/встало, зашёл/вышел из звонка), а не только по событиям ввода.
      const tracker = activity;
      unsubRoom = useRoomStore.subscribe(() => tracker.refresh());
    }
    void socket.connect();

    return () => {
      socket.close();
      socketRef.current = null;
      unsubRoom?.();
      activity?.stop();
      useNotificationsStore.getState().reset();
      useFriendsStore.getState().reset();
      usePresenceStore.getState().reset();
      useLibraryStore.getState().reset();
      useDmStore.getState().reset();
      useDmCallStore.getState().reset();
      useDmCallStore.getState().setSender(null);
    };
  }, [token, isUser]);

  return children as React.ReactElement;
}
