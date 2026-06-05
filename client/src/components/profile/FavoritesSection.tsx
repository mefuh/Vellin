import { useEffect, useState } from 'react';
import type { FavoriteTitle } from '@vellin/shared';
import { Icon } from '../../shared';
import { titlesApi } from '../../api/titles';
import { ApiHttpError } from '../../api/client';
import { Card } from './ProfilePrimitives';
import { TitlePoster } from './TitlePoster';
import { TitleSearchModal } from './TitleSearchModal';

const MAX = 5;
const POSTER_W = 112;

/** Иконка-кнопка управления (перенос/удаление) под постером. */
function CtrlButton({
  icon,
  title,
  onClick,
  disabled,
  flip,
}: {
  icon: 'chevron' | 'trash';
  title: string;
  onClick: () => void;
  disabled?: boolean;
  flip?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'grid',
        placeItems: 'center',
        width: 28,
        height: 26,
        borderRadius: 7,
        border: '1px solid var(--line-1)',
        background: 'var(--bg-2)',
        color: disabled ? 'var(--text-3)' : 'var(--text-1)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <span style={{ display: 'grid', transform: flip ? 'rotate(180deg)' : undefined }}>
        <Icon name={icon} size={14} />
      </span>
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
      <span style={{ color: 'var(--text-3)' }}>Сохранение…</span>
    ) : status === 'saved' ? (
      <span style={{ color: 'var(--ok)' }}>Сохранено</span>
    ) : status === 'error' ? (
      <span style={{ color: 'var(--accent-hi)' }}>Не удалось сохранить</span>
    ) : null;

  const existingIds = new Set(titles.map((t) => t.kpId));

  return (
    <Card title="Любимое кино" desc="До 5 фильмов и сериалов — ваша визитка вкуса." icon="film">
      <div style={{ minHeight: 20, fontSize: 12.5 }}>{statusEl}</div>

      {loading ? (
        <div style={{ color: 'var(--text-3)', fontSize: 14, padding: '8px 0' }}>Загрузка…</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 18, overflowX: 'auto', paddingBottom: 4 }}>
          {titles.map((t, i) => (
            <div
              key={t.kpId}
              style={{ width: POSTER_W, flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}
            >
              {/* Ранг */}
              <div
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  zIndex: 2,
                  background: 'rgba(0,0,0,0.74)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 6,
                }}
              >
                #{i + 1}
              </div>
              <TitlePoster t={t} />
              {/* margin-top:auto прижимает кнопки к низу — выравнивает их по
                  одной линии при подписях разной длины. */}
              <div style={{ display: 'flex', gap: 5, marginTop: 'auto', paddingTop: 8, justifyContent: 'space-between' }}>
                <CtrlButton icon="chevron" flip title="Левее" disabled={i === 0} onClick={() => move(i, -1)} />
                <CtrlButton icon="trash" title="Убрать" onClick={() => remove(t.kpId)} />
                <CtrlButton icon="chevron" title="Правее" disabled={i === titles.length - 1} onClick={() => move(i, 1)} />
              </div>
            </div>
          ))}

          {titles.length < MAX && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{
                width: POSTER_W,
                flexShrink: 0,
                height: Math.round(POSTER_W * 1.5),
                borderRadius: 10,
                border: '1.5px dashed var(--line-2)',
                background: 'var(--bg-2)',
                color: 'var(--text-2)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontFamily: 'inherit',
                fontSize: 12.5,
              }}
            >
              <Icon name="plus" size={22} />
              Добавить
            </button>
          )}
        </div>
      )}

      {modalOpen && (
        <TitleSearchModal
          existingIds={existingIds}
          full={titles.length >= MAX}
          onPick={add}
          onClose={() => setModalOpen(false)}
        />
      )}
    </Card>
  );
}
