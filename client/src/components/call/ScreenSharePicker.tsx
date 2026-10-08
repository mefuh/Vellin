import { useState } from 'react';
import {
  SCREEN_FPS,
  SCREEN_RESOLUTIONS,
  type ScreenShareOptions,
  type ScreenSurface,
} from '../../hooks/screenShare';
import { Segmented, SettingRow } from './CallBits';

export interface ScreenSharePick {
  surface: ScreenSurface;
  options: ScreenShareOptions;
  showPreview: boolean;
}

const SOURCES: { surface: ScreenSurface; name: string; hint: string }[] = [
  { surface: 'monitor', name: 'Весь экран', hint: 'Экран целиком' },
  { surface: 'window', name: 'Окно приложения', hint: 'Только это приложение' },
  { surface: 'browser', name: 'Вкладка браузера', hint: 'Только эта вкладка' },
];

/**
 * Выбор того, что показать: экран, окно или вкладка, со звуком или без, и с
 * каким качеством. Перенос winapp/lib/widgets/screen_share_picker.dart.
 *
 * Отличие от приложения одно и вынужденное: перечислить экраны и окна сайт не
 * может — их показывает системное окно браузера после нажатия «Начать». Здесь
 * выбирается, какую его вкладку открыть первой.
 */
export function ScreenSharePicker({
  peerName,
  adjusting,
  initialSurface,
  initialOptions,
  showPreview: initialPreview,
  onCancel,
  onPick,
}: {
  peerName: string;
  /** Настройка уже идущей демонстрации, а не запуск. */
  adjusting: boolean;
  initialSurface: ScreenSurface;
  initialOptions: ScreenShareOptions;
  showPreview: boolean;
  onCancel: () => void;
  onPick: (pick: ScreenSharePick) => void;
}): React.ReactElement {
  const [surface, setSurface] = useState<ScreenSurface>(initialSurface);
  const [options, setOptions] = useState<ScreenShareOptions>(initialOptions);
  const [showPreview, setShowPreview] = useState(initialPreview);

  // Звук отдельного окна браузер не передаёт — переключатель там выключен и
  // не нажимается, чтобы не обещать того, чего не будет.
  const audioPossible = surface !== 'window';
  const audio = audioPossible && options.withAudio;
  const audioTitle =
    surface === 'monitor'
      ? 'Передавать звук системы'
      : surface === 'browser'
        ? 'Передавать звук вкладки'
        : 'Передавать звук приложения';
  const audioHint =
    surface === 'monitor'
      ? 'Собеседник услышит звук фильма'
      : surface === 'browser'
        ? 'Собеседник услышит только эту вкладку'
        : 'Звук отдельного окна браузер не передаёт — выберите экран или вкладку';

  return (
    <div className="vc-modal">
      {/* Нажатие мимо карточки закрывает окно — обычное поведение модального. */}
      <div className="vc-modal-scrim" onClick={onCancel} aria-hidden />
      <div
        className="vc-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vc-share-title"
      >
        <div className="vc-modal-head">
          <h2 id="vc-share-title" className="vc-modal-title">
            {adjusting ? 'Настройка демонстрации' : 'Поделиться экраном'}
          </h2>
          <p className="vc-modal-sub">
            Выберите, что увидит {peerName}. Конкретный экран или окно браузер предложит отметить
            следом
          </p>
        </div>

        <div className="vc-modal-body">
          <div className="vc-sources" role="radiogroup" aria-label="Что показать">
            {SOURCES.map((s) => (
              <button
                key={s.surface}
                type="button"
                role="radio"
                aria-checked={surface === s.surface}
                className="vc-source"
                onClick={() => setSurface(s.surface)}
              >
                <span className="vc-source-thumb">
                  <SourceSketch surface={s.surface} active={surface === s.surface} />
                </span>
                <span className="vc-source-name vc-ellipsis">{s.name}</span>
                <span className="vc-source-hint vc-ellipsis">{s.hint}</span>
              </button>
            ))}
          </div>

          <div className="vc-modal-line" />

          <div className="vc-quality">
            <div>
              <div className="vc-section">Разрешение</div>
              <Segmented
                label="Разрешение"
                value={options.resolution}
                items={SCREEN_RESOLUTIONS}
                onChange={(resolution) => setOptions({ ...options, resolution })}
              />
            </div>
            <div>
              <div className="vc-section">Частота кадров</div>
              <Segmented
                label="Частота кадров"
                value={options.fps}
                items={SCREEN_FPS}
                onChange={(fps) => setOptions({ ...options, fps })}
              />
            </div>
          </div>

          <div className="vc-modal-switches">
            <SettingRow
              title={audioTitle}
              hint={audioHint}
              value={audio}
              disabled={!audioPossible}
              onChange={(withAudio) => setOptions({ ...options, withAudio })}
            />
            <SettingRow
              title="Показывать превью демонстрации"
              hint="Ваш экран крупно в окне звонка — так, как его видит собеседник"
              value={showPreview}
              onChange={setShowPreview}
            />
          </div>
        </div>

        <div className="vc-modal-foot">
          <button type="button" className="vc-pill-btn" onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className="vc-pill-btn"
            data-primary
            onClick={() =>
              onPick({
                surface,
                // Окно без звука: браузер его не даст, а флажок в настройках
                // остаётся тем, что человек выбрал для экрана и вкладки.
                options: audioPossible ? options : { ...options, withAudio: false },
                showPreview,
              })
            }
          >
            {adjusting ? 'Применить' : 'Начать демонстрацию'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Схема источника вместо миниатюры: настоящих снимков экранов и окон сайт не
 * получает, а пустая карточка с иконкой не говорит, чем варианты отличаются.
 */
function SourceSketch({ surface, active }: { surface: ScreenSurface; active: boolean }) {
  const line = active ? 'rgba(226,201,155,0.55)' : 'rgba(255,255,255,0.16)';
  const soft = active ? 'rgba(226,201,155,0.1)' : 'rgba(255,255,255,0.035)';
  const faint = 'rgba(255,255,255,0.08)';
  const focus = active ? 'rgba(226,201,155,0.22)' : 'rgba(255,255,255,0.07)';

  if (surface === 'monitor') {
    // Экран целиком: рабочий стол с двумя окнами и полосой задач.
    return (
      <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <rect x="14" y="10" width="132" height="70" rx="5" fill={soft} stroke={line} strokeWidth="1.2" />
        <rect x="24" y="19" width="62" height="38" rx="3" fill={focus} stroke={line} strokeWidth="1" />
        <rect x="72" y="30" width="62" height="38" rx="3" fill={faint} stroke={line} strokeWidth="1" />
        <line x1="14" y1="72" x2="146" y2="72" stroke={line} strokeWidth="1" />
        <circle cx="80" cy="76" r="1.6" fill={line} />
      </svg>
    );
  }
  if (surface === 'window') {
    // Одно окно: заголовок с кнопками, остальное — его содержимое.
    return (
      <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <rect x="14" y="10" width="132" height="70" rx="5" fill="none" stroke={faint} strokeWidth="1" strokeDasharray="3 4" />
        <rect x="36" y="20" width="88" height="52" rx="4" fill={focus} stroke={line} strokeWidth="1.2" />
        <line x1="36" y1="30" x2="124" y2="30" stroke={line} strokeWidth="1" />
        <circle cx="113" cy="25" r="1.5" fill={line} />
        <circle cx="118.5" cy="25" r="1.5" fill={line} />
        <rect x="44" y="38" width="44" height="4" rx="2" fill={line} opacity="0.6" />
        <rect x="44" y="47" width="64" height="3" rx="1.5" fill={line} opacity="0.35" />
        <rect x="44" y="55" width="54" height="3" rx="1.5" fill={line} opacity="0.35" />
      </svg>
    );
  }
  // Вкладка: окно браузера, где выделена одна вкладка.
  return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect x="14" y="10" width="132" height="70" rx="5" fill={soft} stroke={line} strokeWidth="1.2" />
      <path d="M22 24 V17.5 Q22 15 24.5 15 H54 Q56.5 15 56.5 17.5 V24" fill={focus} stroke={line} strokeWidth="1" />
      <path d="M60 24 V18.5 Q60 16.5 62 16.5 H88 Q90 16.5 90 18.5 V24" fill="none" stroke={faint} strokeWidth="1" />
      <line x1="14" y1="24" x2="146" y2="24" stroke={line} strokeWidth="1" />
      <rect x="22" y="30" width="116" height="42" rx="3" fill={focus} />
      <rect x="30" y="38" width="48" height="4" rx="2" fill={line} opacity="0.6" />
      <rect x="30" y="47" width="78" height="3" rx="1.5" fill={line} opacity="0.35" />
    </svg>
  );
}
