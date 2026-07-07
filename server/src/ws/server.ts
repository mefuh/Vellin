import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import {
  isC2S,
  ALL_PERMISSIONS,
  DEFAULT_GUEST_PERMISSIONS,
  type C2S,
  type RoomPermissions,
  type RoomRole,
  type S2C,
} from '@vellin/shared';
import { isUserTicket, isWsTicket, principalAvatarUrl, type Principal } from '../auth/jwt.js';
import { logger } from '../utils/logger.js';
import { ensureRoomRuntime } from '../rooms/RoomRuntime.js';
import { prisma } from '../db/prisma.js';
import { userHub, type UserConnection } from '../realtime/UserHub.js';
import { getFriendPresenceSnapshot, getNotificationsSnapshot } from '../friends/service.js';
import { handleDmRead, handleDmSend, handleDmTyping, handleDmVoicePlayed } from '../dm/realtime.js';
import { unreadTotal as dmUnreadTotal } from '../dm/service.js';
import { MAX_DM_BODY } from '../dm/service.js';
import { TokenBucket } from './rateLimit.js';
import { makeSession, sendError, type ConnectionContext } from './connection.js';
import { handleChatMessage } from './handlers/chat.js';
import { handleVideoEvent, handleSetVideoUrl } from './handlers/video.js';
import {
  handlePlaylistAdd,
  handlePlaylistPlay,
  handlePlaylistPrev,
  handlePlaylistRemove,
  handlePlaylistReorder,
  handleVideoEnded,
} from './handlers/playlist.js';
import { handleReaction } from './handlers/reactions.js';
import { handleSyncReport, handleSyncAll, handleSyncConfig } from './handlers/sync.js';
import {
  handleCallJoin,
  handleCallLeave,
  handleCallMedia,
  handleCallSignal,
  handleCallSpeaking,
} from './handlers/call.js';
import { roomMutex } from '../utils/async-mutex.js';
import { getOrCreateMembership } from '../rooms/membership.js';
import { getEffectivePermissions } from '../rooms/permissions.js';
import { getRtcConfig } from '../env.js';

