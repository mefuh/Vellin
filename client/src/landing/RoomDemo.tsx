/**
 * Комната в миниатюре — то, что человек увидит после «Смотреть вместе»:
 * кадр с реакциями поверх, кто говорит, чат и очередь видео.
 * Всё здесь пример: имена, реплики и названия придуманы для показа.
 */
const VOICES = [
  { name: 'Аня', tint: '#3a2e25', speaking: true },
  { name: 'Макс', tint: '#2b2a31' },
  { name: 'Ира', tint: '#2f3228' },
  { name: 'Тимур', tint: '#35272a', muted: true },
];

const CHAT = [
  { who: 'Макс', text: 'стоп, перемотай на момент с мостом' },
  { who: 'Ира', text: 'уже у всех на паузе 😄' },
  { who: 'Аня', text: 'смотрим дальше' },
];

const QUEUE = [
  { title: 'Серия 4 · Дорога домой', len: '44:10', now: true },
  { title: 'Серия 5 · Перевал', len: '41:52' },
  { title: 'Серия 6 · Последний поезд', len: '46:07' },
];

const REACTIONS = ['🔥', '😂', '❤️', '😮', '👏'];

export function RoomDemo() {
  return (
    <div className="vx-room" role="img" aria-label="Пример комнаты: видео с реакциями поверх, участники в голосовом чате, сообщения и очередь серий">
      <div className="vx-room__stage">
        <DuskFrame />
        <div className="vx-room__reactions" aria-hidden="true">
          {REACTIONS.map((r, i) => (
            <span key={i} className="vx-room__reaction" style={{ left: `${14 + i * 17}%`, animationDelay: `${i * 1.3}s` }}>
              {r}
            </span>
          ))}
        </div>
        <div className="vx-room__bar">
          <svg className="vx-room__play" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.6 1.4l7.4 4.6-7.4 4.6z" fill="currentColor" />
          </svg>
          <span className="vx-room__time vx-num">42:17</span>
          <span className="vx-room__scrub">
            <span style={{ width: '62%' }} />
          </span>
          <span className="vx-room__time vx-num">44:10</span>
        </div>
      </div>

      <div className="vx-room__side">
        <div className="vx-room__voices">
          {VOICES.map((v) => (
            <span key={v.name} className="vx-room__voice" data-speaking={v.speaking || undefined} data-muted={v.muted || undefined}>
              <span className="vx-room__ava" style={{ background: v.tint }}>
                {v.name[0]}
              </span>
              <span className="vx-room__vname">{v.name}</span>
            </span>
          ))}
        </div>

        <ul className="vx-room__chat">
          {CHAT.map((m, i) => (
            <li key={i}>
              <b>{m.who}</b>
              {m.text}
            </li>
          ))}
        </ul>

        <ol className="vx-room__queue">
          {QUEUE.map((q) => (
            <li key={q.title} data-now={q.now || undefined}>
              <span>{q.title}</span>
              <span className="vx-num">{q.len}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Кадр-пример: сумерки над хребтом, в палитре приложения. */
function DuskFrame() {
  return (
    <svg className="vx-room__frame" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="vx-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1512" />
          <stop offset="0.55" stopColor="#4a3526" />
          <stop offset="1" stopColor="#8a5d3a" />
        </linearGradient>
        <radialGradient id="vx-sun" cx="0.66" cy="0.52" r="0.34">
          <stop offset="0" stopColor="#f3d9a6" stopOpacity="0.95" />
          <stop offset="0.16" stopColor="#e2b77a" stopOpacity="0.7" />
          <stop offset="1" stopColor="#e2b77a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="640" height="360" fill="url(#vx-sky)" />
      <rect width="640" height="360" fill="url(#vx-sun)" />
      <circle cx="424" cy="188" r="26" fill="#f6e2b8" />
      <path d="M0 250 L90 196 L170 232 L262 170 L352 224 L452 182 L548 226 L640 196 L640 360 L0 360 Z" fill="#3a281f" />
      <path d="M0 284 L120 240 L214 272 L318 232 L430 276 L530 246 L640 272 L640 360 L0 360 Z" fill="#241913" />
      <path d="M0 318 L140 290 L300 312 L450 288 L640 310 L640 360 L0 360 Z" fill="#140e0b" />
    </svg>
  );
}
