import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useDmStore } from '../stores/dmStore';
import { usePushStore } from '../stores/pushStore';
import { pushSupported, syncSubscription } from './register';

/**
 * Невидимый мост Web-Push ↔ приложение. Для авторизованного пользователя:
 *  1) тихо ре-синхронизирует подписку и подтягивает статус в pushStore;
 *  2) слушает сообщения от Service Worker — deep-link навигация по клику на push
 *     (vellin:navigate) и пере-подписка (vellin:resubscribe);
 *  3) репортит фокус (открытый диалог + видимость вкладки) на сервер, чтобы он
 *     не слал push о ЛС, когда пользователь уже читает этот диалог.
 */
export function PushBridge(): null {
  const navigate = useNavigate();
  const isUser = useAuthStore((s) => s.user?.kind === 'user');

  useEffect(() => {
    if (!isUser) return;
    void usePushStore.getState().refresh();
    if (pushSupported()) void syncSubscription();

    const onSwMessage = (e: MessageEvent): void => {
      const data = e.data as { type?: string; url?: string } | undefined;
      if (!data) return;
      if (data.type === 'vellin:navigate' && typeof data.url === 'string') {
        // Абсолютный URL → относительный путь для react-router.
        try {
          const u = new URL(data.url, location.origin);
          navigate(u.pathname + u.search);
        } catch {
          /* ignore */
        }
      } else if (data.type === 'vellin:resubscribe') {
        void syncSubscription();
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }

    // Репорт фокуса: при смене активного диалога / видимости вкладки.
    let lastSent = '';
    const reportFocus = (): void => {
      const dm = useDmStore.getState();
      const peerId = dm.activePeerId;
      const convId = peerId ? dm.threads[peerId]?.conversationId ?? null : null;
      const visible = document.visibilityState === 'visible';
      const key = `${convId}|${visible}`;
      if (key === lastSent) return;
      lastSent = key;
      dm.reportFocus(convId, visible);
    };
    const unsub = useDmStore.subscribe(reportFocus);
    document.addEventListener('visibilitychange', reportFocus);
    reportFocus();

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
      document.removeEventListener('visibilitychange', reportFocus);
      unsub();
    };
  }, [isUser, navigate]);

  return null;
}
