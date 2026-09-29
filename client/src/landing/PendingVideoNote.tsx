import { useMemo } from 'react';
import { peekPendingVideo } from './pendingRoom';

/**
 * Напоминание на входе и регистрации: ссылка, вставленная на лэндинге, не
 * потерялась — после входа сразу откроется комната с этим видео.
 */
export function PendingVideoNote({ after }: { after: 'входа' | 'регистрации' }) {
  const host = useMemo(() => {
    const raw = peekPendingVideo();
    if (!raw) return null;
    try {
      return new URL(raw).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }, []);
  if (!host) return null;
  return (
    <p className="vx-auth__carry">
      {/* Неразрывный пробел держит тире на строке с текстом: иначе перенос
          начинал вторую строку с «— youtube.com». */}
      После {after} сразу откроем комнату с этим видео&nbsp;— <b>{host}</b>
    </p>
  );
}
