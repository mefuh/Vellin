import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PushAnalyticsResponse } from '@vellin/shared';
import { adminPushAnalyticsApi } from '../../api/adminInsights';
import { ApiHttpError } from '../../api/client';
import { Button } from '../../shared';
import { AdminPage, AdminSurface, AdminEmpty, StatTile } from './components/AdminPage';

export function AdminPushAnalytics() {
  const navigate = useNavigate();
  const [data, setData] = useState<PushAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminPushAnalyticsApi.get()
      .then(setData)
      .catch((e) => setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'));
  }, []);

  const back = <Button variant="ghost" size="sm" icon="arrow" onClick={() => navigate('/admin/push')}>К рассылкам</Button>;

  if (error) return <AdminPage eyebrow="Push" title="Аналитика" actions={back}><AdminSurface><AdminEmpty>{error}</AdminEmpty></AdminSurface></AdminPage>;
  if (!data) return <AdminPage eyebrow="Push" title="Аналитика" actions={back}><AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface></AdminPage>;

  const maxHour = data.byHour.reduce((m, c) => Math.max(m, c.count), 0) || 1;
  const maxBrowser = data.byBrowser.reduce((m, b) => Math.max(m, b.sent), 0) || 1;

  return (
    <AdminPage
      eyebrow={`Push · последние ${data.windowDays} дней`}
      title="Аналитика уведомлений"
      glow="rgba(53,208,127,0.14)"
      actions={back}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatTile label="Отправлено" value={data.totalSent} />
        <StatTile label="Открыто" value={data.totalClicked} />
        <StatTile label="CTR" value={`${data.ctr}%`} accent />
      </div>

      {/* Тепловая карта по часам */}
      <div>
        <SectionH>Отправки по часам суток</SectionH>
        <AdminSurface style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 3 }}>
            {data.byHour.map((c) => {
              const intensity = c.count / maxHour;
              return (
                <div key={c.hour} title={`${c.hour}:00 — ${c.count}`} style={{
                  aspectRatio: '1', borderRadius: 4,
                  background: intensity === 0 ? 'var(--bg-3)' : `rgba(209,39,27,${0.15 + intensity * 0.75})`,
                }} />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
            <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
          </div>
        </AdminSurface>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* Эффективность шаблонов */}
        <div>
          <SectionH>Эффективность по типам</SectionH>
          <AdminSurface>
            {data.byType.length === 0 ? <AdminEmpty>Нет данных</AdminEmpty> : data.byType.map((t) => (
              <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-1)' }}>{t.type}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.sent} отпр.</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: t.ctr >= 10 ? 'var(--ok)' : 'var(--text-2)', minWidth: 56, textAlign: 'right' }}>CTR {t.ctr}%</span>
              </div>
            ))}
          </AdminSurface>
        </div>

        {/* Браузеры */}
        <div>
          <SectionH>Браузеры</SectionH>
          <AdminSurface style={{ padding: data.byBrowser.length ? '10px 16px' : 0 }}>
            {data.byBrowser.length === 0 ? <AdminEmpty>Нет данных</AdminEmpty> : data.byBrowser.map((b) => (
              <div key={b.browser} style={{ padding: '7px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-1)' }}>{b.browser}</span>
                  <span style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.sent}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(b.sent / maxBrowser) * 100}%`, background: 'linear-gradient(90deg, var(--accent-lo), var(--accent-hi))' }} />
                </div>
              </div>
            ))}
          </AdminSurface>
        </div>
      </div>
    </AdminPage>
  );
}

function SectionH({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{children}</h3>;
}
