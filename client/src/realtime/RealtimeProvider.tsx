import { useEffect } from 'react';
import type { UserS2C } from '@vellin/shared';
import { useAuthStore } from '../stores/authStore';
import { useNotificationsStore } from '../stores/notificationsStore';
import { useFriendsStore } from '../stores/friendsStore';
import { realtimeApi } from '../api/realtime';
import { UserSocket } from '../ws/UserSocket';

/**
 * Держит app-wide пользовательский realtime-канал для авторизованного
 * (не гостевого) пользователя и маршрутизирует UserS2C в сторы. Монтируется
 * один раз в App. Гости канал не открывают.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const token = useAuthStore((s) => s.token);
  const isUser = useAuthStore((s) => s.user?.kind === 'user');

  useEffect(() => {
    if (!token || !isUser) return;

    const notifications = useNotificationsStore.getState();
    const friends = useFriendsStore.getState();

    const onMessage = (msg: UserS2C): void => {
      switch (msg.t) {
        case 'hello':
          notifications.setSnapshot(msg.notifications, msg.unreadCount);
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
        case 'presence':
          useFriendsStore.getState().applyPresence(msg.presence);
          break;
        case 'friends_changed':
          void friends.refresh();
          break;
        default:
          break;
      }
    };

    const socket = new UserSocket({
      getTicket: async () => (await realtimeApi.ticket()).ticket,
      onMessage,
    });
    void socket.connect();

    return () => {
      socket.close();
      useNotificationsStore.getState().reset();
      useFriendsStore.getState().reset();
    };
  }, [token, isUser]);

  return children as React.ReactElement;
}
