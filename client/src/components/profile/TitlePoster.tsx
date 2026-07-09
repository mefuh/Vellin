import type { FavoriteTitle } from '@vellin/shared';
import { Icon } from '../../shared';

const TYPE_LABEL: Record<string, string> = {
  movie: 'Фильм',
  'tv-series': 'Сериал',
  cartoon: 'Мультфильм',
  anime: 'Аниме',
  'animated-series': 'Мультсериал',
  'tv-show': 'Шоу',
};

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? 'Фильм';
}

/** Цвет бейджа рейтинга КП — зелёный/жёлтый/красный по значению. */
function ratingColor(v: number): string {
  return v >= 7 ? '#5ec26a' : v >= 5 ? '#d6b24a' : '#d67a4a';
}

/**
 * Постер фильма/сериала с подписью и рейтингами. Используется в полке избранного,
 * результатах поиска и на публичном профиле.
 */
export function TitlePoster({
  t,
  highlight = false,
}: {
  t: FavoriteTitle;
  /** Обвести постер акцентной рамкой (например «общий» фильм). */
  highlight?: boolean;
}) {
  // Размер задаёт контейнер (грид-ячейка/обёртка фикс. ширины); постер резиновый
  // с соотношением сторон 2:3 — поэтому 5 штук всегда влезают в одну строку.
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '2 / 3',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'var(--bg-3)',
          // Подсветка «общего» фильма — рамкой (внутри border-box), а не внешним
          // box-shadow-кольцом: кольцо обрезается скролл-контейнером полки на
          // мобайле (overflow-x: auto), рамка — никогда.
          border: highlight ? '2px solid var(--accent)' : '1px solid var(--line-1)',
        }}
      >
        {t.posterUrl ? (
          <img
            src={t.posterUrl}
            alt={t.title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-3)' }}>
            <Icon name="film" size={26} />
          </div>
        )}
        {t.ratingKp != null && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              background: 'rgba(0,0,0,0.74)',
              color: ratingColor(t.ratingKp),
              fontWeight: 700,
              fontSize: 11.5,
              padding: '2px 6px',
              borderRadius: 6,
              lineHeight: 1.2,
            }}
          >
            {t.ratingKp.toFixed(1)}
          </div>
        )}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 12.5,
          fontWeight: 600,
          lineHeight: 1.25,
          color: 'var(--text-0)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
        title={t.title}
      >
        {t.title}
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-3)' }}>
        {[t.year, typeLabel(t.type)].filter(Boolean).join(' · ')}
        {t.ratingImdb != null && <span> · IMDb {t.ratingImdb.toFixed(1)}</span>}
      </div>
    </div>
  );
}
