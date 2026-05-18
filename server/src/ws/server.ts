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
import { isWsTicket, type Principal } from '../auth/jwt.js';
import { logger } from '../utils/logger.js';
import { ensureRoomRuntime } from '../rooms/RoomRuntime.js';
import { prisma } from '../db/prisma.js';
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
import { roomMutex } from '../utils/async-mutex.js';
import { getOrCreateMembership } from '../rooms/membership.js';
import { getEffectivePermissions } from '../rooms/permissions.js';

const MAX_MESSAGE_BYTES = 16 * 1024;

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const ticket = url.searchParams.get('ticket');
    if (!ticket) {
      socket.close(4001, 'missing ticket');
      return;
    }

    let payload: ReturnType<FastifyInstance['jwt']['verify']>;
    try {
      payload = app.jwt.verify(ticket);
    } catch {
      socket.close(4001, 'invalid ticket');
      return;
    }
    if (!isWsTicket(payload as never)) {
      socket.close(4001, 'not a ws ticket');
      return;
    }
    const ticketPayload = payload as { ticket: true; roomId: string; principal: Principal };

    const room = await prisma.room.findUnique({
      where: { id: ticketPayload.roomId },
      include: { owner: { select: { username: true } } },
    });
    if (!room) {
      socket.close(4404, 'room not found');
      return;
    }

    const runtime = await ensureRoomRuntime(room);

    // Capacity check before attach.
    if (runtime.isAtCapacity() && !runtime.participants.has(ticketPayload.principal.userId)) {
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

    // Resolve role + permissions before attach.
    let role: RoomRole;
    let permissions: RoomPermissions;
    if (ticketPayload.principal.kind === 'guest') {
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

    const { isReconnect } = runtime.attachSession(ctx, role, permissions);
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
    };
    ctx.send(welcomeMsg);

    if (!isReconnect) {
      runtime.broadcast(
        {
          t: 'user_join',
          participant: {
            userId: ctx.principal.userId,
            username: ctx.principal.username,
            avatarSeed: ctx.principal.avatarSeed,
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
      if (raw.length > MAX_MESSAGE_BYTES) {
        sendError(ctx, 'invalid_payload', 'Message too large');
        return;
      }
      if (!ctx.bucket.consume(1)) {
        sendError(ctx, 'rate_limited', 'Slow down');
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

    default: {
      const exhaustive: never = msg;
      void exhaustive;
    }
  }
}
