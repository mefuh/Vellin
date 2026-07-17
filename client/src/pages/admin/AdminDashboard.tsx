import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalyticsOverview } from '@vellin/shared';
import { adminAnalyticsApi } from '../../api/adminAnalytics';
import { adminApi } from '../../api/admin';
import { ApiHttpError } from '../../api/client';
import { Button, Chip, Icon, type IconName } from '../../shared';
import { AdminPage, AdminSurface, StatTile } from './components/AdminPage';
import { AreaTrend } from './components/Chart';
import { useAdminAccess } from './AdminAccessContext';

const REFRESH_MS = 15_000;

export function AdminDashboard() {
  const { can } = useAdminAccess();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await adminAnalyticsApi.overview());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить обзор');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <AdminPage
      eyebrow="Центр управления"
      title="Обзор"
      subtitle="Состояние платформы в реальном времени. Обновляется автоматически."
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => void refresh()}>Обновить</Button>
          {can('broadcast.send') && (
            <Button variant="primary" size="sm" icon="bell" onClick={() => setShowBroadcast(true)}>Объявление</Button>
          )}
        </div>
      }
    >
      {error && (
        <div style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', padding: '12px 16px', borderRadius: 'var(--r-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatTile label="Пользователи" value={data ? data.users.total : '—'} hint={data ? `+${data.users.newToday} сегодня` : ''} />
        <StatTile label="Онлайн" value={data ? data.users.online : '—'} accent hint="сейчас на сайте" />
        <StatTile label="Активные комнаты" value={data ? data.rooms.active : '—'} hint={data ? `из ${data.rooms.total} всего` : ''} />
        <StatTile label="Часов вместе" value={data ? data.sharedWatch.totalHours : '—'} hint="совместный просмотр" />
        <StatTile label="Заблокировано" value={data ? data.users.blocked : '—'} />
        <StatTile label="Сообщений" value={data ? data.social.messages : '—'} hint="в комнатах" />
        <StatTile label="Дружбы" value={data ? data.social.friendships : '—'} />
        <StatTile label="Приватных комнат" value={data ? data.rooms.private : '—'} />
      </div>

      {data && (
        <AdminSurface style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              Регистрации · 7 дней · {data.registrations7d.total}
            </div>
            {can('analytics.view') && (
              <Link to="/admin/analytics" style={{ textDecoration: 'none' }}>
                <Button variant="ghost" size="sm" iconRight="arrow">Вся аналитика</Button>
              </Link>
            )}
          </div>
          <AreaTrend points={data.registrations7d.points} height={180} />
        </AdminSurface>
      )}

      {/* Быстрые переходы */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <QuickLink to="/admin/analytics" icon="grid" label="Аналитика" show={can('analytics.view')} />
        <QuickLink to="/admin/users" icon="users" label="Пользователи" show={can('users.view')} />
        <QuickLink to="/admin/rooms" icon="film" label="Комнаты" show={can('rooms.view')} />
        <QuickLink to="/admin/audit" icon="list" label="Журнал аудита" show={can('audit.view')} />
      </div>

      <div style={{ color: 'var(--text-3)', fontSize: 11 }}>
        {data && <>Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU')}</>}
      </div>

      {showBroadcast && <BroadcastModal onClose={() => setShowBroadcast(false)} />}
    </AdminPage>
  );
}

function QuickLink({ to, icon, label, show }: { to: string; icon: IconName; label: string; show: boolean }) {
  if (!show) return null;
  return (
    <Link
      to={to}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', textDecoration: 'none',
        background: 'var(--bg-1)', borderRadius: 'var(--r-lg)', boxShadow: 'inset 0 0 0 1px var(--line-1)',
        color: 'var(--text-0)', fontWeight: 500, fontSize: 14,
      }}
    >
      <Icon name={icon} size={17} style={{ color: 'var(--text-2)' }} />
      {label}
      <Icon name="arrow" size={15} style={{ color: 'var(--text-3)', marginLeft: 'auto' }} />
    </Link>
  );
}

function BroadcastModal({ onClose }: { onClose: () => void }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const r = await adminApi.broadcast(trimmed);
      setResult(`Отправлено в ${r.roomsDelivered} активн${pluralRu(r.roomsDelivered, 'ую', 'ые', 'ых')} комнат${pluralRu(r.roomsDelivered, 'у', 'ы', '')}.`);
      setBody('');
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--bg-1)', boxShadow: 'inset 0 0 0 1px var(--line-2)', borderRadius: 'var(--r-xl)', padding: 24, width: 'min(520px, 100%)', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Системное объявление</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>
          Сообщение появится в чате всех активных комнат. Будет помечено как системное.
        </p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder="Например: техобслуживание начнётся в 22:00 МСК"
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: 12, color: 'var(--text-0)', fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
        />
        <div style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'right' }}>{body.length}/1000</div>
        {result && <Chip tone="success">{result}</Chip>}
        {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" icon="send" disabled={sending || !body.trim()} onClick={() => void send()}>Отправить</Button>
        </div>
      </div>
    </div>
  );
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}
