import { useCallback, useEffect, useState } from 'react';
import type { AdminStatsResponse } from '@vellin/shared';
import { adminApi } from '../../api/admin';
import { ApiHttpError } from '../../api/client';
import { Button, Chip, Icon, type IconName } from '../../shared';
import { useIsNarrow } from '../../hooks/useMediaQuery';

const REFRESH_MS = 10_000;

export function AdminDashboard() {
  const isNarrow = useIsNarrow();
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await adminApi.stats();
      setStats(data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить статистику');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: isNarrow ? 22 : 28, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Обзор
          </h1>
          <p style={{ marginTop: 6, color: 'var(--text-1)', fontSize: 13 }}>
            Состояние сервиса в реальном времени. Обновляется каждые 10 секунд.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" icon="refresh" size={isNarrow ? 'sm' : undefined} onClick={() => void refresh()}>
            Обновить
          </Button>
          <Button variant="primary" icon="bell" size={isNarrow ? 'sm' : undefined} onClick={() => setShowBroadcast(true)}>
            Объявление
          </Button>
        </div>
      </header>

      {error && (
        <div
          style={{
            background: 'rgba(209,39,27,0.12)',
            color: 'var(--accent-hi)',
            padding: '12px 16px',
            borderRadius: 'var(--r-md)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          display: 'grid',
          // На узком экране минимум 140px — две карточки умещаются в ряд
          // даже на 320px viewport.
          gridTemplateColumns: `repeat(auto-fill, minmax(${isNarrow ? 140 : 220}px, 1fr))`,
          gap: isNarrow ? 10 : 14,
        }}
      >
        <StatCard
          icon="users"
          label="Всего пользователей"
          value={stats ? stats.users.total : '—'}
          hint={stats ? `${stats.users.blocked} заблокировано` : ''}
        />
        <StatCard
          icon="waveform"
          label="Сейчас онлайн"
          value={stats ? stats.users.online : '—'}
          hint="уникальные WS-сессии"
          tone="ok"
        />
        <StatCard
          icon="film"
          label="Всего комнат"
          value={stats ? stats.rooms.total : '—'}
          hint={stats ? `${stats.rooms.private} приватных` : ''}
        />
        <StatCard
          icon="flame"
          label="Активные комнаты"
          value={stats ? stats.rooms.active : '—'}
          hint="есть участники сейчас"
          tone="accent"
        />
      </section>

      <footer style={{ color: 'var(--text-3)', fontSize: 11 }}>
        {stats && (
          <>Время сервера: {new Date(stats.serverTime).toLocaleString('ru-RU')}</>
        )}
      </footer>

      {showBroadcast && <BroadcastModal onClose={() => setShowBroadcast(false)} />}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: IconName;
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'accent' | 'ok';
}) {
  const accent =
    tone === 'accent' ? 'var(--accent-hi)' : tone === 'ok' ? 'var(--ok)' : 'var(--text-1)';
  return (
    <article
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--r-lg)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-2)', fontSize: 12, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <Icon name={icon} size={16} style={{ color: accent }} />
      </div>
      <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: accent }}>
        {value}
      </div>
      {hint && <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{hint}</div>}
    </article>
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
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-lg)',
          padding: 24,
          width: 'min(520px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Системное объявление</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-2)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
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
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--r-md)',
            padding: 12,
            color: 'var(--text-0)',
            fontFamily: 'inherit',
            fontSize: 14,
            resize: 'vertical',
          }}
        />
        <div style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'right' }}>
          {body.length}/1000
        </div>
        {result && <Chip tone="success">{result}</Chip>}
        {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            icon="send"
            disabled={sending || !body.trim()}
            onClick={() => void send()}
          >
            Отправить
          </Button>
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
