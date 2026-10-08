import { useCallback, useEffect, useRef, useState } from 'react';
import { useCallSettingsStore } from '../../stores/callSettingsStore';
import { canPickSpeaker } from '../room/RemoteAudioMixer';
import { SettingRow } from './CallBits';
import { CallIcon } from './CallGlyph';

/**
 * Настройки звонка: громкость собеседника, устройства, обработка звука и
 * проверка микрофона. Перенос winapp/lib/widgets/call_settings_panel.dart.
 *
 * Панелью справа на компьютере и шторкой снизу на телефоне; кадр под ней не
 * затемняется — разговор должен оставаться видимым.
 */
export function CallSettingsPanel({
  peerId,
  peerName,
  onClose,
  onSwitchMic,
  onSwitchCamera,
  micCheck,
}: {
  peerId: string;
  peerName: string;
  onClose: () => void;
  /** Подменить микрофон в идущем разговоре. */
  onSwitchMic: (deviceId: string | null) => void;
  onSwitchCamera: (deviceId: string | null) => void;
  /** Проверка микрофона через сам звонок — см. `MicCheck`. */
  micCheck: MicCheck;
}): React.ReactElement {
  return (
    <>
      {/* На телефоне шторка закрывается и нажатием мимо неё. */}
      <div className="vc-sheet-scrim" onClick={onClose} aria-hidden />
      <aside className="vc-settings" role="dialog" aria-label="Настройки звонка">
        <div className="vc-settings-head">
          <h2 className="vc-panel-title" style={{ margin: 0 }}>
            Настройки звонка
          </h2>
          <button type="button" className="vc-square-btn" onClick={onClose} title="Закрыть" aria-label="Закрыть">
            <CallIcon name="close" size={11} />
          </button>
        </div>
        <div className="vc-scroll">
          <SettingsBody
            peerId={peerId}
            peerName={peerName}
            onSwitchMic={onSwitchMic}
            onSwitchCamera={onSwitchCamera}
            micCheck={micCheck}
          />
        </div>
      </aside>
    </>
  );
}

/**
 * Проверка микрофона в разговоре. `start` выключает микрофон для собеседника
 * и отдаёт ваш голос после всей обработки — так, как его слышит собеседник;
 * `stop` возвращает всё как было.
 */
export interface MicCheck {
  start: () => MediaStream | null;
  stop: () => void;
}

