import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ModConversationDTO, ModMessageDTO, ModMessagesResponse } from '@vellin/shared';
import { adminDmApi } from '../../api/adminModerationExtra';
import { ApiHttpError } from '../../api/client';
import { Avatar, Button, Icon } from '../../shared';
import { useIsNarrow } from '../../hooks/useMediaQuery';
import { AdminPage, AdminSurface, AdminEmpty } from './components/AdminPage';

export function AdminDmModeration() {
  const isNarrow = useIsNarrow();
  const [conversations, setConversations] = useState<ModConversationDTO[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModConversationDTO | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const data = await adminDmApi.conversations({ q: debounced || undefined, cursor, limit: 30 });
      setConversations((prev) => (cursor ? [...prev, ...data.conversations] : data.conversations));
      setNextCursor(data.nextCursor);
      setEnabled(data.enabled);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить диалоги');
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminPage
      eyebrow="Модерация · личные сообщения"
      title="Модерация ЛС"
      glow="rgba(250,204,21,0.18)"
      subtitle="Просмотр личной переписки. Чувствительный раздел: каждое открытие диалога фиксируется в журнале аудита."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(250,204,21,0.08)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--warn)' }}>
        <Icon name="eye" size={16} />
        <span>Доступ к личной переписке ограничен и журналируется. Используйте только для расследования жалоб.</span>
      </div>

      {!enabled ? (
        <AdminSurface><AdminEmpty>Раздел модерации ЛС отключён администратором сервера.</AdminEmpty></AdminSurface>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'minmax(280px, 360px) 1fr', gap: 16, alignItems: 'start' }}>
          {/* Список диалогов */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="search" size={16} style={{ color: 'var(--text-2)' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по участнику"
                style={{ flex: 1, height: 36, padding: '0 12px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--bg-2)', color: 'var(--text-0)', fontSize: 13 }}
              />
            </div>
            {error && <div style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</div>}
            <AdminSurface>
              {conversations.length === 0 && !loading ? (
                <AdminEmpty>Диалогов не найдено</AdminEmpty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {conversations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                        borderBottom: '1px solid var(--line-1)',
                        background: selected?.id === c.id ? 'var(--bg-3)' : 'transparent', color: 'var(--text-0)',
                      }}
                    >
                      <div style={{ display: 'flex' }}>
                        <Avatar seed={c.userA.avatarSeed} src={c.userA.avatarUrl} name={c.userA.username} size={28} />
                        <span style={{ marginLeft: -8 }}>
                          <Avatar seed={c.userB.avatarSeed} src={c.userB.avatarUrl} name={c.userB.username} size={28} />
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.userA.username} ↔ {c.userB.username}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                          {c.messageCount} сообщ. · {new Date(c.lastMessageAt).toLocaleDateString('ru-RU')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </AdminSurface>
            {nextCursor && (
              <Button variant="ghost" size="sm" disabled={loading} onClick={() => void load(nextCursor)}>{loading ? 'Загрузка…' : 'Ещё диалоги'}</Button>
            )}
          </div>

          {/* Просмотр треда */}
          {selected ? (
            <ThreadViewer key={selected.id} conversation={selected} />
          ) : (
            <AdminSurface><AdminEmpty>Выберите диалог слева</AdminEmpty></AdminSurface>
          )}
        </div>
      )}
    </AdminPage>
  );
}

function ThreadViewer({ conversation }: { conversation: ModConversationDTO }) {
  const [data, setData] = useState<ModMessagesResponse | null>(null);
  const [older, setOlder] = useState<ModMessageDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    adminDmApi
      .messages(conversation.id)
      .then((d) => { setData(d); setCursor(d.nextCursor); setOlder([]); setError(null); })
      .catch((e) => setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [conversation.id]);

  const loadOlder = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const d = await adminDmApi.messages(conversation.id, cursor);
      setOlder((prev) => [...d.messages, ...prev]);
      setCursor(d.nextCursor);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const messages = [...older, ...(data?.messages ?? [])];

  return (
    <AdminSurface style={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--line-1)' }}>
        <Link to={`/admin/users/${conversation.userA.id}`} style={{ color: 'var(--text-0)', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>{conversation.userA.username}</Link>
        <span style={{ color: 'var(--text-3)' }}>↔</span>
        <Link to={`/admin/users/${conversation.userB.id}`} style={{ color: 'var(--text-0)', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>{conversation.userB.username}</Link>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cursor && (
          <div style={{ textAlign: 'center' }}>
            <Button variant="ghost" size="sm" disabled={loading} onClick={() => void loadOlder()}>{loading ? '…' : 'Загрузить раньше'}</Button>
          </div>
        )}
        {error && <div style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</div>}
        {loading && messages.length === 0 && <AdminEmpty>Загрузка…</AdminEmpty>}
        {!loading && messages.length === 0 && <AdminEmpty>Сообщений нет</AdminEmpty>}
        {messages.map((m) => {
          const mine = m.senderId === conversation.userA.id;
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-start' : 'flex-end' }}>
              <div style={{ maxWidth: '78%', padding: '8px 12px', borderRadius: 14, background: mine ? 'var(--bg-3)' : 'var(--accent-soft)', boxShadow: 'inset 0 0 0 1px var(--line-1)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3, fontFamily: 'var(--font-mono)' }}>
                  {m.senderName} · {new Date(m.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
                {m.body && <div style={{ fontSize: 14, color: 'var(--text-0)', wordBreak: 'break-word' }}>{m.body}</div>}
                {m.imageUrl && (
                  <img src={m.imageUrl} alt="" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 10, marginTop: 6, objectFit: 'cover' }} />
                )}
                {m.voiceUrl && (
                  <div style={{ marginTop: 6 }}>
                    <audio controls src={m.voiceUrl} style={{ height: 34, maxWidth: 220 }} />
                  </div>
                )}
                {m.videoUrl && (
                  <video controls src={m.videoUrl} style={{ maxWidth: 200, borderRadius: 10, marginTop: 6 }} />
                )}
                {m.videoStatus === 'processing' && <MediaTag icon="video" text="видео обрабатывается" />}
                {m.inviteRoomName && <MediaTag icon="film" text={`приглашение: ${m.inviteRoomName}`} />}
              </div>
            </div>
          );
        })}
      </div>
    </AdminSurface>
  );
}

function MediaTag({ icon, text }: { icon: 'video' | 'film'; text: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic' }}>
      <Icon name={icon} size={13} />
      {text}
    </div>
  );
}