// 32 KB — leaves comfortable headroom for SDP offers with bundled codecs
// (typical 8–12 KB; some Chromium builds clear 16 KB).
const MAX_MESSAGE_BYTES = 32 * 1024;

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  // ── Пользовательский realtime-канал (личные уведомления + presence) ─────
  app.get('/ws/user', { websocket: true }, async (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const ticket = url.searchParams.get('ticket');
    if (!ticket) {
      socket.close(4001, 'missing ticket');
      return;
    }
    let payload: unknown;
    try {
      payload = app.jwt.verify(ticket as never) as unknown;
    } catch {
      socket.close(4001, 'invalid ticket');
      return;
    }
    if (!isUserTicket(payload) || payload.principal.kind !== 'user') {
      socket.close(4001, 'not a user ticket');
      return;
    }
    const principal = payload.principal;
    const u = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { isBlocked: true },
    });
    if (!u || u.isBlocked) {
      socket.close(4403, 'blocked');
      return;
    }

    const conn: UserConnection = {
      id: nanoid(12),
      userId: principal.userId,
      send(msg) {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
      },
      isOpen() {
        return socket.readyState === socket.OPEN;
      },
    };
    userHub.attach(conn);
    logger.info({ userId: principal.userId, connId: conn.id }, 'ws:user:open');

    const pingTimer = setInterval(() => {
      if (socket.readyState === socket.OPEN) conn.send({ t: 'ping', serverTs: Date.now() });
    }, 30000);

    // Слушатели навешиваем СИНХРОННО, до любого await — иначе сообщение,
    // присланное сразу после open (watch_presence), теряется (ws роняет события
    // без слушателя). Входящие: подписка на присутствие + keep-alive (pong).
    socket.on('message', (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const m = msg as {
        t?: string;
        userId?: string;
        toUserId?: string;
        peerId?: string;
        body?: string;
        nonce?: string;
        typing?: boolean;
        kind?: string;
        imageUrl?: string;
        imageWidth?: number;
        imageHeight?: number;
        voiceUrl?: string;
        voiceDurationSec?: number;
        voicePeaks?: number[];
        videoUploadId?: string;
        videoDurationSec?: number;
        videoMirrored?: boolean;
        messageId?: string;
        conversationId?: string | null;
        visible?: boolean;
        active?: boolean;
      };
      if (m.t === 'watch_presence' && typeof m.userId === 'string') {
        userHub.watch(conn, m.userId);
      } else if (m.t === 'unwatch_presence' && typeof m.userId === 'string') {
        userHub.unwatch(conn, m.userId);
      } else if (m.t === 'watch_library') {
        userHub.watchLibrary(conn);
      } else if (m.t === 'unwatch_library') {
        userHub.unwatchLibrary(conn);
      } else if (
        m.t === 'dm_send' &&
        typeof m.toUserId === 'string' &&
        typeof m.body === 'string' &&
        typeof m.nonce === 'string' &&
        m.body.length <= MAX_DM_BODY
      ) {
        const image =
          typeof m.imageUrl === 'string'
            ? {
                url: m.imageUrl,
                width: typeof m.imageWidth === 'number' ? m.imageWidth : 0,
                height: typeof m.imageHeight === 'number' ? m.imageHeight : 0,
              }
            : undefined;
        const voice =
          typeof m.voiceUrl === 'string'
            ? {
                url: m.voiceUrl,
                durationSec: typeof m.voiceDurationSec === 'number' ? m.voiceDurationSec : 0,
                peaks: Array.isArray(m.voicePeaks) ? m.voicePeaks : [],
              }
            : undefined;
        const video =
          typeof m.videoUploadId === 'string'
            ? {
                uploadId: m.videoUploadId,
                durationSec: typeof m.videoDurationSec === 'number' ? m.videoDurationSec : 0,
                mirrored: m.videoMirrored === true,
              }
            : undefined;
        void handleDmSend(principal.userId, m.toUserId, m.body, m.nonce, image, voice, video);
      } else if (m.t === 'dm_typing' && typeof m.toUserId === 'string' && typeof m.typing === 'boolean') {
        handleDmTyping(
          principal.userId,
          m.toUserId,
          m.typing,
          m.kind === 'voice' ? 'voice' : m.kind === 'video' ? 'video' : 'text',
        );
      } else if (m.t === 'dm_read' && typeof m.peerId === 'string') {
        void handleDmRead(principal.userId, m.peerId);
      } else if (m.t === 'dm_voice_played' && typeof m.messageId === 'string') {
        void handleDmVoicePlayed(principal.userId, m.messageId);
      } else if (m.t === 'presence_focus') {
        // Какой диалог открыт + видима ли вкладка — для подавления push о ЛС.
        const convId = typeof m.conversationId === 'string' ? m.conversationId : null;
        userHub.setFocus(conn, convId, m.visible !== false);
      } else if (m.t === 'activity' && typeof m.active === 'boolean') {
        userHub.setActivity(conn, m.active);
      }
    });
    socket.on('close', () => {
      clearInterval(pingTimer);
      userHub.detach(conn);
      logger.info({ userId: principal.userId, connId: conn.id }, 'ws:user:close');
    });
    socket.on('error', (err) => {
      logger.warn({ err: err.message, userId: principal.userId }, 'ws:user socket error');
    });

    // hello-снапшот — после навешивания слушателей.
    try {
      const [snapshot, presence, dmUnread] = await Promise.all([
        getNotificationsSnapshot(principal.userId),
        getFriendPresenceSnapshot(principal.userId),
        dmUnreadTotal(principal.userId),
      ]);
      conn.send({
        t: 'hello',
        notifications: snapshot.notifications,
        unreadCount: snapshot.unreadCount,
        presence,
        dmUnreadTotal: dmUnread,
        serverTs: Date.now(),
      });
    } catch (err) {
      logger.error({ err, userId: principal.userId }, 'ws:user hello failed');
    }
  });

  app.get('/ws', { websocket: true }, async (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const ticket = url.searchParams.get('ticket');
    if (!ticket) {
      socket.close(4001, 'missing ticket');
      return;
    }

    let payload: unknown;
    try {
      payload = app.jwt.verify(ticket as never) as unknown;
    } catch {
      socket.close(4001, 'invalid ticket');
      return;
    }
    if (!payload || typeof payload !== 'object' || !isWsTicket(payload as never)) {
      socket.close(4001, 'not a ws ticket');
      return;
    }
    // Пользовательский realtime-тикет сюда не годится — у него свой эндпоинт.
    if (isUserTicket(payload)) {
      socket.close(4001, 'wrong ticket type');
      return;
    }
    const ticketPayload = payload as {
      ticket: true;
      roomId: string;
      principal: Principal;
      admin?: boolean;
      shadow?: boolean;
    };
    const isAdminTicket = ticketPayload.admin === true;
    const isShadowTicket = isAdminTicket && ticketPayload.shadow === true;

    const room = await prisma.room.findUnique({
      where: { id: ticketPayload.roomId },
      include: { owner: { select: { username: true } } },
    });
    if (!room) {
      socket.close(4404, 'room not found');
      return;
    }

    // Block-check для зарегистрированных пользователей. Заблокированному
    // достанется 4403 даже если он каким-то образом успел получить ticket
    // до момента блокировки.
    if (ticketPayload.principal.kind === 'user') {
      const u = await prisma.user.findUnique({
        where: { id: ticketPayload.principal.userId },
        select: { isBlocked: true },
      });
      if (!u || u.isBlocked) {
        socket.close(4403, 'blocked');
        return;
      }
    }

    const runtime = await ensureRoomRuntime(room);

    // Capacity check — admin (включая shadow) её обходит.
    if (
      !isAdminTicket &&
      runtime.isAtCapacity() &&
      !runtime.participants.has(ticketPayload.principal.userId)
    ) {
      socket.close(4413, 'room full');
      return;
    }

    const sessionBase = makeSession(socket, ticketPayload.principal, room.id, nanoid(12));
    const ctx: ConnectionContext = {
      ...sessionBase,
      bucket: new TokenBucket(30, 20),
    };

    logger.info(
      {
        roomId: room.id,
        slug: room.slug,
        userId: ctx.principal.userId,
        username: ctx.principal.username,
        sessionId: ctx.sessionId,
      },
      'ws:open',
    );

    // Resolve role + permissions before attach. Admin-ticket → superadmin
    // (полные права + возможность кикнуть владельца). Shadow только проходит
    // через `attachSession({ shadow: true })`.
    let role: RoomRole;
    let permissions: RoomPermissions;
    if (isAdminTicket) {
      role = 'superadmin';
      permissions = { ...ALL_PERMISSIONS };
    } else if (ticketPayload.principal.kind === 'guest') {
      role = 'guest';
      permissions = { ...DEFAULT_GUEST_PERMISSIONS };
    } else if (ticketPayload.principal.userId === room.ownerId) {
      role = 'owner';
      permissions = { ...ALL_PERMISSIONS };
    } else {
      const mem = await getOrCreateMembership(room.id, ticketPayload.principal.userId);
      role = mem.role;
      permissions = getEffectivePermissions(role, mem.permissionsJson);
    }

    const { isReconnect } = runtime.attachSession(ctx, role, permissions, {
      shadow: isShadowTicket,
    });
    const welcome = await runtime.buildWelcome(ctx.principal.userId);
    const welcomeMsg: S2C = {
      t: 'welcome',
      serverTs: Date.now(),
      you: welcome.you,
      participants: welcome.participants,
      video: welcome.video,
      recentMessages: welcome.recentMessages,
      playlist: welcome.playlist,
      historyLength: welcome.historyLength,
      hostOnlyControl: false,
      call: welcome.call,
      rtc: getRtcConfig(),
    };
    ctx.send(welcomeMsg);

    if (!isReconnect && !isShadowTicket) {
      runtime.broadcast(
        {
          t: 'user_join',
          participant: {
            userId: ctx.principal.userId,
            username: ctx.principal.username,
            avatarSeed: ctx.principal.avatarSeed,
            avatarUrl: principalAvatarUrl(ctx.principal),
            kind: ctx.principal.kind,
            isHost: ctx.principal.userId === runtime.ownerUserId,
            role,
            permissions,
            joinedAt: Date.now(),
          },
          serverTs: Date.now(),
        },
        ctx.principal.userId,
      );
      void runtime
        .appendSystemMessage(`${ctx.principal.username} joined the room`)
        .catch((e) => logger.error({ err: e }, 'append system message failed'));
    }

    socket.on('message', (raw) => {
      // `ws` types `raw` as Buffer | ArrayBuffer | Buffer[]; only Buffer/Uint8Array
      // has .length, so normalise via byteLength on whichever shape arrives.
      const size =
        raw instanceof ArrayBuffer
          ? raw.byteLength
          : Array.isArray(raw)
            ? raw.reduce((sum, b) => sum + b.byteLength, 0)
            : (raw as Buffer).byteLength;
      if (size > MAX_MESSAGE_BYTES) {
        sendError(ctx, 'invalid_payload', 'Message too large');
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString('utf-8'));
      } catch {
        sendError(ctx, 'invalid_payload', 'Invalid JSON');
        return;
      }
      if (!isC2S(parsed)) {
        sendError(ctx, 'invalid_payload', 'Invalid message shape');
        return;
      }
      const c2sMsg = parsed as C2S;
      // Shadow-сессия — пассивный наблюдатель. Из read-only команд разрешаем
      // только sync_request/pong/hello (для drift-коррекции и keep-alive).
      if (isShadowTicket && c2sMsg.t !== 'sync_request' && c2sMsg.t !== 'pong' && c2sMsg.t !== 'hello') {
        sendError(ctx, 'shadow_mode', 'Shadow-режим: команды недоступны');
        return;
      }
      // WebRTC signaling spikes during peer-mesh setup — half the cost so a
      // 9-peer offer/answer/ICE storm doesn't trip the bucket. Speaking
      // transitions are also chatty (a couple per second when speaking).
      const cost = c2sMsg.t === 'call_signal' || c2sMsg.t === 'call_speaking' ? 0.5 : 1;
      if (!ctx.bucket.consume(cost)) {
        sendError(ctx, 'rate_limited', 'Slow down');
        return;
      }
      if (c2sMsg.t !== 'pong') {
        logger.info(
          {
            t: c2sMsg.t,
            userId: ctx.principal.userId,
            roomId: runtime.roomId,
            participants: runtime.participants.size,
          },
          'ws:recv',
        );
      }
      void dispatch(c2sMsg, ctx, runtime).catch((err) => {
        logger.error({ err, t: c2sMsg.t }, 'dispatch failed');
        sendError(ctx, 'internal', 'Internal error');
      });
    });

    socket.on('close', (code, reason) => {
      logger.info(
        {
          roomId: runtime.roomId,
          userId: ctx.principal.userId,
          code,
          reason: reason?.toString('utf-8'),
        },
        'ws:close',
      );
      runtime.detachSession(ctx);
    });

    socket.on('error', (err) => {
      logger.warn({ err: err.message, userId: ctx.principal.userId }, 'socket error');
    });
  });
}

