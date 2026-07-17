import { useEffect, useState } from 'react';
import type { GeoBucket, GeoResponse } from '@vellin/shared';
import { adminGeoApi } from '../../api/adminInsights';
import { ApiHttpError } from '../../api/client';
import { AdminPage, AdminSurface, AdminEmpty, StatTile } from './components/AdminPage';

export function AdminGeo() {
  const [data, setData] = useState<GeoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGeoApi.get()
      .then(setData)
      .catch((e) => setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'));
  }, []);

  if (error) return <AdminPage eyebrow="Аналитика" title="География"><AdminSurface><AdminEmpty>{error}</AdminEmpty></AdminSurface></AdminPage>;
  if (!data) return <AdminPage eyebrow="Аналитика" title="География"><AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface></AdminPage>;

  const pct = data.totalUsers > 0 ? Math.round((data.totalWithCity / data.totalUsers) * 1000) / 10 : 0;

  return (
    <AdminPage
      eyebrow="Аналитика · география"
      title="География аудитории"
      glow="rgba(53,208,127,0.14)"
      subtitle="Распределение пользователей по городам и странам (на основе города из профиля). Указан не у всех — карта приблизительная."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatTile label="Всего пользователей" value={data.totalUsers} />
        <StatTile label="Указали город" value={data.totalWithCity} hint={`${pct}% аудитории`} />
        <StatTile label="Стран" value={data.topCountries.length} />
        <StatTile label="Городов" value={data.topCities.length} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <BarSection title="Топ стран" buckets={data.topCountries} />
        <BarSection title="Топ городов" buckets={data.topCities} />
      </div>
    </AdminPage>
  );
}

function BarSection({ title, buckets }: { title: string; buckets: GeoBucket[] }) {
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  return (
    <div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{title}</h3>
      <AdminSurface style={{ padding: buckets.length ? '10px 16px' : 0 }}>
        {buckets.length === 0 ? <AdminEmpty>Нет данных</AdminEmpty> : buckets.map((b) => (
          <div key={b.name} style={{ padding: '7px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
              <span style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.count}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(b.count / max) * 100}%`, background: 'linear-gradient(90deg, var(--accent-lo), var(--accent-hi))', borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </AdminSurface>
    </div>
  );
}