interface DeviceLists {
  mics: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

/**
 * Служебные записи браузера «по умолчанию» и «для связи» — не устройства, а
 * указатели на них. В список они не идут: их место занимает «Как в системе».
 */
const isAlias = (d: MediaDeviceInfo): boolean =>
  d.deviceId === 'default' || d.deviceId === 'communications' || d.deviceId === '';

/** Что система отдаёт разговорам сама — без префикса «По умолчанию - ». */
function systemLabel(list: MediaDeviceInfo[]): string | null {
  const def = list.find((d) => d.deviceId === 'default');
  if (!def?.label) return null;
  return def.label.replace(/^[^-–—]+[-–—]\s*/, '') || def.label;
}

function SettingsBody({
  peerId,
  peerName,
  onSwitchMic,
  onSwitchCamera,
  micCheck,
}: {
  peerId: string;
  peerName: string;
  onSwitchMic: (deviceId: string | null) => void;
  onSwitchCamera: (deviceId: string | null) => void;
  micCheck: MicCheck;
}) {
  const [devices, setDevices] = useState<DeviceLists>({ mics: [], cameras: [], speakers: [] });
  // Какой из списков раскрыт. Разворачиваем на месте, а не выпадающим меню.
  const [open, setOpen] = useState<'mic' | 'camera' | 'speaker' | null>(null);

  const micId = useCallSettingsStore((s) => s.preferredMicId);
  const cameraId = useCallSettingsStore((s) => s.preferredCameraId);
  const speakerId = useCallSettingsStore((s) => s.preferredSpeakerId);
  const setSpeaker = useCallSettingsStore((s) => s.setPreferredSpeakerId);
  const setCamera = useCallSettingsStore((s) => s.setPreferredCameraId);
  const setMic = useCallSettingsStore((s) => s.setPreferredMicId);
  const noiseSuppression = useCallSettingsStore((s) => s.noiseSuppression);
  const echoCancellation = useCallSettingsStore((s) => s.echoCancellation);
  const autoGainControl = useCallSettingsStore((s) => s.autoGainControl);
  const setProcessing = useCallSettingsStore((s) => s.setAudioProcessing);
  const volume = useCallSettingsStore((s) => s.peerVolumes[peerId] ?? 1);
  const setPeerVolume = useCallSettingsStore((s) => s.setPeerVolume);

  const refresh = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        mics: list.filter((d) => d.kind === 'audioinput'),
        cameras: list.filter((d) => d.kind === 'videoinput'),
        speakers: list.filter((d) => d.kind === 'audiooutput'),
      });
    } catch {
      /* список останется пустым */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = (): void => void refresh();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [refresh]);

  const pick = (which: 'mic' | 'camera' | 'speaker', id: string | null): void => {
    setOpen(null);
    if (which === 'mic') {
      setMic(id);
      onSwitchMic(id);
    } else if (which === 'camera') {
      setCamera(id);
      onSwitchCamera(id);
    } else {
      setSpeaker(id);
    }
  };

  return (
    <div>
      <div className="vc-section">Воспроизведение</div>
      <div className="vc-volume-head">
        <span className="vc-row-text vc-ellipsis">Громкость: {peerName}</span>
        <span className="vc-tabular">{Math.round(volume * 100)}%</span>
      </div>
      <input
        className="vc-slider"
        type="range"
        min={0}
        max={2}
        step={0.01}
        value={volume}
        aria-label={`Громкость: ${peerName}`}
        onChange={(e) => setPeerVolume(peerId, parseFloat(e.target.value))}
        style={{ '--vc-fill': `${(volume / 2) * 100}%` } as React.CSSProperties}
      />
      <div className="vc-row-hint">Запоминается для этого собеседника отдельно</div>

      <div className="vc-divider" />

      <div className="vc-section">Устройства</div>
      <DevicePicker
        label="Микрофон"
        devices={devices.mics}
        value={micId}
        open={open === 'mic'}
        onToggle={() => setOpen(open === 'mic' ? null : 'mic')}
        onPick={(id) => pick('mic', id)}
      />
      <DevicePicker
        label="Камера"
        devices={devices.cameras}
        value={cameraId}
        open={open === 'camera'}
        onToggle={() => setOpen(open === 'camera' ? null : 'camera')}
        onPick={(id) => pick('camera', id)}
      />
      {canPickSpeaker() ? (
        <DevicePicker
          label="Динамики"
          devices={devices.speakers}
          value={speakerId}
          open={open === 'speaker'}
          onToggle={() => setOpen(open === 'speaker' ? null : 'speaker')}
          onPick={(id) => pick('speaker', id)}
        />
      ) : (
        <div className="vc-device">
          <span className="vc-row-hint vc-device-label">Динамики</span>
          <div className="vc-row-hint">Этот браузер не даёт выбрать устройство вывода — звук идёт в системное</div>
        </div>
      )}

      <div className="vc-divider" />

      <div className="vc-section" style={{ marginBottom: 8 }}>
        Обработка звука
      </div>
      <SettingRow
        title="Шумоподавление"
        hint="Убирает фоновый шум комнаты"
        value={noiseSuppression}
        onChange={(v) => setProcessing({ noiseSuppression: v })}
      />
      <SettingRow
        title="Эхоподавление"
        hint="Рекомендуется без наушников"
        value={echoCancellation}
        onChange={(v) => setProcessing({ echoCancellation: v })}
      />
      <SettingRow
        title="Авторегулировка громкости"
        hint="Выравнивает уровень вашего голоса"
        value={autoGainControl}
        onChange={(v) => setProcessing({ autoGainControl: v })}
      />

      <div className="vc-divider" />

      <div className="vc-section">Тест микрофона</div>
      <MicTest check={micCheck} speakerId={speakerId} peerName={peerName} />
    </div>
  );
}

