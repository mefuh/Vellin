import { useCallback, useEffect, useRef, useState } from 'react';
import { useCallSettingsStore } from '../../stores/callSettingsStore';
import { canPickSpeaker } from '../room/RemoteAudioMixer';

/**
 * Настройки звука и видео звонка: устройства, обработка звука, проверка
 * микрофона и громкость собеседника.
 *
 * Один и тот же набор нужен и в разговоре, и до него — в настройках профиля,
 * поэтому это отдельный блок, а не часть окна звонка.
 */
export function CallDeviceSettings({
  peerId,
  peerName,
}: {
  /** Чью громкость настраивать. Без него полоса громкости не показывается. */
  peerId?: string | null;
  peerName?: string | null;
}) {
  const [devices, setDevices] = useState<{
    mics: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
    speakers: MediaDeviceInfo[];
  }>({ mics: [], cameras: [], speakers: [] });
  const [needPermission, setNeedPermission] = useState(false);

  const micId = useCallSettingsStore((s) => s.preferredMicId);
  const cameraId = useCallSettingsStore((s) => s.preferredCameraId);
  const speakerId = useCallSettingsStore((s) => s.preferredSpeakerId);
  const noiseSuppression = useCallSettingsStore((s) => s.noiseSuppression);
  const echoCancellation = useCallSettingsStore((s) => s.echoCancellation);
  const autoGainControl = useCallSettingsStore((s) => s.autoGainControl);
  const setPreferredMicId = useCallSettingsStore((s) => s.setPreferredMicId);
  const setPreferredCameraId = useCallSettingsStore((s) => s.setPreferredCameraId);
  const setPreferredSpeakerId = useCallSettingsStore((s) => s.setPreferredSpeakerId);
  const setAudioProcessing = useCallSettingsStore((s) => s.setAudioProcessing);

  const refresh = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        mics: list.filter((d) => d.kind === 'audioinput'),
        cameras: list.filter((d) => d.kind === 'videoinput'),
        speakers: list.filter((d) => d.kind === 'audiooutput'),
      });
      // Названия устройств браузер отдаёт только тому, кому уже разрешили
      // микрофон. Пустые названия — значит разрешения ещё не было.
      setNeedPermission(list.every((d) => d.label.length === 0));
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {needPermission && (
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
          Названия устройств появятся после того, как вы разрешите доступ к микрофону —
          нажмите «Проверить микрофон».
        </p>
      )}

      <Field label="Микрофон">
        <DeviceSelect
          devices={devices.mics}
          value={micId}
          fallback="Микрофон"
          onChange={setPreferredMicId}
        />
      </Field>

      <Field label="Динамик">
        {canPickSpeaker() ? (
          <DeviceSelect
            devices={devices.speakers}
            value={speakerId}
            fallback="Динамик"
            onChange={setPreferredSpeakerId}
          />
        ) : (
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
            Этот браузер не даёт выбрать устройство вывода — звук идёт в системное.
          </p>
        )}
      </Field>

      <Field label="Камера">
        <DeviceSelect
          devices={devices.cameras}
          value={cameraId}
          fallback="Камера"
          onChange={setPreferredCameraId}
        />
      </Field>

      <MicCheck micId={micId} onGranted={refresh} />

      <Field label="Обработка звука">
        <Toggle
          label="Шумоподавление"
          hint="Убирает ровный фон: вентилятор, улицу, клавиатуру"
          checked={noiseSuppression}
          onChange={(v) => setAudioProcessing({ noiseSuppression: v })}
        />
        <Toggle
          label="Эхоподавление"
          hint="Нужно, когда звук идёт из колонок, а не из наушников"
          checked={echoCancellation}
          onChange={(v) => setAudioProcessing({ echoCancellation: v })}
        />
        <Toggle
          label="Авторегулировка громкости"
          hint="Выравнивает голос, если вы то ближе, то дальше от микрофона"
          checked={autoGainControl}
          onChange={(v) => setAudioProcessing({ autoGainControl: v })}
        />
      </Field>

      {peerId && <PeerVolume peerId={peerId} peerName={peerName ?? 'собеседник'} />}
    </div>
  );
}

