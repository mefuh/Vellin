import { nanoid } from 'nanoid';
import type { DmCallEndReason, DmCallMediaState, DmCallSnapshot } from '@vellin/shared';
import { DM_CALL_RING_MS } from '@vellin/shared';
import { logger } from '../utils/logger.js';

/**
 * Сколько ждём `dmcall_connected` от обеих сторон после ответа. Не дождались —
 * считаем, что соединиться не удалось (обычно сеть или зажатый TURN).
 */
const CONNECT_MS = 30_000;

/**
 * Сколько звонок переживает потерю соединения стороны. Медиа идёт напрямую
 * между клиентами и обрыв сигнального канала переживает, поэтому короткая
 * просадка сети не должна рвать разговор.
 */
const GRACE_MS = 30_000;

/** Предохранитель от вечных сессий (забытый в фоне звонок). */
const MAX_CALL_MS = 6 * 60 * 60 * 1000;

/** Не больше стольких приглашений одному собеседнику за окно. */
const INVITE_LIMIT = 3;
const INVITE_WINDOW_MS = 60_000;

export interface DmCallSession {
  callId: string;
  callerId: string;
  calleeId: string;
  video: boolean;
  phase: 'ringing' | 'active' | 'ended';
  createdAt: number;
  answeredAt: number | null;
  endedAt: number | null;
  endReason: DmCallEndReason | null;
  callerConnId: string;
  calleeConnId: string | null;
  media: Record<string, DmCallMediaState>;
  /** Кто уже подтвердил установленное соединение. */
  connected: Set<string>;
  /** Запись в переписку делается ровно один раз. */
  recorded: boolean;
}

type Timers = Partial<Record<'ring' | 'connect' | 'grace' | 'max', NodeJS.Timeout>>;

/** Канонический ключ пары — порядок не важен, звонок между A и B один. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function toSnapshot(s: DmCallSession): DmCallSnapshot {
  return {
    callId: s.callId,
    callerId: s.callerId,
    calleeId: s.calleeId,
    video: s.video,
    phase: s.phase,
    createdAt: new Date(s.createdAt).toISOString(),
    answeredAt: s.answeredAt ? new Date(s.answeredAt).toISOString() : null,
    endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null,
    endReason: s.endReason,
    callerConnId: s.callerConnId,
    calleeConnId: s.calleeConnId,
    media: s.media,
  };
}

/**
 * Реестр звонков 1:1 в личных сообщениях. Держит состояние в памяти: звонок
 * живёт минуты, переживать перезапуск сервера ему незачем (клиент при
 * `dmcall_rejoin` получит `no_session` и погасит разговор).
 *
 * Здесь только состояние и таймеры; рассылка сообщений — в `realtime.ts`
 * через инъектируемый колбэк, чтобы не заводить цикл импортов с UserHub.
 */
class DmCallHub {
  private readonly sessions = new Map<string, DmCallSession>();
  /** userId → callId: O(1) проверка «человек занят» для гейтов комнат. */
  private readonly byUser = new Map<string, string>();
  /** pairKey → callId: встречный звонок той же пары. */
  private readonly byPair = new Map<string, string>();
  private readonly timers = new Map<string, Timers>();
  /** `откуда:кому` → времена последних приглашений (антифлуд). */
  private readonly invites = new Map<string, number[]>();

  /** Вызывается на каждом переходе состояния — рассылает клиентам. */
  private onChanged: ((s: DmCallSession) => void) | null = null;
  /** Вызывается один раз при завершении — пишет запись в переписку. */
  private onEnded: ((s: DmCallSession) => void) | null = null;

  setChangedHook(fn: (s: DmCallSession) => void): void {
    this.onChanged = fn;
  }
  setEndedHook(fn: (s: DmCallSession) => void): void {
    this.onEnded = fn;
  }

  // ── Чтение ────────────────────────────────────────────────────────────────

  get(callId: string): DmCallSession | null {
    return this.sessions.get(callId) ?? null;
  }

  /** Звонок пользователя (звонящий дозвон или разговор). */
  activeCallOf(userId: string): DmCallSession | null {
    const id = this.byUser.get(userId);
    return id ? this.sessions.get(id) ?? null : null;
  }

