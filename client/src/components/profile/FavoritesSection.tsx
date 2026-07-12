import { useEffect, useState } from 'react';
import type { FavoriteTitle } from '@vellin/shared';
import { Icon } from '../../shared';
import { titlesApi } from '../../api/titles';
import { ApiHttpError } from '../../api/client';
import { Card } from './ProfilePrimitives';
import { PosterCover } from './ProfileHeroKit';
import { typeLabel } from './TitlePoster';
import { TitleSearchModal } from './TitleSearchModal';

// Пользовательского лимита нет (безлимитное добавление); MAX — только зеркало
// серверного предохранителя от абьюза, чтобы UX не расходился с бэком.
const MAX = 100;

/** Кнопка действия над постером (перенос/удаление). */
function ActBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="hero-press"
      style={{
        width: 36,
        height: 36,
        borderRadius: 11,
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        color: '#fff',
        fontSize: 15,
        background: danger ? 'var(--accent)' : 'rgba(255,255,255,0.18)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function FavoritesSection() {
  const [titles, setTitles] = useState<FavoriteTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    let alive = true;
    titlesApi
      .getFavorites()
      .then((res) => {
        if (alive) setTitles(res.titles);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Оптимистично применяем и сохраняем; при ошибке откатываемся к серверу.
  const persist = async (next: FavoriteTitle[]) => {
    const prev = titles;
    setTitles(next);
    setStatus('saving');
    try {
      const res = await titlesApi.saveFavorites(next);
      setTitles(res.titles);
      setStatus('saved');
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1800);
    } catch (e) {
      setTitles(prev);
      setStatus('error');
      if (!(e instanceof ApiHttpError)) return;
    }
  };

  const add = (t: FavoriteTitle) => {
    if (titles.length >= MAX || titles.some((x) => x.kpId === t.kpId)) return;
    void persist([...titles, t]);
  };
  const remove = (kpId: number) => void persist(titles.filter((t) => t.kpId !== kpId));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= titles.length) return;
    const next = [...titles];
    [next[i], next[j]] = [next[j], next[i]];
    void persist(next);
  };

  const statusEl =
    status === 'saving' ? (
      <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Сохранение…</span>
    ) : status === 'saved' ? (
      <span style={{ fontSize: 12.5, color: 'var(--ok)' }}>Сохранено</span>
    ) : status === 'error' ? (
      <span style={{ fontSize: 12.5, color: 'var(--accent-hi)' }}>Не удалось сохранить</span>
    ) : null;

  const existingIds = new Set(titles.map((t) => t.kpId));

  return (
    <Card
      title="Ваша коллекция"
      desc="Фильмы и сериалы, которые говорят о вас. Наведите на постер, чтобы поменять местами или убрать."
      contained={false}
      headingRight={statusEl}
    >
      {loading ? (
        <div style={{ color: 'var(--text-3)', fontSize: 14, padding: '8px 0' }}>Загрузка…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 20 }}>
          {titles.map((t, i) => (
            <div key={t.kpId} className="fav-card hero-poster">
              <PosterCover
                t={t}
                radius={16}
                topRight={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>#{i + 1}</span>}
              >
                <div
                  className="fav-acts"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: 8,
                    paddingBottom: 14,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.72), transparent 58%)',
                  }}
                >
                  <ActBtn title="Левее" disabled={i === 0} onClick={() => move(i, -1)}>
                    ‹
                  </ActBtn>
                  <ActBtn title="Убрать" danger onClick={() => remove(t.kpId)}>
                    <Icon name="trash" size={14} />
                  </ActBtn>
                  <ActBtn title="Правее" disabled={i === titles.length - 1} onClick={() => move(i, 1)}>
                    ›
                  </ActBtn>
                </div>
              </PosterCover>
              <div style={{ marginTop: 10, fontWeight: 600, fontSize: 14, lineHeight: 1.2, color: 'var(--text-0)' }}>{t.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                {[t.year, typeLabel(t.type)].filter(Boolean).join(' · ')}
                {t.ratingImdb != null && ` · IMDb ${t.ratingImdb.toFixed(1)}`}
              </div>
            </div>
          ))}

          {titles.length < MAX && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="hero-press"
              style={{
                aspectRatio: '2 / 3',
                borderRadius: 16,
                border: '1.5px dashed var(--line-3)',
                background: 'var(--bg-2)',
                color: 'var(--text-2)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Icon name="plus" size={30} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Добавить</span>
            </button>
          )}
        </div>
      )}

      {modalOpen && (
        <TitleSearchModal
          existingIds={existingIds}
          full={titles.length >= MAX}
          onPick={add}
          onRemove={remove}
          onClose={() => setModalOpen(false)}
        />
      )}
    </Card>
  );
}