/** Проверка микрофона: живая шкала уровня. */
function MicCheck({ micId, onGranted }: { micId: string | null; onGranted: () => void }) {
  const [level, setLevel] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // Проверка не должна пережить закрытие окна: иначе микрофон останется
  // занятым, а у пользователя — гореть индикатор записи.
  useEffect(() => () => stopRef.current?.(), []);

  const stop = (): void => {
    stopRef.current?.();
    stopRef.current = null;
    setRunning(false);
    setLevel(0);
  };

  const start = async (): Promise<void> => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
      });
    } catch {
      setError('Микрофон недоступен — проверьте разрешение в браузере');
      return;
    }
    onGranted();

    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    let raf = 0;
    const tick = (): void => {
      analyser.getByteTimeDomainData(data);
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i]! - 128) / 128;
        sumSq += v * v;
      }
      // Среднеквадратичное значение редко превышает четверть шкалы даже при
      // громкой речи — растягиваем, иначе полоса едва шевелится.
      setLevel(Math.min(1, Math.sqrt(sumSq / data.length) * 4));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    stopRef.current = () => {
      window.cancelAnimationFrame(raf);
      try { source.disconnect(); } catch { /* ignore */ }
      for (const t of stream.getTracks()) t.stop();
      void ctx.close().catch(() => undefined);
    };
    setRunning(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => (running ? stop() : void start())}
          style={{
            padding: '9px 14px',
            background: 'transparent',
            color: running ? 'var(--accent-hi)' : 'var(--text-1)',
            border: `1px solid ${running ? 'var(--accent-hi)' : 'var(--line-2)'}`,
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {running ? 'Остановить проверку' : 'Проверить микрофон'}
        </button>
        <div
          style={{
            flex: 1,
            height: 10,
            borderRadius: 999,
            background: 'var(--bg-3)',
            overflow: 'hidden',
          }}
        >
          {/* Шкала растягивается преобразованием, а не шириной: значение
              меняется каждый кадр, и пересчёт раскладки на каждом был бы
              заметен подёргиванием. */}
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg, var(--ok), var(--accent-hi))',
              transform: `scaleX(${running ? level : 0})`,
              transformOrigin: 'left center',
              transition: 'transform .08s linear',
            }}
          />
        </div>
      </div>
      {running && (
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 12 }}>
          Скажите что-нибудь — полоса должна двигаться.
        </p>
      )}
      {error && (
        <p style={{ margin: 0, color: 'var(--accent-hi)', fontSize: 12 }}>{error}</p>
      )}
    </div>
  );
}

function PeerVolume({ peerId, peerName }: { peerId: string; peerName: string }) {
  const volume = useCallSettingsStore((s) => s.peerVolumes[peerId] ?? 1);
  const setPeerVolume = useCallSettingsStore((s) => s.setPeerVolume);
  return (
    // Имя в заголовок не ставим: заголовки разделов набраны прописными, и имя
    // человека в них выглядит как крик.
    <Field label="Громкость собеседника">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setPeerVolume(peerId, parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent-hi)' }}
        />
        <span
          style={{
            minWidth: 42,
            textAlign: 'right',
            color: 'var(--text-2)',
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {Math.round(volume * 100)}%
        </span>
      </div>
      <p style={{ margin: '4px 0 0', color: 'var(--text-2)', fontSize: 12 }}>
        Громкость {peerName} запоминается отдельно от остальных.
      </p>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h4
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-2)',
        }}
      >
        {label}
      </h4>
      {children}
    </section>
  );
}

function DeviceSelect({
  devices,
  value,
  fallback,
  onChange,
}: {
  devices: MediaDeviceInfo[];
  value: string | null;
  fallback: string;
  onChange: (id: string | null) => void;
}) {
  // Запомненного устройства может уже не быть (наушники вынули) — тогда
  // показываем системное, чтобы список не врал про то, что сейчас работает.
  const known = value !== null && devices.some((d) => d.deviceId === value);
  return (
    <select
      value={known ? value : ''}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        width: '100%',
        padding: '10px 12px',
        background: 'var(--bg-2)',
        color: 'var(--text-0)',
        border: '1px solid var(--line-2)',
        borderRadius: 10,
        fontSize: 14,
        outline: 'none',
        cursor: 'pointer',
      }}
    >
      <option value="">Системное по умолчанию</option>
      {devices.map((d) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || `${fallback} ${d.deviceId.slice(0, 6)}`}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--accent-hi)', marginTop: 2 }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ color: 'var(--text-0)', fontSize: 13.5 }}>{label}</span>
        <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{hint}</span>
      </span>
    </label>
  );
}
