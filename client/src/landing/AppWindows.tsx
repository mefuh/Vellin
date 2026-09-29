import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../shared/Icon';
import { MountainPoster } from '../shared/MountainPoster';
import { VellinMark } from './VellinMark';

/**
 * Три окна клиента для Windows веером: переписка, звонок, друзья.
 *
 * Не скриншоты, а сами окна, собранные токенами клиента, — поэтому они
 * читаются чётко на любой ширине и не устаревают вместе с картинкой.
 * Наведение или фокус выводит окно вперёд; на телефоне окно одно, а между
 * ними переключают пилюли. Имена и реплики — пример.
 */
type WindowId = 'call' | 'messages' | 'friends';

const WINDOWS: { id: WindowId; label: string; slot: 'left' | 'center' | 'right' }[] = [
  // Боковое окно перекрыто центральным со стороны центра: слева у друзей
  // виден список (он прижат влево), справа у звонка — всё по центру окна.
  { id: 'friends', label: 'Друзья', slot: 'left' },
  { id: 'messages', label: 'Переписка', slot: 'center' },
  { id: 'call', label: 'Звонок', slot: 'right' },
];

export function AppWindows() {
  const [front, setFront] = useState<WindowId>('messages');

  return (
    <div className="vx-fan" aria-label="Окна приложения Vellin для Windows: переписка, звонок и друзья">
      <div className="vx-fan__tabs" role="group" aria-label="Какое окно показать">
        {WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            aria-pressed={front === w.id}
            className="vx-fan__tab"
            onClick={() => setFront(w.id)}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="vx-fan__stage">
        {WINDOWS.map((w) => (
          <div
            key={w.id}
            className="vx-win"
            data-slot={w.slot}
            data-front={front === w.id || undefined}
            tabIndex={0}
            role="group"
            aria-label={`Окно «${w.label}»`}
            onMouseEnter={() => setFront(w.id)}
            onFocus={() => setFront(w.id)}
          >
            <TitleBar title={w.label} />
            <div className="vx-win__body">
              {w.id === 'messages' && <MessagesWindow />}
              {w.id === 'call' && <CallWindow />}
              {w.id === 'friends' && <FriendsWindow />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TitleBar({ title }: { title: string }) {
  return (
    <div className="vx-win__bar" aria-hidden="true">
      <span className="vx-win__brand">
        <VellinMark size={12} />
        Vellin
        <span className="vx-win__crumb">· {title}</span>
      </span>
      <span className="vx-win__controls">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1" />
        </svg>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1" />
        </svg>
      </span>
    </div>
  );
}

function Ava({ name, tint, size = 26, presence }: { name: string; tint: string; size?: number; presence?: 'on' | 'dnd' | 'off' }) {
  return (
    <span className="vx-ava" style={{ width: size, height: size, background: tint, fontSize: size * 0.4 }}>
      {name[0]}
      {presence && <span className="vx-ava__dot" data-p={presence} />}
    </span>
  );
}

/* ── Переписка ─────────────────────────────────────────────────────── */

/** Разделы рейла клиента: переписка, друзья, звонки, настройки. */
const RAIL: IconName[] = ['chat', 'users', 'phone', 'settings'];

const DIALOGS = [
  { name: 'Аня', tint: '#3a2e25', text: 'голосовое · 0:14', time: '21:40', unread: 2, active: true },
  { name: 'Макс', tint: '#2b2a31', text: 'скинул альбом с поездки', time: '21:12' },
  { name: 'Ира', tint: '#2f3228', text: 'кружок', time: '20:58' },
  { name: 'Тимур', tint: '#35272a', text: 'созвонимся в 10?', time: 'вчера' },
];

function MessagesWindow() {
  return (
    <div className="vx-msg">
      <nav className="vx-msg__rail" aria-hidden="true">
        {RAIL.map((name, i) => (
          <span key={name} data-on={i === 0 || undefined}>
            <Icon name={name} size={12} stroke={1.7} />
          </span>
        ))}
      </nav>
      <ul className="vx-msg__list">
        {DIALOGS.map((d) => (
          <li key={d.name} data-on={d.active || undefined}>
            <Ava name={d.name} tint={d.tint} presence={d.active ? 'on' : undefined} />
            <span className="vx-msg__meta">
              <b>{d.name}</b>
              <span>{d.text}</span>
            </span>
            <span className="vx-msg__side">
              <span className="vx-num">{d.time}</span>
              {d.unread && <span className="vx-msg__badge vx-num">{d.unread}</span>}
            </span>
          </li>
        ))}
      </ul>
      <section className="vx-msg__chat">
        <header className="vx-msg__head">
          <Ava name="Аня" tint="#3a2e25" size={24} />
          <span>
            <b>Аня</b>
            <span>в сети</span>
          </span>
        </header>
        <div className="vx-msg__feed">
          <Bubble>ты уже дома? смотри, что нашла</Bubble>
          <div className="vx-msg__album">
            <MountainPoster seed={0} />
            <MountainPoster seed={2} />
          </div>
          <Bubble own>ого, это где?</Bubble>
          <div className="vx-msg__voice">
            <span className="vx-msg__play">
              <svg width="8" height="8" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.6 1.4l7.4 4.6-7.4 4.6z" fill="currentColor" />
              </svg>
            </span>
            <span className="vx-msg__wave">
              {[5, 9, 13, 8, 11, 6, 14, 9, 7, 12, 5, 10, 8, 13, 6].map((h, i) => (
                <i key={i} style={{ height: h }} />
              ))}
            </span>
            <span className="vx-num">0:14</span>
          </div>
          <span className="vx-msg__react">🔥 2</span>
        </div>
        <div className="vx-msg__composer">Сообщение…</div>
      </section>
    </div>
  );
}

function Bubble({ own, children }: { own?: boolean; children: ReactNode }) {
  return (
    <span className="vx-msg__bubble" data-own={own || undefined}>
      {children}
    </span>
  );
}

/* ── Звонок ────────────────────────────────────────────────────────── */

function CallWindow() {
  return (
    <div className="vx-call">
      <span className="vx-call__pill vx-num">
        <i />
        12:48
      </span>
      <div className="vx-call__stage">
        <Ava name="Макс" tint="#2b2a31" size={64} />
        <span className="vx-call__name">Макс</span>
      </div>
      <span className="vx-call__self">
        <Ava name="Вы" tint="#211c18" size={22} />
      </span>
      <div className="vx-call__dock">
        <span className="vx-call__btn">
          <Icon name="mic" size={11} stroke={1.7} />
        </span>
        <span className="vx-call__btn">
          <Icon name="video" size={11} stroke={1.7} />
        </span>
        <span className="vx-call__btn" data-gold>
          <Icon name="cast" size={11} stroke={1.7} />
        </span>
        <span className="vx-call__end">
          <Icon name="phoneOff" size={12} stroke={1.7} />
        </span>
      </div>
    </div>
  );
}

/* ── Друзья ────────────────────────────────────────────────────────── */

const FRIENDS: { name: string; tint: string; p: 'on' | 'dnd' | 'off'; status: string }[] = [
  { name: 'Аня', tint: '#3a2e25', p: 'on', status: 'в сети' },
  { name: 'Ира', tint: '#2f3228', p: 'dnd', status: 'не беспокоить' },
  { name: 'Тимур', tint: '#35272a', p: 'on', status: 'в сети' },
  { name: 'Лиза', tint: '#33292c', p: 'off', status: 'была час назад' },
  { name: 'Макс', tint: '#2b2a31', p: 'off', status: 'был вчера' },
];

function FriendsWindow() {
  return (
    <div className="vx-fr">
      <div className="vx-fr__head">
        <b>Друзья</b>
        <span className="vx-num">5</span>
      </div>
      <ul className="vx-fr__list">
        {FRIENDS.map((f) => (
          <li key={f.name}>
            <Ava name={f.name} tint={f.tint} presence={f.p} />
            <span>
              <b>{f.name}</b>
              <span data-p={f.p}>{f.status}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="vx-fr__toast">
        <Ava name="Аня" tint="#3a2e25" size={22} />
        <span>
          <b>Аня</b>
          <span>смотрим дальше?</span>
        </span>
      </div>
    </div>
  );
}
