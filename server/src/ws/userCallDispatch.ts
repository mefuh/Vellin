// Разбор сообщений звонка на пользовательском канале.
//
// Вынесено отдельно и валидируется строго, потому что это единственный путь, по
// которому содержимое от одного пользователя (SDP/ICE) ретранслируется в
// браузер другого. Остальные сообщения `/ws/user` адресованы только серверу.

import { z } from 'zod';
import type { CallSignalPayload } from '@vellin/shared';
import {
  handleDmCallAccept,
  handleDmCallCancel,
  handleDmCallConnected,
  handleDmCallDecline,
  handleDmCallHangup,
  handleDmCallInvite,
  handleDmCallMedia,
  handleDmCallRejoin,
  handleDmCallSignal,
  handleDmCallSpeaking,
} from '../calls/realtime.js';

/** Потолок на SDP: реальные оферы 8–12 КБ, запас на многодорожечные сборки. */
const MAX_SDP_CHARS = 64 * 1024;

const idSchema = z.string().min(1).max(64);

const signalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('offer'), sdp: z.string().max(MAX_SDP_CHARS) }),
  z.object({ kind: z.literal('answer'), sdp: z.string().max(MAX_SDP_CHARS) }),
  z.object({
    kind: z.literal('ice'),
    candidate: z
      .object({
        candidate: z.string().max(1024).optional(),
        sdpMid: z.string().max(64).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .nullable(),
  }),
]);

const schemas = {
  dmcall_invite: z.object({
    toUserId: idSchema,
    video: z.boolean(),
    nonce: z.string().min(1).max(64),
  }),
  dmcall_accept: z.object({ callId: idSchema, video: z.boolean() }),
  dmcall_decline: z.object({ callId: idSchema }),
  dmcall_cancel: z.object({ callId: idSchema }),
  dmcall_hangup: z.object({ callId: idSchema }),
  dmcall_signal: z.object({ callId: idSchema, payload: signalSchema }),
  dmcall_media: z.object({
    callId: idSchema,
    audio: z.boolean(),
    video: z.boolean(),
    // Старые сборки клиента о демонстрации не знают — считаем, что её нет.
    screen: z.boolean().optional(),
    // Приметы дорожки демонстрации: идентификатор линии в согласовании и
    // идентификатор потока. И то, и другое — короткие технические строки.
    screenMid: z.string().min(1).max(64).optional(),
    screenStreamId: z.string().min(1).max(128).optional(),
  }),
  dmcall_speaking: z.object({ callId: idSchema, speaking: z.boolean() }),
  dmcall_connected: z.object({ callId: idSchema }),
  dmcall_rejoin: z.object({ callId: idSchema }),
} as const;

/** Относится ли сообщение к звонкам (для выбора корзины рейт-лимита). */
export function isDmCallMessage(t: unknown): t is keyof typeof schemas {
  return typeof t === 'string' && t in schemas;
}

/** Сигналинг идёт пачками (трикл-ICE) — у него отдельная, щедрая корзина. */
export function isDmCallSignalMessage(t: unknown): boolean {
  return t === 'dmcall_signal' || t === 'dmcall_speaking';
}

/**
 * Разобрать и выполнить сообщение звонка. Невалидное молча игнорируем: клиент
 * такого не шлёт, а на подделку отвечать подробностями незачем.
 */
export function dispatchDmCall(userId: string, connId: string, msg: Record<string, unknown>): void {
  const t = msg.t;
  if (!isDmCallMessage(t)) return;

  switch (t) {
    case 'dmcall_invite': {
      const p = schemas.dmcall_invite.safeParse(msg);
      if (p.success) void handleDmCallInvite(userId, connId, p.data);
      return;
    }
    case 'dmcall_accept': {
      const p = schemas.dmcall_accept.safeParse(msg);
      if (p.success) void handleDmCallAccept(userId, connId, p.data);
      return;
    }
    case 'dmcall_decline': {
      const p = schemas.dmcall_decline.safeParse(msg);
      if (p.success) handleDmCallDecline(userId, p.data.callId);
      return;
    }
    case 'dmcall_cancel': {
      const p = schemas.dmcall_cancel.safeParse(msg);
      if (p.success) handleDmCallCancel(userId, p.data.callId);
      return;
    }
    case 'dmcall_hangup': {
      const p = schemas.dmcall_hangup.safeParse(msg);
      if (p.success) handleDmCallHangup(userId, p.data.callId);
      return;
    }
    case 'dmcall_signal': {
      const p = schemas.dmcall_signal.safeParse(msg);
      if (p.success) handleDmCallSignal(userId, p.data.callId, p.data.payload as CallSignalPayload);
      return;
    }
    case 'dmcall_media': {
      const p = schemas.dmcall_media.safeParse(msg);
      if (p.success) {
        void handleDmCallMedia(
          userId,
          p.data.callId,
          { audio: p.data.audio, video: p.data.video, screen: p.data.screen === true },
          { mid: p.data.screenMid, streamId: p.data.screenStreamId },
        );
      }
      return;
    }
    case 'dmcall_speaking': {
      const p = schemas.dmcall_speaking.safeParse(msg);
      if (p.success) handleDmCallSpeaking(userId, p.data.callId, p.data.speaking);
      return;
    }
    case 'dmcall_connected': {
      const p = schemas.dmcall_connected.safeParse(msg);
      if (p.success) handleDmCallConnected(userId, p.data.callId);
      return;
    }
    case 'dmcall_rejoin': {
      const p = schemas.dmcall_rejoin.safeParse(msg);
      if (p.success) void handleDmCallRejoin(userId, connId, p.data.callId);
      return;
    }
  }
}
