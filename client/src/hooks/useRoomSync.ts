import { useCallback, useEffect, useRef, useState } from 'react';
import type { C2S, JoinRoomResponse, S2C } from '@vellin/shared';
import { WSClient, type WSConnectionState } from '../ws/WSClient';
import { useRoomStore } from '../stores/roomStore';
import { roomsApi } from '../api/rooms';
import { ApiHttpError } from '../api/client';

export interface UseRoomSyncOpts {
  slug: string;
  password?: string;
  inviteToken?: string;
  enabled: boolean;
  onError?: (message: string) => void;
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
            if (msg.code === 'kicked') {
              store.setKicked(true);
              onErrorRef.current?.(msg.message);
            } else {
              onErrorRef.current?.(msg.message);
            }
            break;
          case 'ping':
            // handled inside WSClient
            break;
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
  }, [opts.slug, opts.password, opts.inviteToken, opts.enabled]);

  return {
    state,
    send,
    client: clientRef.current,
  };
}
