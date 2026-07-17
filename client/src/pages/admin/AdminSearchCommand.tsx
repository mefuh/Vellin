import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminSearchResponse } from '@vellin/shared';
import { adminSearchApi } from '../../api/adminInsights';
import { Avatar, Icon } from '../../shared';

/**
 * Глобальный поиск по админке (Cmd/Ctrl+K): пользователь / комната / publicId /
 * email. Результаты ведут в профиль-360 и список комнат. Серверный поиск сам
 * фильтрует секции по правам сотрудника.
 */
export function AdminSearchCommand() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Горячая клавиша Cmd/Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
    else { setQuery(''); setResults(null); }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    setLoading(true);
    const t = window.setTimeout(() => {
      adminSearchApi.search(q)
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(t);
  }, [query]);

  const go = (to: string) => { setOpen(false); navigate(to); };

  if (!open) return null;
  const hasResults = results && (results.users.length > 0 || results.rooms.length > 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1500, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh' }} onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(560px, 92vw)', background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: 'inset 0 0 0 1px var(--glass-bd), var(--shadow-3)', borderRadius: 'var(--r-xl)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line-1)' }}>
          <Icon name="search" size={18} style={{ color: 'var(--text-2)' }} />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: пользователь, комната, email, ID…"
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-0)', fontSize: 16, outline: 'none' }} />
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '2px 6px' }}>ESC</kbd>
        </div>
        <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Поиск…</div>}
          {!loading && query.trim() && !hasResults && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Ничего не найдено</div>}
          {!loading && !query.trim() && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Начните вводить запрос</div>}

          {results && results.users.length > 0 && (
            <Group label="Пользователи">
              {results.users.map((u) => (
                <Row key={u.id} onClick={() => go(`/admin/users/${u.id}`)}>
                  <Avatar seed={u.avatarSeed} src={u.avatarUrl} name={u.username} size={30} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-0)', fontWeight: 500 }}>{u.username}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</span>
                  </span>
                </Row>
              ))}
            </Group>
          )}
          {results && results.rooms.length > 0 && (
            <Group label="Комнаты">
              {results.rooms.map((r) => (
                <Row key={r.id} onClick={() => go('/admin/rooms')}>
                  <Icon name="film" size={18} style={{ color: 'var(--text-2)' }} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-0)', fontWeight: 500 }}>{r.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{r.slug}</span>
                  </span>
                </Row>
              ))}
            </Group>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', padding: '10px 16px 4px' }}>{label}</div>
      {children}
    </div>
  );
}

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '9px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--text-0)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      {children}
    </button>
  );
}
