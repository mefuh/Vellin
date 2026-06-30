import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { PUSH_CATEGORIES, type PushCategory } from '@vellin/shared';
import { Button, Icon } from '../shared';
import { AppHeader } from '../components/AppHeader';
import { useAuthStore } from '../stores/authStore';
import { usePushStore } from '../stores/pushStore';
import { useIsMobile } from '../hooks/useMediaQuery';
import { pushApi } from '../api/push';

/** Аккуратный переключатель (нет общего примитива — делаем локальный). */
function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 44,
        height: 26,
        flexShrink: 0,
        borderRadius: 999,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--accent)' : 'var(--bg-4)',
        opacity: disabled ? 0.5 : 1,
        transition: 'background .2s ease',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: 20,
          height: 20,
          borderRadius: 999,
          background: '#fff',
          transform: checked ? 'translateX(18px)' : 'translateX(0)',
          transition: 'transform .22s cubic-bezier(.22,1,.36,1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'var(--bg-1)',
        border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-md)',
      }}
    >
      {children}
    </div>
  );
}

export function NotificationSettings(): React.ReactElement {
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();

  const supported = usePushStore((s) => s.supported);
  const permission = usePushStore((s) => s.permission);
  const subscribed = usePushStore((s) => s.subscribed);
  const preferences = usePushStore((s) => s.preferences);
  const busy = usePushStore((s) => s.busy);
  const loaded = usePushStore((s) => s.loaded);
  const lastError = usePushStore((s) => s.lastError);
  const refresh = usePushStore((s) => s.refresh);
  const enable = usePushStore((s) => s.enable);
  const disable = usePushStore((s) => s.disable);
  const setPushEnabled = usePushStore((s) => s.setPushEnabled);
  const toggleCategory = usePushStore((s) => s.toggleCategory);

  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (user && user.kind === 'guest') return <Navigate to="/library" replace />;
  if (!user) return <Navigate to="/login" replace />;

  const pushOn = !!preferences?.pushEnabled && subscribed && permission === 'granted';
  const categoriesDisabled = !pushOn;

  const onTest = async (): Promise<void> => {
    setTestMsg(null);
    try {
      const { sent } = await pushApi.test();
      setTestMsg(sent > 0 ? `Отправлено на устройств: ${sent}` : 'Нет активных устройств для отправки');
    } catch {
      setTestMsg('Не удалось отправить');
    }
  };

  const statusBlock = (() => {
    if (!supported) {
      return (
        <Row>
          <Icon name="bell" size={18} style={{ color: 'var(--text-2)' }} />
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            Этот браузер не поддерживает push-уведомления. На iOS добавьте приложение на экран «Домой».
          </div>
        </Row>
      );
    }
    if (permission === 'denied') {
      return (
        <Row>
          <Icon name="bell" size={18} style={{ color: 'var(--danger, #e5484d)' }} />
          <div style={{ fontSize: 13, color: 'var(--text-2)', flex: 1 }}>
            Уведомления заблокированы в настройках браузера. Разрешите их для этого сайта и обновите страницу.
          </div>
        </Row>
      );
    }
    return (
      <Row>
        <Icon name="bell" size={18} style={{ color: pushOn ? 'var(--accent-hi)' : 'var(--text-2)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>Push на этом устройстве</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
            {pushOn ? 'Включены' : permission === 'granted' ? 'Выключены' : 'Требуется разрешение'}
          </div>
        </div>
        {pushOn ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disable()}>
            Отключить
          </Button>
        ) : (
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void enable()}>
            {busy ? 'Включаем…' : permission === 'granted' ? 'Включить' : 'Разрешить'}
          </Button>
        )}
      </Row>
    );
  })();

  const body = (
    <>
      <h1 style={{ fontSize: isMobile ? 24 : 28, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>
        Уведомления
      </h1>

      {statusBlock}

      {lastError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-md)',
            background: 'rgba(229,72,77,0.12)',
            border: '1px solid rgba(229,72,77,0.4)',
            color: 'var(--text-1)',
            fontSize: 12.5,
            lineHeight: 1.45,
          }}
        >
          {lastError}
        </div>
      )}

      {/* Главный выключатель (серверный) — глушит все push сразу. */}
      {supported && permission === 'granted' && (
        <Row>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>Все push-уведомления</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
              Главный выключатель для всех категорий
            </div>
          </div>
          <Toggle
            label="Все push-уведомления"
            checked={!!preferences?.pushEnabled}
            disabled={busy || !loaded}
            onChange={(v) => void setPushEnabled(v)}
          />
        </Row>
      )}

      {/* Категории. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', padding: '4px 2px' }}>Категории</div>
        {PUSH_CATEGORIES.map((c) => (
          <Row key={c.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--text-0)' }}>{c.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{c.hint}</div>
            </div>
            <Toggle
              label={c.label}
              checked={preferences ? preferences.categories[c.id as PushCategory] !== false : true}
              disabled={categoriesDisabled}
              onChange={(v) => void toggleCategory(c.id, v)}
            />
          </Row>
        ))}
      </div>

      {/* Тест. */}
      {pushOn && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button size="sm" variant="secondary" onClick={() => void onTest()}>
            Отправить тестовое
          </Button>
          {testMsg && <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{testMsg}</span>}
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <div style={{ height: '100svh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)', color: 'var(--text-0)' }}>
        <AppHeader />
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 14px 104px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {body}
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg-0)', color: 'var(--text-0)' }}>
      <AppHeader />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '36px max(24px, 4vw) 80px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {body}
      </div>
    </div>
  );
}