/** Выбор устройства: строка со значением, раскрывающаяся списком на месте. */
function DevicePicker({
  label,
  devices,
  value,
  open,
  onToggle,
  onPick,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value: string | null;
  open: boolean;
  onToggle: () => void;
  onPick: (id: string | null) => void;
}) {
  const real = devices.filter((d) => !isAlias(d));
  const sys = systemLabel(devices);
  const systemText = sys ? `Как в системе · ${sys}` : 'Как в системе';
  // Запомненного устройства может уже не быть — показываем системное, чтобы
  // список не врал про то, что сейчас работает.
  const known = value !== null && real.some((d) => d.deviceId === value);
  const current = known ? (real.find((d) => d.deviceId === value)?.label || label) : systemText;
  const nameOf = (d: MediaDeviceInfo, i: number): string => d.label || `${label} ${i + 1}`;

  return (
    <div className="vc-device">
      <span className="vc-row-hint vc-device-label">{label}</span>
      <button type="button" className="vc-picker-row" onClick={onToggle} aria-expanded={open}>
        <span className="vc-ellipsis">{current}</span>
        <CallIcon name={open ? 'chevronUp' : 'chevronDown'} size={10} />
      </button>
      <div className="vc-options-wrap" data-open={open || undefined}>
        <div>
          <div className="vc-options" role="radiogroup" aria-label={label}>
            <button
              type="button"
              role="radio"
              aria-checked={!known}
              className="vc-option"
              tabIndex={open ? 0 : -1}
              onClick={() => onPick(null)}
            >
              <span className="vc-option-dot" />
              <span className="vc-ellipsis">{systemText}</span>
            </button>
            {real.map((d, i) => (
              <button
                key={d.deviceId}
                type="button"
                role="radio"
                aria-checked={known && d.deviceId === value}
                className="vc-option"
                tabIndex={open ? 0 : -1}
                onClick={() => onPick(d.deviceId)}
              >
                <span className="vc-option-dot" />
                <span className="vc-ellipsis">{nameOf(d, i)}</span>
              </button>
            ))}
            {real.length === 0 && <div className="vc-row-hint vc-option-empty">Устройств не найдено</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Сколько полос в спектре проверки микрофона и какой диапазон они покрывают. */
const EQ_BANDS = 32;
const EQ_MIN_HZ = 70;
const EQ_MAX_HZ = 9000;

/**
 * Проверка микрофона: вы слышите себя так, как вас слышит собеседник, — со
 * всей выбранной обработкой звука, — и видите спектр голоса, как у
 * эквалайзера. Полосы идут по логарифмической шкале частот: основа голоса
 * (100 Гц – 3 кГц) занимает середину шкалы, а не прижимается к краю.
 *
 * Звук берётся из самого звонка, а не с микрофона заново: иначе было бы
 * слышно сырой сигнал, а не то, что уходит собеседнику. Собеседник на время
 * проверки вас не слышит.
 */
function MicTest({ check, speakerId, peerName }: { check: MicCheck; speakerId: string | null; peerName: string }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const barsRef = useRef<HTMLDivElement | null>(null);

  // Проверка не должна пережить закрытие панели: иначе собеседник так и не
  // услышит вас снова.
  useEffect(() => () => stopRef.current?.(), []);

  /** Выставить высоты полос напрямую: значения меняются каждый кадр. */
  const paint = (values: Float32Array | null): void => {
    const bars = barsRef.current?.children;
    if (!bars) return;
    for (let b = 0; b < bars.length; b++) {
      const v = values ? values[b]! : 0;
      const el = bars[b] as HTMLElement;
      el.style.transform = `scaleY(${Math.max(0.05, v)})`;
      el.style.opacity = String(0.32 + 0.68 * v);
    }
  };

  const stop = (): void => {
    stopRef.current?.();
    stopRef.current = null;
    setRunning(false);
    paint(null);
  };

  const start = (): void => {
    setError(null);
    const stream = check.start();
    if (!stream) {
      setError('Проверка доступна, когда разговор уже идёт');
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.6;
    // Окно громкости: тише −90 дБ — пусто, громче −25 дБ — полоса во всю высоту.
    analyser.minDecibels = -90;
    analyser.maxDecibels = -25;
    source.connect(analyser);

    // Себя — в выбранные динамики, как и собеседника.
    const monitor = new Audio() as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    monitor.autoplay = true;
    monitor.srcObject = stream;
    void monitor.setSinkId?.(speakerId ?? '').catch(() => undefined);
    void monitor.play().catch(() => undefined);

    const spectrum = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    const hzPerBin = ctx.sampleRate / analyser.fftSize;
    // Границы полос — заранее, в номерах отсчётов спектра. Каждой полосе
    // достаётся хотя бы один отсчёт, иначе низы шкалы стояли бы пустыми.
    const ranges: [number, number][] = [];
    for (let b = 0; b < EQ_BANDS; b++) {
      const lo = EQ_MIN_HZ * Math.pow(EQ_MAX_HZ / EQ_MIN_HZ, b / EQ_BANDS);
      const hi = EQ_MIN_HZ * Math.pow(EQ_MAX_HZ / EQ_MIN_HZ, (b + 1) / EQ_BANDS);
      const from = Math.floor(lo / hzPerBin);
      const to = Math.max(from + 1, Math.ceil(hi / hzPerBin));
      ranges.push([from, Math.min(to, spectrum.length)]);
    }
    const values = new Float32Array(EQ_BANDS);

    let raf = 0;
    const tick = (): void => {
      analyser.getByteFrequencyData(spectrum);
      for (let b = 0; b < EQ_BANDS; b++) {
        const [from, to] = ranges[b]!;
        let peak = 0;
        for (let k = from; k < to; k++) peak = Math.max(peak, spectrum[k]!);
        // Чуть поджимаем тихое, чтобы фон комнаты не держал полосы на середине.
        const target = Math.pow(peak / 255, 1.6);
        // Вверх — сразу, вниз — плавно, как стрелка на пульте.
        values[b] = target > values[b]! ? target : values[b]! * 0.86 + target * 0.14;
      }
      paint(values);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    stopRef.current = () => {
      window.cancelAnimationFrame(raf);
      monitor.pause();
      monitor.srcObject = null;
      try {
        source.disconnect();
      } catch {
        /* уже отключён */
      }
      void ctx.close().catch(() => undefined);
      check.stop();
    };
    setRunning(true);
  };

  return (
    <div className="vc-mic-card">
      <div className="vc-eq" data-running={running || undefined} aria-hidden>
        <div className="vc-eq-bars" ref={barsRef}>
          {Array.from({ length: EQ_BANDS }, (_, b) => (
            <span key={b} />
          ))}
        </div>
      </div>
      <div className="vc-mic-foot">
        <span className="vc-row-hint" data-error={error ? '' : undefined} role={error ? 'alert' : undefined}>
          {error ??
            (running
              ? `Вы слышите себя так, как вас слышит ${peerName}. Сейчас ${peerName} вас не слышит`
              : 'Услышите себя так, как вас слышит собеседник. Лучше в наушниках')}
        </span>
        <button
          type="button"
          className="vc-text-pill"
          data-active={running || undefined}
          onClick={() => (running ? stop() : start())}
        >
          {running ? 'Остановить' : 'Проверить'}
        </button>
      </div>
    </div>
  );
}
