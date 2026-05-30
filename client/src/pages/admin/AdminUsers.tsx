import { useCallback, useEffect, useState } from 'react';
import type { AdminUserSummary } from '@vellin/shared';
import { adminApi } from '../../api/admin';
import { ApiHttpError } from '../../api/client';
import { Avatar, Button, Chip, Icon } from '../../shared';
import { useAuthStore } from '../../stores/authStore';
import { useIsNarrow } from '../../hooks/useMediaQuery';

const PAGE_LIMIT = 20;

export function AdminUsers() {
  const me = useAuthStore((s) => s.user);
  const isNarrow = useIsNarrow();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<AdminUserSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserSummary | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (resetCursor: string | null) => {
      setLoading(true);
      try {
        const data = await adminApi.listUsers({
          q: debounced || undefined,
          cursor: resetCursor ?? undefined,
          limit: PAGE_LIMIT,
        });
        setUsers((prev) => (resetCursor ? [...prev, ...data.users] : data.users));
        setNextCursor(data.nextCursor);
        setError(null);
      } catch (e) {
        setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить пользователей');
      } finally {
        setLoading(false);
      }
    },
    [debounced],
  );

  useEffect(() => {
    setCursor(null);
    void load(null);
  }, [load]);

  const onUserUpdated = (updated: AdminUserSummary) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  const onUserDeleted = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: isNarrow ? 22 : 28, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Пользователи
          </h1>
          <p style={{ marginTop: 6, color: 'var(--text-1)', fontSize: 13 }}>
            Зарегистрированные пользователи. Гостевые сессии не сохраняются.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 280px', maxWidth: isNarrow ? '100%' : 360, width: isNarrow ? '100%' : undefined }}>
          <Icon name="search" size={16} style={{ color: 'var(--text-2)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по email или username"
            style={{
              flex: 1,
              height: 36,
              padding: '0 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--line-2)',
              background: 'var(--bg-2)',
              color: 'var(--text-0)',
              fontSize: 13,
            }}
          />
        </div>
      </header>

      {error && (
        <div style={{ background: 'rgba(209,39,27,0.12)', color: 'var(--accent-hi)', padding: '10px 14px', borderRadius: 'var(--r-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
        }}
      >
        {!isNarrow && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 2fr) minmax(180px, 2fr) 120px 120px auto',
              gap: 0,
              padding: '12px 16px',
              borderBottom: '1px solid var(--line-2)',
              color: 'var(--text-2)',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 600,
            }}
          >
            <span>Пользователь</span>
            <span>Email</span>
            <span>Регистрация</span>
            <span>Статус</span>
            <span style={{ textAlign: 'right' }}>Действия</span>
          </div>
        )}
        {users.length === 0 && !loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
            Ничего не найдено
          </div>
        )}
        {users.map((u) =>
          isNarrow ? (
            <UserCard
              key={u.id}
              user={u}
              isMe={u.id === me?.id}
              onBlock={() => setBlockTarget(u)}
              onUnblock={async () => {
                try {
                  const r = await adminApi.unblockUser(u.id);
                  onUserUpdated(r.user);
                } catch (e) {
                  setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
                }
              }}
              onDelete={() => setDeleteTarget(u)}
            />
          ) : (
            <div
              key={u.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(220px, 2fr) minmax(180px, 2fr) 120px 120px auto',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid var(--line-1)',
                fontSize: 13,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar seed={u.avatarSeed} src={u.avatarUrl} name={u.username} size={32} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ color: 'var(--text-0)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.username}
                  </span>
                  {u.roomsOwned > 0 && (
                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>
                      владеет {u.roomsOwned}
                    </span>
                  )}
                </span>
              </span>
              <span style={{ color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {u.email}
              </span>
              <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
                {new Date(u.createdAt).toLocaleDateString('ru-RU')}
              </span>
              <span>
                {u.isBlocked ? (
                  <Chip tone="accent" icon="lock">заблокирован</Chip>
                ) : (
                  <Chip tone="success">активен</Chip>
                )}
              </span>
              <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {u.isBlocked ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        const r = await adminApi.unblockUser(u.id);
                        onUserUpdated(r.user);
                      } catch (e) {
                        setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
                      }
                    }}
                  >
                    Разблокировать
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={u.id === me?.id}
                    onClick={() => setBlockTarget(u)}
                  >
                    Блокировать
                  </Button>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  disabled={u.id === me?.id}
                  onClick={() => setDeleteTarget(u)}
                >
                  Удалить
                </Button>
              </span>
            </div>
          ),
        )}
      </div>

      {nextCursor && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => {
              setCursor(nextCursor);
              void load(nextCursor);
            }}
          >
            {loading ? 'Загрузка…' : 'Показать ещё'}
          </Button>
        </div>
      )}
      {/* `cursor` мы трекаем, но снаружи он не нужен — UI пагинации работает через nextCursor */}
      {cursor === '___never___' && null}

      {blockTarget && (
        <BlockUserDialog
          user={blockTarget}
          onClose={() => setBlockTarget(null)}
          onDone={(u) => {
            onUserUpdated(u);
            setBlockTarget(null);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteUserDialog
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={() => {
            onUserDeleted(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

function BlockUserDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserSummary;
  onClose: () => void;
  onDone: (u: AdminUserSummary) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.blockUser(user.id, reason.trim() || undefined);
      onDone(r.user);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmShell title="Заблокировать пользователя" onClose={onClose}>
      <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>
        <b>{user.username}</b> ({user.email}) потеряет доступ к сервису. Его открытые
        вкладки немедленно отключатся. Восстановление через «Разблокировать».
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Причина (необязательно)"
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-md)',
          padding: 10,
          color: 'var(--text-0)',
          fontFamily: 'inherit',
          fontSize: 13,
        }}
      />
      {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={busy} onClick={() => void submit()}>
          Заблокировать
        </Button>
      </DialogActions>
    </ConfirmShell>
  );
}

function DeleteUserDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.deleteUser(user.id);
      onDone();
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };
  const ok = confirm.trim().toLowerCase() === user.username.toLowerCase();
  return (
    <ConfirmShell title="Удалить пользователя" onClose={onClose}>
      <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>
        Удаление пользователя <b>{user.username}</b> ({user.email}) удалит каскадно его комнаты
        и членства. Сообщения в чужих комнатах останутся, но автор станет «удалённый».
        Действие необратимо.
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
        Введите username для подтверждения:
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--r-md)',
            padding: '8px 10px',
            color: 'var(--text-0)',
            fontFamily: 'inherit',
            fontSize: 13,
          }}
        />
      </label>
      {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="danger" disabled={busy || !ok} onClick={() => void submit()}>
          Удалить навсегда
        </Button>
      </DialogActions>
    </ConfirmShell>
  );
}

