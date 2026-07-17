import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { RuntimeAnnouncement, RuntimeConfig } from '@vellin/shared';
import { runtimeApi } from '../api/adminPlatform';
import { useAuthStore } from '../stores/authStore';
import { Button, Icon, VellinLogo } from '../shared';

/** Страницы, которые остаются доступны в режиме обслуживания — чтобы админ мог
 * войти обратно (сервер пускает администраторов при тех.работах). */
const MAINTENANCE_EXEMPT = new Set(['/login', '/register']);

const DISMISS_KEY = 'vellin.ann.dismissed';

function readDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}
function persistDismissed(ids: Set<string>): void {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

const STYLE_TONE: Record<string, { bg: string; fg: string; bd: string }> = {
  info: { bg: 'var(--glass-bg)', fg: 'var(--text-0)', bd: 'var(--glass-bd)' },
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-hi)', bd: 'rgba(209,39,27,0.25)' },
  warn: { bg: 'rgba(250,204,21,0.10)', fg: 'var(--warn)', bd: 'rgba(250,204,21,0.25)' },
};

/**
 * Глобальный слой рантайм-конфига: тянет /api/runtime и показывает активные
 * объявления (баннеры/модалки) + экран обслуживания для не-администраторов.
 * Закрытие объявлений хранится в localStorage. Сбой запроса — тихо, ничего.
 */
export function RuntimeLayer() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setMaintenance = useAuthStore((s) => s.setMaintenance);
  const setFeatureFlags = useAuthStore((s) => s.setFeatureFlags);
  // Экран обслуживания ведём от live-значений стора: их обновляет и REST-снимок,
  // и WS-пуш «runtime», поэтому тех.работы применяются без перезагрузки.
  const maintenanceActive = useAuthStore((s) => s.maintenanceActive);
  const maintenanceMessage = useAuthStore((s) => s.maintenanceMessage);
  const { pathname } = useLocation();
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());

  useEffect(() => {
    let alive = true;
    runtimeApi.get().then((c) => {
      if (!alive) return;
      setConfig(c);
      setMaintenance(c.maintenance.enabled, c.maintenance.message);
      setFeatureFlags(c.flags);
    }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [token, setMaintenance, setFeatureFlags]);

  // Экран обслуживания — для всех, кроме администраторов. Страницы входа/
  // регистрации не перекрываем: сервер пускает админов при тех.работах, и это
  // единственный способ вернуться, если админ всё же оказался разлогинен.
  if (maintenanceActive && !user?.isAdmin && !MAINTENANCE_EXEMPT.has(pathname)) {
    return <MaintenanceScreen message={maintenanceMessage} />;
  }

  if (!config) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    persistDismissed(next);
  };

  const visible = config.announcements.filter((a) => !dismissed.has(a.id));
  const banners = visible.filter((a) => a.kind === 'banner');
  const modal = visible.find((a) => a.kind === 'modal');

  return (
    <>
      {banners.length > 0 && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 900, display: 'flex', flexDirection: 'column' }}>
          {banners.map((a) => <Banner key={a.id} a={a} onClose={() => dismiss(a.id)} />)}
        </div>
      )}
      {modal && <AnnouncementModal a={modal} onClose={() => dismiss(modal.id)} />}
    </>
  );
}

function Banner({ a, onClose }: { a: RuntimeAnnouncement; onClose: () => void }) {
  const tone = STYLE_TONE[a.style] ?? STYLE_TONE.info;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
      background: tone.bg, color: tone.fg, boxShadow: `inset 0 -1px 0 ${tone.bd}`,
      backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))',
    }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
        <b>{a.title}</b>{a.body ? <span style={{ opacity: 0.85 }}> — {a.body}</span> : null}
      </div>
      {a.ctaLabel && a.ctaUrl && (
        <a href={a.ctaUrl} style={{ color: 'inherit', fontWeight: 600, fontSize: 13, textDecoration: 'underline' }}>{a.ctaLabel}</a>
      )}
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 4, opacity: 0.7 }}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function AnnouncementModal({ a, onClose }: { a: RuntimeAnnouncement; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1300 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: 'inset 0 0 0 1px var(--glass-bd), var(--shadow-3)', borderRadius: 'var(--r-2xl)', padding: 28, width: 'min(440px, 100%)', textAlign: 'center',
      }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{a.title}</h2>
        <p style={{ margin: '12px 0 0', color: 'var(--text-1)', fontSize: 14.5, lineHeight: 1.5 }}>{a.body}</p>
        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'center' }}>
          {a.ctaLabel && a.ctaUrl && <a href={a.ctaUrl} style={{ textDecoration: 'none' }}><Button variant="primary">{a.ctaLabel}</Button></a>}
          <Button variant={a.ctaLabel ? 'ghost' : 'primary'} onClick={onClose}>Понятно</Button>
        </div>
      </div>
    </div>
  );
}

function MaintenanceScreen({ message }: { message: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-0)', color: 'var(--text-0)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24, textAlign: 'center' }}>
      <VellinLogo />
      <div style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: '50%', background: 'rgba(250,204,21,0.12)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="settings" size={28} style={{ color: 'var(--warn)' }} />
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Технические работы</h1>
      <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 15, maxWidth: 420 }}>{message || 'Мы скоро вернёмся. Спасибо за терпение.'}</p>
    </div>
  );
}