  /** Занят ли пользователь звонком — единственная проверка для гейтов комнат. */
  isBusy(userId: string): boolean {
    return this.byUser.has(userId);
  }

  /** Сессия пары, если между этими двумя уже что-то происходит. */
  betweenUsers(a: string, b: string): DmCallSession | null {
    const id = this.byPair.get(pairKey(a, b));
    return id ? this.sessions.get(id) ?? null : null;
  }

  /** Другая сторона звонка. */
  peerOf(s: DmCallSession, userId: string): string {
    return s.callerId === userId ? s.calleeId : s.callerId;
  }

  /** Соединение, которое ведёт звонок с этой стороны (null — ещё не выбрано). */
  connOf(s: DmCallSession, userId: string): string | null {
    return s.callerId === userId ? s.callerConnId : s.calleeConnId;
  }

  /** Слишком часто звонит одному и тому же? */
  isRateLimited(fromUserId: string, toUserId: string): boolean {
    const key = `${fromUserId}:${toUserId}`;
    const now = Date.now();
    const fresh = (this.invites.get(key) ?? []).filter((t) => now - t < INVITE_WINDOW_MS);
    this.invites.set(key, fresh);
    return fresh.length >= INVITE_LIMIT;
  }

  private noteInvite(fromUserId: string, toUserId: string): void {
    const key = `${fromUserId}:${toUserId}`;
    this.invites.set(key, [...(this.invites.get(key) ?? []), Date.now()]);
  }

  // ── Переходы ──────────────────────────────────────────────────────────────

  create(p: {
    callerId: string;
    calleeId: string;
    callerConnId: string;
    video: boolean;
  }): DmCallSession {
    const s: DmCallSession = {
      callId: nanoid(16),
      callerId: p.callerId,
      calleeId: p.calleeId,
      video: p.video,
      phase: 'ringing',
      createdAt: Date.now(),
      answeredAt: null,
      endedAt: null,
      endReason: null,
      callerConnId: p.callerConnId,
      calleeConnId: null,
      // Микрофон у звонящего включён всегда, камера — по намерению.
      media: {
        [p.callerId]: { audio: true, video: p.video, screen: false },
        [p.calleeId]: { audio: true, video: false, screen: false },
      },
      connected: new Set(),
      recorded: false,
    };
    this.sessions.set(s.callId, s);
    this.byUser.set(s.callerId, s.callId);
    this.byUser.set(s.calleeId, s.callId);
    this.byPair.set(pairKey(s.callerId, s.calleeId), s.callId);
    this.noteInvite(p.callerId, p.calleeId);
    this.setTimer(s.callId, 'ring', DM_CALL_RING_MS, () => this.end(s.callId, 'missed'));
    this.setTimer(s.callId, 'max', MAX_CALL_MS, () => this.end(s.callId, 'hangup'));
    logger.info({ callId: s.callId, callerId: s.callerId, calleeId: s.calleeId }, 'dmcall:create');
    return s;
  }

  /** Ответить на звонок с конкретного соединения. */
  accept(callId: string, calleeConnId: string, video: boolean): DmCallSession | null {
    const s = this.sessions.get(callId);
    if (!s || s.phase !== 'ringing') return null;
    s.phase = 'active';
    s.answeredAt = Date.now();
    s.calleeConnId = calleeConnId;
    s.media[s.calleeId] = { audio: true, video, screen: false };
    this.clearTimer(callId, 'ring');
    this.setTimer(callId, 'connect', CONNECT_MS, () => {
      // Достаточно подтверждения от ОДНОЙ стороны: канал у разговора общий, и
      // если он поднялся у одного, разговор идёт. Требовать оба подтверждения
      // нельзя — клиенты сообщают о соединении по разным событиям, и молчание
      // одного из них помечало состоявшийся разговор как несостоявшийся.
      const cur = this.sessions.get(callId);
      if (cur && cur.connected.size === 0) this.end(callId, 'failed');
    });
    logger.info({ callId }, 'dmcall:accept');
    this.onChanged?.(s);
    return s;
  }

  /** Сторона сообщила, что соединение установлено. */
  markConnected(callId: string, userId: string): DmCallSession | null {
    const s = this.sessions.get(callId);
    if (!s || s.phase !== 'active') return null;
    s.connected.add(userId);
    this.clearTimer(callId, 'connect');
    return s;
  }