async function dispatch(msg: C2S, ctx: ConnectionContext, runtime: Awaited<ReturnType<typeof ensureRoomRuntime>>): Promise<void> {
  switch (msg.t) {
    case 'hello':
      // No-op: welcome already sent on connect. Could re-emit on demand.
      return;

    case 'pong':
      return;

    case 'sync_request': {
      ctx.send({
        t: 'video_sync',
        positionSec: runtime.snapshotVideo().positionSec,
        anchorServerTs: runtime.snapshotVideo().anchorServerTs,
        emittedServerTs: Date.now(),
        status: runtime.snapshotVideo().status,
        seq: runtime.snapshotVideo().lastEventSeq,
      });
      return;
    }

    case 'chat_message':
      await roomMutex.run(`chat:${runtime.roomId}`, () =>
        handleChatMessage(runtime, ctx, msg),
      );
      return;

    case 'video_play':
    case 'video_pause':
    case 'video_seek':
      await roomMutex.run(`video:${runtime.roomId}`, () =>
        handleVideoEvent(runtime, ctx, msg),
      );
      return;

    case 'video_set_url':
      await roomMutex.run(`video:${runtime.roomId}`, () =>
        handleSetVideoUrl(runtime, ctx, msg),
      );
      return;

    case 'video_ended':
      await roomMutex.run(`video:${runtime.roomId}`, () =>
        handleVideoEnded(runtime, ctx, msg),
      );
      return;

    case 'playlist_add':
      await roomMutex.run(`video:${runtime.roomId}`, () =>
        handlePlaylistAdd(runtime, ctx, msg),
      );
      return;

    case 'playlist_remove':
      await roomMutex.run(`video:${runtime.roomId}`, () =>
        handlePlaylistRemove(runtime, ctx, msg),
      );
      return;

    case 'playlist_reorder':
      await roomMutex.run(`video:${runtime.roomId}`, () =>
        handlePlaylistReorder(runtime, ctx, msg),
      );
      return;

    case 'playlist_play':
      await roomMutex.run(`video:${runtime.roomId}`, () =>
        handlePlaylistPlay(runtime, ctx, msg),
      );
      return;

    case 'playlist_prev':
      await roomMutex.run(`video:${runtime.roomId}`, () =>
        handlePlaylistPrev(runtime, ctx, msg),
      );
      return;

    case 'reaction':
      handleReaction(runtime, ctx, msg);
      return;

    case 'sync_report':
      // Горячий путь, без мьютекса — только фиксируем отчёт клиента.
      handleSyncReport(runtime, ctx, msg);
      return;

    case 'sync_all':
      await roomMutex.run(`video:${runtime.roomId}`, () => handleSyncAll(runtime, ctx, msg));
      return;

    case 'sync_config':
      await roomMutex.run(`video:${runtime.roomId}`, () => handleSyncConfig(runtime, ctx, msg));
      return;

    case 'call_join':
      await roomMutex.run(`call:${runtime.roomId}`, () => handleCallJoin(runtime, ctx, msg));
      return;

    case 'call_leave':
      await roomMutex.run(`call:${runtime.roomId}`, () => handleCallLeave(runtime, ctx, msg));
      return;

    case 'call_media':
      await roomMutex.run(`call:${runtime.roomId}`, () => handleCallMedia(runtime, ctx, msg));
      return;

    case 'call_signal':
      // Hot path — server only relays; no shared state mutation.
      handleCallSignal(runtime, ctx, msg);
      return;

    case 'call_speaking':
      // Transient indicator — no mutex, no persistence.
      handleCallSpeaking(runtime, ctx, msg);
      return;

    default: {
      const exhaustive: never = msg;
      void exhaustive;
    }
  }
}