export function ConfirmShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const isNarrow = useIsNarrow();
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isNarrow ? 10 : 20,
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-lg)',
          padding: isNarrow ? 16 : 24,
          width: 'min(520px, 100%)',
          maxHeight: '90svh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function DialogActions({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

/**
 * Mobile-friendly user row. Vertical card layout: avatar + username on top,
 * email + meta below, action buttons at the bottom. Uses the same actions as
 * the desktop row but lays them out for a 320–600px viewport.
 */
function UserCard({
  user: u,
  isMe,
  onBlock,
  onUnblock,
  onDelete,
}: {
  user: AdminUserSummary;
  isMe: boolean;
  onBlock: () => void;
  onUnblock: () => void | Promise<void>;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--line-1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar seed={u.avatarSeed} src={u.avatarUrl} name={u.username} size={36} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span
            style={{
              color: 'var(--text-0)',
              fontWeight: 600,
              fontSize: 14,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {u.username}
          </span>
          <span
            style={{
              color: 'var(--text-1)',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {u.email}
          </span>
        </div>
        {u.isBlocked ? (
          <Chip tone="accent" icon="lock">блок</Chip>
        ) : (
          <Chip tone="success">актив</Chip>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          color: 'var(--text-3)',
          fontSize: 11,
        }}
      >
        <span>с {new Date(u.createdAt).toLocaleDateString('ru-RU')}</span>
        {u.roomsOwned > 0 && <span>комнат: {u.roomsOwned}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {u.isBlocked ? (
          <Button variant="secondary" size="sm" onClick={() => void onUnblock()}>
            Разблокировать
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled={isMe} onClick={onBlock}>
            Блокировать
          </Button>
        )}
        <Button variant="danger" size="sm" disabled={isMe} onClick={onDelete}>
          Удалить
        </Button>
      </div>
    </div>
  );
}
