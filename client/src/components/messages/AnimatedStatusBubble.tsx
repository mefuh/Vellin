import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../shared';
import { useElementWidth } from '../../hooks/useElementWidth';
import { useSpringWidth } from '../../hooks/useSpringWidth';
import { AnimatedStatusText } from './AnimatedStatusText';

/** Максимальная ширина пузыря — как раньше, чтобы не съедать всю шапку. */
const MAX_WIDTH = 'min(72vw, 320px)';

/**
 * «Живой» стеклянный пузырь шапки чата (аватар + имя + статус) — по образцу
 * Dynamic Island / Telegram: при смене статуса («в сети» → «печатает…» →
 * «записывает голосовое…» → «был(а) недавно») ширина пузыря не прыгает
 * мгновенно, а плавно перетекает пружиной к новому размеру, а строка статуса
 * мягко кросс-фейдится, не мигая и не размонтируя аватар/имя.
 *
 * Архитектура (см. также {@link AnimatedStatusText}, useSpringWidth,
 * useElementWidth): внутренняя обёртка `inner` всегда рендерится в СВОЙ
 * настоящий (нестеснённый) размер — именно его измеряет ResizeObserver.
 * Внешний `<Link>` — видимый пузырь: `overflow:hidden` + ширина, которую
 * анимирует пружина (императивно через ref, БЕЗ React-ре-рендера на каждый
 * кадр — обновляется только DOM-стиль одного элемента, остальная шапка не
 * перерисовывается и не пересоздаётся).
 */
export function AnimatedStatusBubble({
  to,
  avatarName,
  avatarSeed,
  avatarSrc,
  avatarSize,
  online,
  username,
  statusId,
  statusContent,
  statusColor,
}: {
  to: string;
  avatarName: string;
  avatarSeed?: string;
  avatarSrc?: string | null;
  avatarSize: number;
  online: boolean;
  username: string;
  /** Стабильный идентификатор ВИДА статуса — см. {@link AnimatedStatusText}. */
  statusId: string;
  statusContent: ReactNode;
  statusColor: string;
}): React.ReactElement {
  const outerRef = useRef<HTMLAnchorElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const naturalWidth = useElementWidth(innerRef);

  useSpringWidth(outerRef, naturalWidth);

  return (
    <Link
      ref={outerRef}
      to={to}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        color: 'inherit',
        textDecoration: 'none',
        overflow: 'hidden',
        maxWidth: MAX_WIDTH,
        justifySelf: 'center',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        borderRadius: 999,
        boxShadow: '0 3px 12px rgba(0,0,0,0.32)',
      }}
    >
      <div
        ref={innerRef}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 9,
          padding: '4px 14px 4px 4px',
          // nowrap — принципиально: без этого контент при узкой анимированной
          // ширине пузыря переносился бы на вторую строку вместо того, чтобы
          // обрезаться по overflow:hidden внешнего <Link>.
          whiteSpace: 'nowrap',
        }}
      >
        <Avatar name={avatarName} seed={avatarSeed} src={avatarSrc} size={avatarSize} status={online ? 'online' : 'offline'} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-0)' }}>{username}</div>
          <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 1, color: statusColor }}>
            <AnimatedStatusText id={statusId}>{statusContent}</AnimatedStatusText>
          </div>
        </div>
      </div>
    </Link>
  );
}
