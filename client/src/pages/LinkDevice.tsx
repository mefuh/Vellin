import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { QrLoginRequestInfo } from '@vellin/shared';
import { Button, VellinLogo } from '../shared';
import { profileApi } from '../api/profile';
import { ApiHttpError } from '../api/client';
import { useAuthStore } from '../stores/authStore';

/**
 * Подтверждение входа десктоп-клиента по QR-коду.
 *
 * Открывается по ссылке из QR (`/link/<requestId>`) — камерой телефона или
 * сканером в разделе «Устройства». Подтвердить может только владелец аккаунта:
 * заявка сама по себе никого не авторизует, она лишь ждёт согласия.
 */
export function LinkDevice() {
  const { requestId = '' } = useParams();
  const user = useAuthStore((s) => s.user);
  const [info, setInfo] = useState<QrLoginRequestInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      setInfo(await profileApi.qrLoginRequest(requestId));
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить заявку');
    }
  }, [requestId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await profileApi.approveQrLogin(requestId);
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось подтвердить вход');
    } finally {
      setBusy(false);
    }
  };

  const wrap = (children: React.ReactNode) => (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'var(--bg-0)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          padding: 28,
          borderRadius: 'var(--r-xl)',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          textAlign: 'center',
        }}
      >
        <VellinLogo />
        {children}
      </div>
    </div>
  );

  if (!user) {
    return wrap(
      <>
        <h1 style={{ margin: 0, fontSize: 20, color: 'var(--text-0)' }}>Нужен вход в аккаунт</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Войдите в Vellin на этом устройстве, чтобы подтвердить вход в приложении на компьютере.
        </p>
        <Link to="/login" style={{ width: '100%' }}>
          <Button style={{ width: '100%' }}>Войти</Button>
        </Link>
      </>,
    );
  }

  if (done) {
    return wrap(
      <>
        <h1 style={{ margin: 0, fontSize: 20, color: 'var(--text-0)' }}>Вход подтверждён</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Приложение на компьютере войдёт в аккаунт через пару секунд. Это окно можно закрыть.
        </p>
      </>,
    );
  }

  const expired = info && (info.status === 'expired' || new Date(info.expiresAt) < new Date());
  const used = info?.status === 'approved';

  return wrap(
    <>
      <h1 style={{ margin: 0, fontSize: 20, color: 'var(--text-0)' }}>Вход в приложение</h1>

      {!info && !error && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}>Загружаем заявку…</p>
      )}

      {info && !expired && !used && (
        <>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>
            Подтвердите вход в аккаунт <b style={{ color: 'var(--text-0)' }}>{user.username}</b> в
            приложении Vellin для Windows. Если это не вы — закройте страницу.
          </p>
          <div
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 'var(--r-md)',
              background: 'var(--bg-2)',
              border: '1px solid var(--line-1)',
              textAlign: 'left',
              fontSize: 12.5,
              color: 'var(--text-2)',
              lineHeight: 1.7,
            }}
          >
            <div>
              Запрос с IP: <span style={{ color: 'var(--text-1)' }}>{info.ip ?? 'неизвестно'}</span>
            </div>
            <div>
              Время:{' '}
              <span style={{ color: 'var(--text-1)' }}>
                {new Date(info.createdAt).toLocaleString('ru-RU')}
              </span>
            </div>
          </div>
          <Button onClick={approve} disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Подтверждаем…' : 'Подтвердить вход'}
          </Button>
        </>
      )}

      {expired && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Срок действия кода истёк. Обновите QR-код в приложении и отсканируйте заново.
        </p>
      )}

      {used && !expired && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Этот код уже использован.
        </p>
      )}

      {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--accent-hi)' }}>{error}</p>}
    </>,
  );
}

export default LinkDevice;
