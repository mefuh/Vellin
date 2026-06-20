/**
 * Короткий синтезированный сигнал о входящем личном сообщении — без аудио-файла,
 * через WebAudio. Уважает политику автоплея: если контекст не удаётся
 * возобновить (не было пользовательского жеста), тихо выходим.
 */
let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function playDmSound(): void {
  const ac = audioCtx();
  if (!ac) return;
  const start = (): void => {
    const t = ac.currentTime;
    // Две мягкие ноты «бип-боп» с быстрым затуханием.
    const tones = [
      { f: 660, at: 0 },
      { f: 880, at: 0.09 },
    ];
    for (const { f, at } of tones) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(0.16, t + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.16);
      osc.connect(gain).connect(ac.destination);
      osc.start(t + at);
      osc.stop(t + at + 0.18);
    }
  };
  if (ac.state === 'suspended') {
    ac.resume().then(start).catch(() => {});
  } else {
    start();
  }
}
