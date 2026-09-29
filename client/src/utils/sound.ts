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

/**
 * Звонок входящего вызова: повторяющаяся двухтоновая трель до отмены.
 * Возвращает функцию остановки.
 *
 * Браузер запрещает звук без предшествующего жеста пользователя, а входящий
 * звонок приходит сам по себе. Поэтому звук здесь — приятное дополнение, а не
 * единственный сигнал: экран входящего звонка и заголовок вкладки работают
 * всегда. Контекст, единожды разбуженный любым кликом на сайте, остаётся
 * рабочим до конца сессии — обычно к моменту звонка он уже разбужен.
 */
export function startRingtone(): () => void {
  const ac = audioCtx();
  if (!ac) return () => {};

  let stopped = false;
  let timer: number | null = null;

  const burst = (): void => {
    if (stopped || ac.state !== 'running') return;
    const t = ac.currentTime;
    // Классическая пара тонов: два коротких сигнала, затем пауза.
    for (const at of [0, 0.4]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 480;
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(0.12, t + at + 0.02);
      gain.gain.setValueAtTime(0.12, t + at + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.34);
      osc.connect(gain).connect(ac.destination);
      osc.start(t + at);
      osc.stop(t + at + 0.36);
    }
  };

  const loop = (): void => {
    burst();
    timer = window.setTimeout(loop, 2000);
  };

  if (ac.state === 'suspended') {
    ac.resume().then(loop).catch(() => {});
  } else {
    loop();
  }

  return () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
  };
}

/**
 * Гудки вызова у звонящего. В отличие от входящего, здесь звук всегда
 * разрешён: он следует за нажатием кнопки «Позвонить».
 */
export function startRingbackTone(): () => void {
  const ac = audioCtx();
  if (!ac) return () => {};
  let stopped = false;
  let timer: number | null = null;

  const beep = (): void => {
    if (stopped || ac.state !== 'running') return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 425;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.03);
    gain.gain.setValueAtTime(0.07, t + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 1.05);
  };

  const loop = (): void => {
    beep();
    timer = window.setTimeout(loop, 4000);
  };

  if (ac.state === 'suspended') {
    ac.resume().then(loop).catch(() => {});
  } else {
    loop();
  }

  return () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
  };
}
