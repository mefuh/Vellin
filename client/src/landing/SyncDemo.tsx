import { useEffect, useRef, useState } from 'react';

/**
 * Живая демонстрация синхрона — четыре участника на одной позиции.
 *
 * Сценарий повторяет то, что делает плеер комнаты на самом деле: у одного
 * участника связь проседает и он отстаёт; расхождение меньше 2 секунд правится
 * мягко — скоростью воспроизведения, и точка плавно догоняет общую позицию.
 * Имена и позиция — пример, а не данные.
 */
const PEOPLE = [
  { name: 'Аня', tint: '#3a2e25' },
  { name: 'Макс', tint: '#2b2a31' },
  { name: 'Ира', tint: '#2f3228' },
  { name: 'Тимур', tint: '#35272a' },
];

/** Кто в сценарии отстаёт. */
const LAGGER = 2;

/** Секунды цикла: синхрон → провал → подстройка → синхрон. */
const CYCLE = 11;
const DROP_AT = 4;
const LAG = 1.4;
const CATCH_UP = 3.2;

/** Позиция, с которой начинается пример: 00:42:17. */
const START = 42 * 60 + 17;

function clock(total: number) {
  const s = Math.floor(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

function lagAt(t: number) {
  const p = t % CYCLE;
  if (p < DROP_AT) return 0;
  const since = p - DROP_AT;
  if (since >= CATCH_UP) return 0;
  // Догоняет по экспоненте: быстро вначале, мягко у цели.
  return LAG * Math.pow(1 - since / CATCH_UP, 2.2);
}

export function SyncDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    let raf = 0;
    let visible = false;
    let last = performance.now();
    const loop = (now: number) => {
      if (visible) setT((prev) => prev + Math.min(0.1, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    // Считаем только пока блок на экране — вне экрана он ничего не стоит.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      last = performance.now();
    });
    if (root.current) io.observe(root.current);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  const lag = lagAt(t);
  const shared = START + t;
  const phase = lag >= 0.4 ? 'lag' : lag > 0.02 ? 'soft' : 'sync';
  const status =
    phase === 'sync'
      ? 'Все на одном кадре'
      : phase === 'lag'
        ? `${PEOPLE[LAGGER].name} отстаёт — ускоряем воспроизведение`
        : `${PEOPLE[LAGGER].name} почти догнала`;

  return (
    <div ref={root} className="vx-sync" role="img" aria-label="Пример: четыре участника смотрят одно видео на одной позиции, отставание одного выравнивается автоматически">
      <div className="vx-sync__head">
        <span className="vx-sync__clock vx-num">{clock(shared)}</span>
        <span className="vx-sync__drift vx-num" data-phase={phase}>
          {phase === 'sync' ? 'расхождение < 0,4 с' : `отставание ${lag.toFixed(1).replace('.', ',')} с`}
        </span>
      </div>

      <div className="vx-sync__lanes">
        {PEOPLE.map((p, i) => {
          const off = i === LAGGER ? -lag : 0;
          // Шкала — окно ±2 с вокруг общей позиции.
          const x = 50 + (off / 2) * 50;
          return (
            <div key={p.name} className="vx-sync__lane" data-late={i === LAGGER && phase !== 'sync' ? true : undefined}>
              <span className="vx-sync__who">
                <span className="vx-sync__avatar" style={{ background: p.tint }}>
                  {p.name[0]}
                </span>
                {p.name}
              </span>
              <span className="vx-sync__track">
                <span className="vx-sync__fill" style={{ width: `${x}%` }} />
                <span className="vx-sync__head-dot" style={{ left: `${x}%` }} />
              </span>
            </div>
          );
        })}
        <span className="vx-sync__now" aria-hidden="true" />
      </div>

      <p className="vx-sync__status" aria-live="off">
        <span className="vx-sync__dot" data-phase={phase} />
        {status}
      </p>
    </div>
  );
}
