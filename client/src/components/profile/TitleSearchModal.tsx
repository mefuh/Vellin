import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FavoriteTitle } from '@vellin/shared';
import { Icon } from '../../shared';
import { titlesApi } from '../../api/titles';
import { ApiHttpError } from '../../api/client';
import { TitlePoster } from './TitlePoster';

// Длительность выходной анимации — должна совпадать с keyframes ниже, чтобы
// размонтировать модалку ровно после её проигрывания.
const EXIT_MS = 260;

/**
 * Модалка поиска фильмов/сериалов для добавления в избранное. Дебаунс-запрос к
 * /titles/search, сетка постеров, клик добавляет (если ещё не выбран и есть место).
 * Премиальный вид редизайна: безрамочный поиск, поповер с pop-in/pop-out
 * анимациями, постеры всплывают каскадом. Уважает prefers-reduced-motion.
 */
export function TitleSearchModal({
  existingIds,
  full,
  onPick,
  onRemove,
  onClose,
}: {
  existingIds: Set<number>;
  full: boolean;
  onPick: (t: FavoriteTitle) => void;
  /** Отменить выбор фильма, добавленного в этой сессии (клик по крестику чипа). */
  onRemove?: (kpId: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<FavoriteTitle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [closing, setClosing] = useState(false);
  // Фильмы, выбранные в текущей сессии модалки — показываются чипами под инпутом.
  const [picked, setPicked] = useState<FavoriteTitle[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>();

  // Выбор фильма: очищаем поиск, добавляем в коллекцию и показываем чипом.
  const handlePick = useCallback(
    (t: FavoriteTitle) => {
      onPick(t);
      setPicked((p) => (p.some((x) => x.kpId === t.kpId) ? p : [...p, t]));
      setQ('');
      setItems([]);
      setTouched(false);
      inputRef.current?.focus();
    },
    [onPick],
  );

  // Отмена выбора: убираем из коллекции и из чипов.
  const handleRemove = useCallback(
    (kpId: number) => {
      onRemove?.(kpId);
      setPicked((p) => p.filter((x) => x.kpId !== kpId));
    },
    [onRemove],
  );

  // Запуск выходной анимации → размонтирование после её завершения.
  const requestClose = useCallback(() => {
    setClosing(true);
    exitTimer.current = setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(exitTimer.current);
    };
  }, [requestClose]);

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

  const modal = (
    <div
      onMouseDown={requestClose}
      className="hero-anim"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'color-mix(in srgb, var(--bg-0) 72%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '14vh 20px 20px',
        animation: `${closing ? 'filmOverlayOut' : 'filmOverlayIn'} ${closing ? EXIT_MS / 1000 : 0.3}s ease both`,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Добавить в избранное"
        className="hero-anim"
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 24,
          boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          transformOrigin: 'top center',
          animation: `${closing ? 'heroPopOut' : 'heroPopIn'} ${
            closing ? EXIT_MS / 1000 : 0.4
          }s cubic-bezier(0.22, 1.2, 0.36, 1) both`,
        }}
      >
        {/* Безрамочная строка поиска */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 18px',
            borderBottom: '1px solid var(--line-1)',
          }}
        >
          <span style={{ display: 'grid', placeItems: 'center', color: 'var(--text-3)', flex: 'none' }}>
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Название фильма или сериала…"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-0)',
              fontSize: 16,
              fontWeight: 500,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          {loading && (
            <span
              className="hero-anim"
              style={{
                flex: 'none',
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: '2px solid var(--line-3)',
                borderTopColor: 'var(--accent)',
                animation: 'heroSpin 0.7s linear infinite',
              }}
            />
          )}
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть"
            className="more-btn"
            style={{
              flex: 'none',
              width: 30,
              height: 30,
              borderRadius: 9,
              border: 'none',
              background: 'var(--bg-3)',
              color: 'var(--text-2)',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        {full && (
          <div
            style={{
              padding: '10px 20px',
              fontSize: 12.5,
              color: 'var(--accent-hi)',
              borderBottom: '1px solid var(--line-1)',
              background: 'var(--accent-soft)',
            }}
          >
            Уже выбрано 5 — удалите что-нибудь, чтобы добавить другое.
          </div>
        )}

        {/* Выбранные в этой сессии — овальные чипы (миниатюра · название · ✕) */}
        {picked.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              padding: '14px 20px',
              borderBottom: '1px solid var(--line-1)',
            }}
          >
            {picked.map((t) => (
              <span
                key={t.kpId}
                className="hero-anim"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  paddingRight: 6,
                  paddingLeft: 6,
                  height: 44,
                  borderRadius: 999,
                  background: 'var(--bg-3)',
                  border: '1px solid var(--line-2)',
                  animation: 'heroPopIn 0.35s cubic-bezier(0.22, 1.2, 0.36, 1) both',
                }}
              >
                <span
                  style={{
                    flex: 'none',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: 'var(--bg-1)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {t.posterUrl ? (
                    <img
                      src={t.posterUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <Icon name="film" size={15} />
                  )}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-0)',
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={t.title}
                >
                  {t.title}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(t.kpId)}
                  aria-label={`Отменить выбор «${t.title}»`}
                  className="more-btn"
                  style={{
                    flex: 'none',
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'var(--bg-1)',
                    color: 'var(--text-2)',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Результаты */}
        <div style={{ padding: 20, overflowY: 'auto' }}>
          {error ? (
            <div style={{ padding: '50px 0', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>{error}</div>
          ) : items.length === 0 ? (
            <div style={{ padding: '50px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
              {touched && q.trim().length >= 2 && !loading
                ? 'Ничего не найдено'
                : 'Начните вводить название — мы найдём фильм или сериал.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 16 }}>
              {items.map((t, i) => {
                const added = existingIds.has(t.kpId);
                const disabled = added || full;
                return (
                  <button
                    key={t.kpId}
                    type="button"
                    disabled={disabled}
                    onClick={() => handlePick(t)}
                    data-disabled={disabled ? 'true' : 'false'}
                    className="film-result hero-anim"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: disabled ? 'default' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      opacity: disabled && !added ? 0.4 : 1,
                      position: 'relative',
                      animation: `heroPopIn 0.4s cubic-bezier(0.22, 1.2, 0.36, 1) both`,
                      animationDelay: `${Math.min(i, 12) * 0.03}s`,
                    }}
                  >
                    <TitlePoster t={t} highlight={added} />
                    {added && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          bottom: 36,
                          background: 'color-mix(in srgb, var(--accent) 34%, rgba(0,0,0,0.55))',
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

  return createPortal(modal, document.body);
}
