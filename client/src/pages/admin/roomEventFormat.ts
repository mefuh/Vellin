import type { RoomEventDTO } from '@vellin/shared';

export type EventSeverity = 'neutral' | 'accent' | 'warn';

export interface RoomEventView {
  phrase: string;
  severity: EventSeverity;
}

function mmss(sec: unknown): string {
  const s = typeof sec === 'number' ? Math.max(0, Math.floor(sec)) : 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
function dur(sec: unknown): string {
  const s = typeof sec === 'number' ? Math.floor(sec) : 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h > 0) return `${h} ч ${m} м`;
  if (m > 0) return `${m} м ${r} с`;
  return `${r} с`;
}
const str = (v: unknown): string => (typeof v === 'string' && v ? v : '');

/** Человеческое описание события комнаты (актор рендерится отдельно в строке). */
export function describeRoomEvent(e: RoomEventDTO): RoomEventView {
  const d = e.data ?? {};
  const target = str(d.targetName) || str(d.targetUserId) || 'участник';
  switch (e.type) {
    case 'join': return { phrase: str(d.kind) === 'guest' ? 'вошёл в комнату (гость)' : 'вошёл в комнату', severity: 'neutral' };
    case 'leave': return { phrase: 'вышел из комнаты', severity: 'neutral' };
    case 'media_change': return { phrase: `сменил медиа: ${str(d.title) || str(d.url) || '—'}`, severity: 'accent' };
    case 'play': return { phrase: `запустил воспроизведение (${mmss(d.positionSec)})`, severity: 'neutral' };
    case 'pause': return { phrase: `поставил на паузу (${mmss(d.positionSec)})`, severity: 'neutral' };
    case 'seek': return { phrase: `перемотал на ${mmss(d.positionSec)}`, severity: 'neutral' };
    case 'ended': return { phrase: 'видео закончилось', severity: 'neutral' };
    case 'call_start': return { phrase: 'начался звонок', severity: 'accent' };
    case 'call_end': return { phrase: `звонок завершён · длительность ${dur(d.durationSec)}`, severity: 'accent' };
    case 'call_join': return { phrase: 'подключился к звонку', severity: 'neutral' };
    case 'call_leave': return { phrase: 'вышел из звонка', severity: 'neutral' };
    case 'role_change': return { phrase: `сменил роль: ${target} → ${str(d.role) === 'admin' ? 'админ' : 'участник'}`, severity: 'warn' };
    case 'permissions_change': return { phrase: `изменил права: ${target}`, severity: 'warn' };
    case 'kick': return { phrase: `удалил участника: ${target}`, severity: 'warn' };
    default: return { phrase: e.type, severity: 'neutral' };
  }
}

export const EVENT_SEVERITY_COLOR: Record<EventSeverity, string> = {
  neutral: 'var(--text-3)',
  accent: 'var(--accent-hi)',
  warn: 'var(--warn)',
};
