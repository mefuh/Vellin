import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiHttpError } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { createRoomWithVideo, rememberPendingVideo } from './pendingRoom';
import { parseVideoInput, VIDEO_SOURCES, type VideoSource } from './sources';

/**
 * Поле ссылки — главное действие лэндинга.
 *
 * Вошедший человек получает комнату с этим видео сразу. Гость отправляется на
 * регистрацию, а ссылка ждёт его там же, где он её оставил: после входа она
 * превращается в комнату (см. pendingRoom.ts).
 */
export function LinkField({
  size = 'lg',
  onSourceChange,
}: {
  size?: 'lg' | 'md';
  onSourceChange?: (source: VideoSource | null) => void;
}) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<{ tone: 'warn' | 'info'; text: string } | null>(null);

  const parsed = parseVideoInput(value);
  const source = parsed.source;

  const change = (next: string) => {
    setValue(next);
    setHint(null);
    onSourceChange?.(parseVideoInput(next).source);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (parsed.kind === 'empty') {
      // Кнопка не гаснет на пустом поле — главное действие страницы должно
      // быть видно всегда. Нажатие без ссылки просто ведёт к полю.
      inputRef.current?.focus();
      setHint({ tone: 'info', text: 'Сначала вставьте ссылку на видео — из YouTube, RuTube, VK Видео или прямую.' });
      return;
    }
    if (parsed.kind === 'invalid') {
      setHint({ tone: 'warn', text: 'Это не похоже на ссылку. Скопируйте адрес видео из строки браузера.' });
      return;
    }
    if (parsed.kind === 'magnet') {
      setHint({
        tone: 'info',
        text: 'Magnet-ссылки и торренты открываются уже внутри комнаты: создайте её и вставьте ссылку в плеер.',
      });
      return;
    }
    const url = parsed.url!;
    if (!user) {
      rememberPendingVideo(url.toString());
      navigate('/register?from=link');
      return;
    }
    setBusy(true);
    try {
      navigate(await createRoomWithVideo(url));
    } catch (err) {
      setHint({
        tone: 'warn',
        text: err instanceof ApiHttpError ? err.payload.message : 'Не получилось создать комнату. Попробуйте ещё раз.',
      });
      setBusy(false);
    }
  };

  const ready = parsed.kind !== 'empty';

  return (
    <form onSubmit={submit} className={`vx-linkfield vx-linkfield--${size}`} noValidate>
      <div className="vx-linkfield__box" data-ready={ready || undefined}>
        <LinkGlyph />
        <label htmlFor={inputId} className="vx-sr">
          Ссылка на видео
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="vx-linkfield__input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Вставьте ссылку на видео"
          value={value}
          onChange={(e) => change(e.target.value)}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={hint?.tone === 'warn' || undefined}
        />
        <span className="vx-linkfield__source" data-on={source ? true : undefined} aria-live="polite">
          {source?.label ?? ''}
        </span>
        <button type="submit" className="vx-btn vx-btn--gold vx-linkfield__go" disabled={busy}>
          {busy ? 'Создаём комнату…' : 'Смотреть вместе'}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="vx-linkfield__hint" data-tone={hint.tone} role={hint.tone === 'warn' ? 'alert' : 'status'}>
          {hint.text}
        </p>
      )}
    </form>
  );
}

function LinkGlyph() {
  return (
    <svg className="vx-linkfield__glyph" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M7.6 10.4a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1M10.4 7.6a3 3 0 0 0-4.2 0L3.6 10.2a3 3 0 0 0 4.2 4.2l1-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Лента источников под полем. Бежит медленно и бесконечно; источник,
 * узнанный в поле, загорается золотом — видно, что сайт знает его.
 */
export function SourceMarquee({ active }: { active: VideoSource | null }) {
  const row = VIDEO_SOURCES;
  return (
    <div className="vx-marquee" aria-label={`Работает с: ${row.map((s) => s.label).join(', ')} и ещё около тысячи сайтов`}>
      <div className="vx-marquee__track" aria-hidden="true">
        {[0, 1].map((copy) => (
          <span key={copy} className="vx-marquee__run">
            {row.map((s) => (
              <span key={s.id} className="vx-marquee__item" data-on={active?.id === s.id || undefined}>
                {s.label}
              </span>
            ))}
            <span className="vx-marquee__item vx-marquee__item--more">и ещё около тысячи сайтов</span>
          </span>
        ))}
      </div>
    </div>
  );
}
