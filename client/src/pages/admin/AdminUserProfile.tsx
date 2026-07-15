import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AdminUserFullResponse } from '@vellin/shared';
import { adminModerationApi } from '../../api/adminModeration';
import { adminApi } from '../../api/admin';
import { ApiHttpError } from '../../api/client';
import { Avatar, Button, Chip, Icon } from '../../shared';
import { AdminPage, AdminSurface, AdminEmpty } from './components/AdminPage';
import { useAdminAccess } from './AdminAccessContext';
import { ConfirmShell, DialogActions } from './AdminUsers';

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} ч ${m} м`;
  if (m > 0) return `${m} м`;
  return `${sec} с`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
const GENDER: Record<string, string> = { male: 'муж.', female: 'жен.', other: 'другой' };

export function AdminUserProfile() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAdminAccess();
  const [data, setData] = useState<AdminUserFullResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'block' | 'delete' | 'reset-avatar' | 'reset-bio' | 'reset-favorites' | 'push-off' | 'revoke-all'>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const full = await adminModerationApi.userFull(id);
      setData(full);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const canModerate = can('users.moderate');
  const canDelete = can('users.delete');

  if (loading && !data) {
    return (
      <AdminPage title="Профиль" eyebrow="Модерация">
        <AdminSurface><AdminEmpty>Загрузка…</AdminEmpty></AdminSurface>
      </AdminPage>
    );
  }
  if (error || !data) {
    return (
      <AdminPage title="Профиль" eyebrow="Модерация">
        <AdminSurface><AdminEmpty>{error ?? 'Профиль не найден'}</AdminEmpty></AdminSurface>
      </AdminPage>
    );
  }

  const u = data.user;
  const metaParts = [
    u.city,
    u.gender ? GENDER[u.gender] ?? u.gender : null,
    u.birthDate ? fmtDate(u.birthDate) : null,
    `в Vellin с ${fmtDate(u.createdAt)}`,
  ].filter(Boolean);

  const doAction = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setDialog(null);
      setToast(ok);
      await load();
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка действия');
      setDialog(null);
    }
  };

  return (
    <AdminPage
      eyebrow="Модерация · профиль-360"
      title={u.username}
      glow={u.isBlocked ? 'var(--accent-glow)' : 'rgba(53,208,127,0.16)'}
      actions={
        <Button variant="ghost" size="sm" icon="arrow" onClick={() => navigate('/admin/users')}>
          К списку
        </Button>
      }
    >
      {/* Hero */}
      <AdminSurface style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: -14, borderRadius: '50%',
                background: `radial-gradient(circle, ${u.isBlocked ? 'var(--accent-glow)' : 'rgba(53,208,127,0.35)'}, transparent 70%)`,
                filter: 'blur(18px)', zIndex: 0,
              }}
            />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <Avatar seed={u.avatarSeed} src={u.avatarUrl} name={u.username} size={92} />
            </div>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px,3vw,32px)', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                {u.username}
              </h2>
              {u.isBlocked ? <Chip tone="accent" icon="lock">заблокирован</Chip> : <Chip tone="success">активен</Chip>}
              {u.roleName && <Chip tone="accent" icon="crown">{u.roleName}</Chip>}
            </div>
            <div style={{ marginTop: 8, color: 'var(--text-2)', fontSize: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{u.email}</span>
              <span style={{ color: 'var(--text-3)' }}>·</span>
              <CopyId value={u.publicId} />
            </div>
            <div style={{ marginTop: 6, color: 'var(--text-2)', fontSize: 13 }}>
              {metaParts.map((p, i) => (
                <span key={i}>
                  {i > 0 && <span style={{ color: 'var(--text-3)', margin: '0 6px' }}>·</span>}
                  {p}
                </span>
              ))}
            </div>
            {u.bio && <p style={{ marginTop: 12, color: 'var(--text-1)', fontSize: 14, maxWidth: 620 }}>{u.bio}</p>}
            {u.isBlocked && u.blockReason && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--accent-hi)' }}>
                Причина блокировки: {u.blockReason}
              </div>
            )}

            {/* Действия */}
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link to={`/u/${u.publicId}`} style={{ textDecoration: 'none' }}>
                <Button variant="secondary" size="sm" icon="eye">Публичный профиль</Button>
              </Link>
              {canModerate && (
                u.isBlocked ? (
                  <Button variant="secondary" size="sm" icon="check" onClick={() => void doAction(() => adminApi.unblockUser(u.id), 'Разблокирован')}>
                    Разблокировать
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" icon="lock" onClick={() => setDialog('block')}>Блокировать</Button>
                )
              )}
              {canDelete && (
                <Button variant="danger" size="sm" icon="trash" onClick={() => setDialog('delete')}>Удалить</Button>
              )}
            </div>
          </div>
        </div>

        {/* Метрики */}
        <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          <Stat label="Друзья" value={data.stats.friends} />
          <Stat label="Комнаты" value={data.stats.roomsOwned} />
          <Stat label="Сообщения" value={data.stats.messagesSent} />
          <Stat label="Личные" value={data.stats.dmSent} />
          <Stat label="Устройства" value={data.stats.devices} />
          <Stat label="Push" value={data.stats.pushDevices} />
        </div>
      </AdminSurface>

      {/* Модерационные действия (за пермишеном) */}
      {canModerate && (
        <AdminSurface style={{ padding: 16 }}>
          <SectionLabel>Модерация профиля</SectionLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Button variant="ghost" size="sm" icon="image" onClick={() => setDialog('reset-avatar')} disabled={!u.avatarUrl}>Сбросить аватар</Button>
            <Button variant="ghost" size="sm" icon="edit" onClick={() => setDialog('reset-bio')} disabled={!u.bio}>Очистить «О себе»</Button>
            <Button variant="ghost" size="sm" icon="star" onClick={() => setDialog('reset-favorites')} disabled={data.favorites.length === 0}>Очистить избранное</Button>
            <Button variant="ghost" size="sm" icon="bell" onClick={() => setDialog('push-off')} disabled={data.stats.pushDevices === 0}>Отключить push</Button>
            <Button variant="ghost" size="sm" icon="logout" onClick={() => setDialog('revoke-all')} disabled={data.sessions.length === 0}>Завершить все сессии</Button>
          </div>
        </AdminSurface>
      )}

      {/* Совместное время */}
      {data.sharedWatch.length > 0 && (
        <Section title="Совместное время">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.sharedWatch.map((s) => (
              <div key={s.peer.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
                <Avatar seed={s.peer.avatarSeed} src={s.peer.avatarUrl} name={s.peer.username} size={32} />
                <Link to={`/admin/users/${s.peer.id}`} style={{ flex: 1, minWidth: 0, color: 'var(--text-0)', textDecoration: 'none', fontWeight: 500, fontSize: 14 }}>
                  {s.peer.username}
                </Link>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>{s.sessionsCount} сессий</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-0)', minWidth: 90, textAlign: 'right' }}>{fmtDur(s.totalSeconds)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Друзья + Избранное в два столбца */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        <Section title={`Друзья · ${data.friendsTotal}`}>
          {data.friends.length === 0 ? (
            <AdminEmpty>Нет друзей</AdminEmpty>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 16 }}>
              {data.friends.map((f) => (
                <Link key={f.id} to={`/admin/users/${f.id}`} title={f.username} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 56 }}>
                  <Avatar seed={f.avatarSeed} src={f.avatarUrl} name={f.username} size={44} />
                  <span style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.username}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Избранное · ${data.favorites.length}`}>
          {data.favorites.length === 0 ? (
            <AdminEmpty>Нет избранных фильмов</AdminEmpty>
          ) : (
            <div style={{ display: 'flex', gap: 10, padding: 16, overflowX: 'auto' }}>
              {data.favorites.map((f) => (
                <div key={f.kpId} style={{ width: 92, flexShrink: 0 }}>
                  <div style={{ aspectRatio: '2/3', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-3)', boxShadow: 'inset 0 0 0 1px var(--line-1)' }}>
                    {f.posterUrl && <img src={f.posterUrl} alt={f.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-1)', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</div>
                  {f.year && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.year}</div>}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Комнаты */}
      <Section title={`Комнаты · ${data.stats.roomsOwned}`}>
        {data.rooms.length === 0 ? (
          <AdminEmpty>Пользователь не создавал комнат</AdminEmpty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.rooms.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
                <Icon name="film" size={15} style={{ color: 'var(--text-2)' }} />
                <span style={{ flex: 1, minWidth: 0, fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                {r.isPrivate && <Chip tone="neutral" icon="lock">приватная</Chip>}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-3)' }}>{r.slug}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Последние сообщения */}
      <Section title="Последние сообщения">
        {data.recentMessages.length === 0 ? (
          <AdminEmpty>Нет сообщений</AdminEmpty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.recentMessages.map((m) => (
              <div key={m.id} style={{ padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(m.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>в «{m.roomName}»</span>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--text-1)', marginTop: 3, wordBreak: 'break-word' }}>{m.body}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Устройства/сессии */}
      <Section title={`Устройства и сессии · ${data.sessions.length}`}>
        {data.sessions.length === 0 ? (
          <AdminEmpty>Активных сессий нет</AdminEmpty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.sessions.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
                <Icon name="user" size={15} style={{ color: 'var(--text-2)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--text-0)' }}>{s.deviceLabel}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    {s.ip ?? 'IP —'} · активность {new Date(s.lastSeenAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {canModerate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void doAction(() => adminModerationApi.revokeSession(u.id, s.id), 'Сессия завершена')}
                  >
                    Завершить
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Push-устройства */}
      {data.pushDevices.length > 0 && (
        <Section title={`Push-устройства · ${data.pushDevices.length}`}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.pushDevices.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--line-1)' }}>
                <Icon name="bell" size={15} style={{ color: p.active ? 'var(--ok)' : 'var(--text-3)' }} />
                <span style={{ flex: 1, fontSize: 13.5 }}>{p.deviceLabel || `${p.browser} · ${p.os}`}</span>
                {p.active ? <Chip tone="success">активно</Chip> : <Chip tone="neutral">неактивно</Chip>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* История действий */}
      <Section title="История действий">
        {data.history.length === 0 ? (
          <AdminEmpty>Административных действий не было</AdminEmpty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.history.map((h) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-1)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--bg-3)', color: 'var(--text-1)' }}>{h.action}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.actorEmail}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-3)' }}>
                  {new Date(h.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--ok)', color: '#04120a', padding: '10px 18px', borderRadius: 999, fontSize: 14, fontWeight: 600, zIndex: 1200, boxShadow: 'var(--shadow-2)' }}>
          {toast} ✓
        </div>
      )}

      {/* Диалоги подтверждения */}
      {dialog === 'block' && (
        <BlockDialog username={u.username} email={u.email} onClose={() => setDialog(null)} onConfirm={(reason) => void doAction(() => adminApi.blockUser(u.id, reason), 'Заблокирован')} />
      )}
      {dialog === 'delete' && (
        <ConfirmShell title="Удалить пользователя" onClose={() => setDialog(null)}>
          <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>
            <b>{u.username}</b> ({u.email}) будет удалён каскадно вместе с комнатами и членствами. Действие необратимо.
          </p>
          <DialogActions>
            <Button variant="ghost" onClick={() => setDialog(null)}>Отмена</Button>
            <Button variant="danger" onClick={async () => { await adminApi.deleteUser(u.id); navigate('/admin/users'); }}>Удалить навсегда</Button>
          </DialogActions>
        </ConfirmShell>
      )}
      {dialog === 'reset-avatar' && (
        <SimpleConfirm title="Сбросить аватар" text={`Аватар ${u.username} вернётся к градиенту по seed.`} onClose={() => setDialog(null)} onConfirm={() => void doAction(() => adminModerationApi.resetAvatar(u.id), 'Аватар сброшен')} />
      )}
      {dialog === 'reset-bio' && (
        <SimpleConfirm title="Очистить «О себе»" text={`Текст «О себе» у ${u.username} будет удалён.`} onClose={() => setDialog(null)} onConfirm={() => void doAction(() => adminModerationApi.resetBio(u.id), 'Описание очищено')} />
      )}
      {dialog === 'reset-favorites' && (
        <SimpleConfirm title="Очистить избранное" text={`Все любимые фильмы ${u.username} будут удалены.`} onClose={() => setDialog(null)} onConfirm={() => void doAction(() => adminModerationApi.resetFavorites(u.id), 'Избранное очищено')} />
      )}
      {dialog === 'push-off' && (
        <SimpleConfirm title="Отключить push" text={`Push-уведомления для ${u.username} будут выключены (главный выключатель). Пользователь может включить их снова сам.`} onClose={() => setDialog(null)} onConfirm={() => void doAction(() => adminModerationApi.disablePush(u.id), 'Push отключён')} />
      )}
      {dialog === 'revoke-all' && (
        <SimpleConfirm title="Завершить все сессии" text={`Все входы ${u.username} будут завершены — потребуется повторный вход на всех устройствах.`} danger onClose={() => setDialog(null)} onConfirm={() => void doAction(() => adminModerationApi.revokeAllSessions(u.id), 'Все сессии завершены')} />
      )}
    </AdminPage>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 'var(--r-lg)', boxShadow: 'inset 0 0 0 1px var(--line-1)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-0)' }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 10px' }}>{title}</h3>
      <AdminSurface>{children}</AdminSurface>
    </div>
  );
}

function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: 0 }}
      title="Скопировать publicId"
    >
      <Icon name={copied ? 'check' : 'copy'} size={12} />
      {value}
    </button>
  );
}

function BlockDialog({ username, email, onClose, onConfirm }: { username: string; email: string; onClose: () => void; onConfirm: (reason?: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmShell title="Заблокировать пользователя" onClose={onClose}>
      <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>
        <b>{username}</b> ({email}) потеряет доступ. Открытые вкладки немедленно отключатся.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Причина (необязательно)"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: 10, color: 'var(--text-0)', fontFamily: 'inherit', fontSize: 13 }}
      />
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={() => onConfirm(reason.trim() || undefined)}>Заблокировать</Button>
      </DialogActions>
    </ConfirmShell>
  );
}

function SimpleConfirm({ title, text, danger, onClose, onConfirm }: { title: string; text: string; danger?: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <ConfirmShell title={title} onClose={onClose}>
      <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>{text}</p>
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>Подтвердить</Button>
      </DialogActions>
    </ConfirmShell>
  );
}
