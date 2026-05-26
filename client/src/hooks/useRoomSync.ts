import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminAccessMode, C2S, JoinRoomResponse, S2C } from '@vellin/shared';
import { WSClient, type WSConnectionState } from '../ws/WSClient';
import { useRoomStore } from '../stores/roomStore';
import { roomsApi } from '../api/rooms';
import { adminApi } from '../api/admin';
import { ApiHttpError } from '../api/client';
import { callSignalBus } from '../ws/callSignalBus';

export interface UseRoomSyncOpts {
  slug: string;
  password?: string;
  inviteToken?: string;
  enabled: boolean;
  /**
   * Если установлено, тикет берётся через /api/admin/rooms/:id/access-ticket,
   * а не через стандартный /rooms/join (минуя пароль/приватность/capacity).
   * 'shadow' дополнительно делает сессию невидимой для участников.
   */
  adminMode?: AdminAccessMode;
  onError?: (message: string) => void;
}

const ADMIN_TICKET_STORAGE_PREFIX = 'vellin.admin.ticket.';

interface AdminTicketCache {
  wsTicket: string;
  mode: AdminAccessMode;
  room: import('@vellin/shared').RoomDetails;
  issuedAt: number;
}

function readAdminTicketCache(slug: string, mode: AdminAccessMode): AdminTicketCache | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_TICKET_STORAGE_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminTicketCache;
    if (parsed.mode !== mode) return null;
    // Tickets живут 60 секунд по умолчанию — кэш протухает через 45.
    if (Date.now() - parsed.issuedAt > 45_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAdminTicketCache(slug: string, cache: AdminTicketCache): void {
  try {
    sessionStorage.setItem(ADMIN_TICKET_STORAGE_PREFIX + slug, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

export interface RoomSyncApi {
  state: WSConnectionState;
  send: (msg: C2S) => boolean;
  client: WSClient | null;
}

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

export function useRoomSync(opts: UseRoomSyncOpts): RoomSyncApi {
  const [state, setState] = useState<WSConnectionState>('idle');
  const clientRef = useRef<WSClient | null>(null);
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;

  // Stable send/client refs — never change identity across renders, so consumers
  // that capture them in useMemo deps don't churn on every render.
  const send = useCallback<RoomSyncApi['send']>(
    (msg) => clientRef.current?.send(msg) ?? false,
    [],
  );

  useEffect(() => {
    if (!opts.enabled) return;
    let active = true;

    const getTicket = async (): Promise<string> => {
      if (opts.adminMode) {
        const cached = readAdminTicketCache(opts.slug, opts.adminMode);
        if (cached) {
          useRoomStore.getState().setRoom(cached.room);
          return cached.wsTicket;
        }
        const room = await roomsApi.get(opts.slug);
        if (!active) throw new Error('aborted');
        const t = await adminApi.accessTicket(room.room.id, opts.adminMode);
        if (!active) throw new Error('aborted');
        writeAdminTicketCache(opts.slug, {
          wsTicket: t.wsTicket,
          mode: t.mode,
          room: t.room,
          issuedAt: Date.now(),
        });
        useRoomStore.getState().setRoom(t.room);
        return t.wsTicket;
      }
      const data: JoinRoomResponse = await roomsApi.join({
        slug: opts.slug,
        password: opts.password,
        inviteToken: opts.inviteToken,
      });
      if (!active) throw new Error('aborted');
      useRoomStore.getState().setRoom(data.room);
      return data.wsTicket;
    };

    const client = new WSClient({
      url: wsUrl(),
      getTicket,
      onMessage: (msg: S2C) => {
        const store = useRoomStore.getState();
        switch (msg.t) {
          case 'welcome':
            store.applyWelcome({
              you: msg.you,
              participants: msg.participants,
              video: msg.video,
              recentMessages: msg.recentMessages,
              playlist: msg.playlist,
              historyLength: msg.historyLength,
              call: msg.call,
              rtc: msg.rtc,
            });
            break;
          case 'user_join':
            store.upsertParticipant(msg.participant);
            break;
          case 'user_leave':
            store.removeParticipant(msg.userId);
            break;
          case 'chat_message':
            store.appendMessage(msg.message);
            break;
          case 'video_apply': {
            const current = store.video;
            store.updateVideo(() =>
              current
                ? {
                    ...current,
                    positionSec: msg.positionSec,
                    anchorServerTs: msg.anchorServerTs,
                    status: msg.status,
                    lastEventSeq: msg.seq,
                  }
                : current,
            );
            break;
          }
          case 'video_sync': {
            const current = store.video;
            store.updateVideo(() =>
              current
                ? {
                    ...current,
                    positionSec: msg.positionSec,
                    anchorServerTs: msg.anchorServerTs,
                    status: msg.status,
                    lastEventSeq: msg.seq,
                  }
                : current,
            );
            break;
          }
          case 'video_set_url':
            store.setVideoUrl(msg.url, msg.video);
            break;
          case 'reaction':
            store.appendReaction(msg.reaction);
            window.setTimeout(() => {
              useRoomStore.getState().removeReaction(msg.reaction.id);
            }, 4000);
            break;
          case 'room_state_update':
            // Legacy message — host/permissions are now derived from
            // `permissions_update` and `you.role`/`you.permissions`. No-op.
            break;
          case 'playlist_update':
            store.setPlaylist(msg.playlist, msg.historyLength);
            break;
          case 'permissions_update':
            store.applyPermissionsUpdate(msg.userId, msg.role, msg.permissions);
            break;
          case 'user_kicked':
            if (store.you && msg.userId === store.you.userId) {
              store.setKicked(true);
            } else {
              store.removeParticipant(msg.userId);
            }
            break;
          case 'error':
            if (msg.code === 'kicked' || msg.code === 'room_closed') {
              store.setKicked(true);
              onErrorRef.current?.(msg.message);
            } else if (msg.code === 'blocked') {
              store.setKicked(true);
              onErrorRef.current?.(msg.message);
              // Полная очистка токена + редирект на login происходит на уровне
              // Room.tsx через эффект на store.kicked. Чтобы новый /auth/me
              // возвращал 403, дополнительно бьём в localStorage.
              try {
                localStorage.removeItem('vellin.auth');
              } catch {
                /* ignore */
              }
            } else {
              onErrorRef.current?.(msg.message);
            }
            break;
          case 'ping':
            // handled inside WSClient
            break;
          case 'call_state':
            store.applyCallSnapshot(msg.snapshot);
            break;
          case 'call_peer_joined':
            store.upsertCallMember(msg.member);
            break;
          case 'call_peer_left':
            store.removeCallMember(msg.userId);
            break;
          case 'call_peer_media':
            store.setCallMemberMedia(msg.userId, msg.audio, msg.video);
            break;
          case 'call_signal_relay':
            callSignalBus.emit(msg.fromUserId, msg.payload);
            break;
          case 'call_error':
            onErrorRef.current?.(msg.message);
            break;
          default: {
            // Exhaustiveness check — fails compile if a new S2C variant
            // is added to the union without handling here.
            const _exhaustive: never = msg;
            void _exhaustive;
          }
        }
      },
      onStateChange: setState,
      onError: (err) => {
        if (err instanceof ApiHttpError) {
          onErrorRef.current?.(err.payload.message);
        } else {
          onErrorRef.current?.(err.message);
        }
      },
    });
    clientRef.current = client;
    void client.connect();

    return () => {
      active = false;
      client.close();
      clientRef.current = null;
      useRoomStore.getState().reset();
    };
  }, [opts.slug, opts.password, opts.inviteToken, opts.enabled, opts.adminMode]);

  return {
    state,
    send,
    client: clientRef.current,
  };
}