  /** Состояние микрофона/камеры стороны. */
  setMedia(callId: string, userId: string, media: DmCallMediaState): DmCallSession | null {
    const s = this.sessions.get(callId);
    if (!s || s.phase === 'ended') return null;
    s.media[userId] = media;
    return s;
  }

  /**
   * Вернуться в звонок с (возможно, другого) соединения после обрыва.
   * Возвращает null, если такого звонка уже нет.
   */
  rejoin(callId: string, userId: string, connId: string): DmCallSession | null {
    const s = this.sessions.get(callId);
    if (!s || s.phase === 'ended') return null;
    if (s.callerId !== userId && s.calleeId !== userId) return null;
    if (s.callerId === userId) s.callerConnId = connId;
    else s.calleeConnId = connId;
    this.clearTimer(callId, 'grace');
    logger.info({ callId, userId }, 'dmcall:rejoin');
    this.onChanged?.(s);
    return s;
  }

  /**
   * Соединение, которое вело звонок, закрылось. Сразу звонок не рвём: даём
   * время вернуться (перезагрузка страницы, просадка сети).
   */
  noteConnectionClosed(userId: string, connId: string): void {
    const s = this.activeCallOf(userId);
    if (!s || s.phase === 'ended') return;
    if (this.connOf(s, userId) !== connId) return; // звонок вела другая вкладка
    // Дозвон без вкладки звонящего смысла не имеет — сразу отменяем.
    if (s.phase === 'ringing' && s.callerId === userId) {
      this.end(s.callId, 'cancelled');
      return;
    }
    this.setTimer(s.callId, 'grace', GRACE_MS, () => this.end(s.callId, 'failed'));
  }

  /** Завершить звонок. Идемпотентно: таймер и трубка могут сработать разом. */
  end(callId: string, reason: DmCallEndReason): DmCallSession | null {
    const s = this.sessions.get(callId);
    if (!s || s.phase === 'ended') return null;
    s.phase = 'ended';
    s.endedAt = Date.now();
    s.endReason = reason;
    this.clearAllTimers(callId);
    this.byUser.delete(s.callerId);
    this.byUser.delete(s.calleeId);
    this.byPair.delete(pairKey(s.callerId, s.calleeId));
    // Сессию держим ещё немного: клиенты должны получить финальное состояние,
    // а опоздавший `rejoin` — внятный ответ вместо тишины.
    setTimeout(() => this.sessions.delete(callId), 60_000).unref?.();
    logger.info({ callId, reason }, 'dmcall:end');
    this.onChanged?.(s);
    if (!s.recorded) {
      s.recorded = true;
      this.onEnded?.(s);
    }
    return s;
  }

  /** Длительность разговора в секундах (0 — не состоялся). */
  durationSec(s: DmCallSession): number {
    if (!s.answeredAt) return 0;
    return Math.max(0, Math.round(((s.endedAt ?? Date.now()) - s.answeredAt) / 1000));
  }

  // ── Таймеры ───────────────────────────────────────────────────────────────

  private setTimer(callId: string, key: keyof Timers, ms: number, fn: () => void): void {
    const t = this.timers.get(callId) ?? {};
    if (t[key]) clearTimeout(t[key]);
    const handle = setTimeout(fn, ms);
    handle.unref?.();
    t[key] = handle;
    this.timers.set(callId, t);
  }

  private clearTimer(callId: string, key: keyof Timers): void {
    const t = this.timers.get(callId);
    if (!t?.[key]) return;
    clearTimeout(t[key]);
    delete t[key];
  }

  private clearAllTimers(callId: string): void {
    const t = this.timers.get(callId);
    if (!t) return;
    for (const h of Object.values(t)) if (h) clearTimeout(h);
    this.timers.delete(callId);
  }

  /** Для админ-статистики. */
  stats(): { active: number; ringing: number } {
    let active = 0;
    let ringing = 0;
    for (const s of this.sessions.values()) {
      if (s.phase === 'active') active += 1;
      else if (s.phase === 'ringing') ringing += 1;
    }
    return { active, ringing };
  }
}

export const dmCallHub = new DmCallHub();
