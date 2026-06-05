import { useEffect, useRef, useState } from 'react';
import type { FavoriteTitle } from '@vellin/shared';
import { Icon } from '../../shared';
import { titlesApi } from '../../api/titles';
import { ApiHttpError } from '../../api/client';
import { TitlePoster } from './TitlePoster';

/**
 * Модалка поиска фильмов/сериалов для добавления в избранное. Дебаунс-запрос к
 * /titles/search, сетка постеров, клик добавляет (если ещё не выбран и есть место).
 */
export function TitleSearchModal({
  existingIds,
  full,
  onPick,
  onClose,
}: {
  existingIds: Set<number>;
  full: boolean;
  onPick: (t: FavoriteTitle) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<FavoriteTitle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setTouched(true);
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await titlesApi.search(query, ctrl.signal);
        setItems(res.titles);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError(e instanceof ApiHttpError ? e.payload.message : 'Поиск недоступен');
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(id);
    };
  }, [q]);

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.62)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '7vh 16px 16px',
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-lg)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Шапка с поиском */}
        <div style={{ padding: 16, borderBottom: '1px solid var(--line-1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>Добавить в избранное</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 4 }}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}>
              <Icon name="search" size={16} />
            </span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Название фильма или сериала"
              style={{
                width: '100%',
                height: 42,
                padding: '0 14px 0 36px',
                background: 'var(--bg-2)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-md)',
                color: 'var(--text-0)',
                fontSize: 14,
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {full && (
            <div style={{ fontSize: 12.5, color: 'var(--accent-hi)' }}>
              Уже выбрано 5 — удалите что-нибудь, чтобы добавить другое.
            </div>
          )}
        </div>

        {/* Результаты */}
        <div style={{ padding: 16, overflowY: 'auto' }}>
          {error ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>{error}</div>
          ) : loading && items.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>Поиск…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
              {touched && q.trim().length >= 2 ? 'Ничего не найдено' : 'Начните вводить название'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 14 }}>
              {items.map((t) => {
                const added = existingIds.has(t.kpId);
                const disabled = added || full;
                return (
                  <button
                    key={t.kpId}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(t)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: disabled ? 'default' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      opacity: disabled && !added ? 0.4 : 1,
                      position: 'relative',
                    }}
                  >
                    <TitlePoster t={t} />
                    {added && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          bottom: 36,
                          background: 'rgba(0,0,0,0.5)',
                          borderRadius: 10,
                          display: 'grid',
                          placeItems: 'center',
                          color: '#fff',
                        }}
                      >
                        <Icon name="check" size={26} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
