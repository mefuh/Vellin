import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ADMIN_PERMISSION_GROUPS,
  ADMIN_PERMISSION_LABELS,
  type AdminPermission,
  type AdminRoleDTO,
  type AdminStaffMember,
  type AdminUserSummary,
} from '@vellin/shared';
import { adminAccessApi } from '../../api/adminAccess';
import { adminApi } from '../../api/admin';
import { ApiHttpError } from '../../api/client';
import { Avatar, Button, Chip, Icon } from '../../shared';
import { useIsNarrow } from '../../hooks/useMediaQuery';
import { AdminPage, AdminSurface, AdminEmpty } from './components/AdminPage';
import { useAdminAccess } from './AdminAccessContext';
import { ConfirmShell, DialogActions } from './AdminUsers';

export function AdminRoles() {
  const isNarrow = useIsNarrow();
  const { reload: reloadAccess } = useAdminAccess();
  const [roles, setRoles] = useState<AdminRoleDTO[]>([]);
  const [staff, setStaff] = useState<AdminStaffMember[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([adminAccessApi.listRoles(), adminAccessApi.listStaff()]);
      setRoles(r.roles);
      setStaff(s.staff);
      setSelectedId((prev) => prev ?? r.roles[0]?.id ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить роли');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = roles.find((r) => r.id === selectedId) ?? null;

  return (
    <AdminPage
      eyebrow="RBAC · доступ"
      title="Роли и доступ"
      subtitle="Наборы прав администраторов. Проверка всех действий выполняется на сервере — эти настройки задают, кому что доступно."
      actions={
        <Button variant="primary" size="sm" icon="plus" onClick={() => setCreating(true)}>
          Новая роль
        </Button>
      }
    >
      {error && (
        <div style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', padding: '10px 14px', borderRadius: 'var(--r-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'minmax(240px, 300px) 1fr', gap: 20, alignItems: 'start' }}>
        <AdminSurface style={{ padding: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '11px 12px',
                  borderRadius: 'var(--r-md)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: r.id === selectedId ? 'var(--bg-3)' : 'transparent',
                  boxShadow: r.id === selectedId ? 'inset 0 0 0 1px var(--line-2)' : 'none',
                  color: 'var(--text-0)',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.name}
                    {r.key === 'super_admin' && <Icon name="crown" size={13} style={{ color: 'var(--accent-hi)' }} />}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                    {r.permissions.length} прав · {r.memberCount} чел.
                  </span>
                </span>
                {r.isSystem && <Chip tone="neutral">системная</Chip>}
              </button>
            ))}
          </div>
        </AdminSurface>

        {selected ? (
          <RoleEditor
            key={selected.id}
            role={selected}
            onSaved={(updated) => {
              setRoles((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
              reloadAccess();
            }}
            onDeleted={(id) => {
              setRoles((prev) => prev.filter((x) => x.id !== id));
              setSelectedId(null);
              void load();
              reloadAccess();
            }}
            onError={setError}
          />
        ) : (
          <AdminSurface>
            <AdminEmpty>Выберите роль слева</AdminEmpty>
          </AdminSurface>
        )}
      </div>

      {/* Сотрудники */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            Сотрудники
          </h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-2)', fontSize: 13 }}>
            Пользователи с административной ролью.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon="userPlus" onClick={() => setAssigning(true)}>
          Назначить роль
        </Button>
      </div>

      <AdminSurface>
        {staff.length === 0 ? (
          <AdminEmpty>Пока нет назначенных сотрудников</AdminEmpty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {staff.map((m) => (
              <StaffRow
                key={m.id}
                member={m}
                roles={roles}
                onChanged={() => {
                  void load();
                  reloadAccess();
                }}
                onError={setError}
              />
            ))}
          </div>
        )}
      </AdminSurface>

      {creating && (
        <CreateRoleDialog
          onClose={() => setCreating(false)}
          onCreated={(role) => {
            setRoles((prev) => [...prev, role]);
            setSelectedId(role.id);
            setCreating(false);
          }}
        />
      )}
      {assigning && (
        <AssignRoleDialog
          roles={roles.filter((r) => r.key !== 'super_admin')}
          onClose={() => setAssigning(false)}
          onDone={() => {
            setAssigning(false);
            void load();
          }}
        />
      )}
    </AdminPage>
  );
}

function RoleEditor({
  role,
  onSaved,
  onDeleted,
  onError,
}: {
  role: AdminRoleDTO;
  onSaved: (r: AdminRoleDTO) => void;
  onDeleted: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const readOnly = role.key === 'super_admin';
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [perms, setPerms] = useState<Set<AdminPermission>>(new Set(role.permissions));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = useMemo(() => {
    if (name !== role.name) return true;
    if ((description || null) !== (role.description ?? null)) return true;
    if (perms.size !== role.permissions.length) return true;
    for (const p of role.permissions) if (!perms.has(p)) return true;
    return false;
  }, [name, description, perms, role]);

  const toggle = (p: AdminPermission) => {
    if (readOnly) return;
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await adminAccessApi.updateRole(role.id, {
        name: name.trim(),
        description: description.trim() || null,
        permissions: [...perms],
      });
      onSaved(res.role);
    } catch (e) {
      onError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось сохранить роль');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    setBusy(true);
    try {
      await adminAccessApi.deleteRole(role.id);
      onDeleted(role.id);
    } catch (e) {
      onError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось удалить роль');
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSurface style={{ padding: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <input
              value={name}
              disabled={readOnly}
              onChange={(e) => setName(e.target.value)}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-0)',
                width: '100%',
                padding: 0,
              }}
            />
            <input
              value={description}
              disabled={readOnly}
              placeholder="Описание роли"
              onChange={(e) => setDescription(e.target.value)}
              style={{
                marginTop: 6,
                fontSize: 13,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-2)',
                width: '100%',
                padding: 0,
              }}
            />
          </div>
          {role.key === 'super_admin' && <Chip tone="accent" icon="crown">полный доступ</Chip>}
        </div>

        {readOnly && (
          <div style={{ fontSize: 13, color: 'var(--text-2)', padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 'var(--r-md)' }}>
            Super Admin всегда имеет все права (включая будущие) и не редактируется — так исключён само-локаут.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, opacity: readOnly ? 0.6 : 1 }}>
          {ADMIN_PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
                {group.label}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
                {group.keys.map((p) => {
                  const on = perms.has(p);
                  return (
                    <button
                      key={p}
                      onClick={() => toggle(p)}
                      disabled={readOnly}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: '9px 11px',
                        borderRadius: 'var(--r-md)',
                        border: 'none',
                        cursor: readOnly ? 'default' : 'pointer',
                        textAlign: 'left',
                        background: on ? 'var(--accent-soft)' : 'var(--bg-2)',
                        boxShadow: on ? 'inset 0 0 0 1px rgba(209,39,27,0.25)' : 'inset 0 0 0 1px var(--line-1)',
                        color: on ? 'var(--text-0)' : 'var(--text-2)',
                        fontSize: 12.5,
                        transition: 'background .12s',
                      }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 5,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: on ? 'var(--accent)' : 'transparent',
                          boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--line-3)',
                        }}
                      >
                        {on && <Icon name="check" size={11} style={{ color: '#fff' }} />}
                      </span>
                      {ADMIN_PERMISSION_LABELS[p]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            {!role.isSystem ? (
              <Button variant="ghost" size="sm" icon="trash" disabled={busy} onClick={() => setConfirmDelete(true)}>
                Удалить роль
              </Button>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Системную роль нельзя удалить</span>
            )}
            <Button variant="primary" disabled={!dirty || busy || !name.trim()} onClick={() => void save()}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmShell title="Удалить роль" onClose={() => setConfirmDelete(false)}>
          <p style={{ margin: 0, color: 'var(--text-1)', fontSize: 13 }}>
            Роль <b>{role.name}</b> будет удалена. Её носители ({role.memberCount}) потеряют административный доступ.
          </p>
          <DialogActions>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Отмена</Button>
            <Button variant="danger" disabled={busy} onClick={() => void del()}>Удалить</Button>
          </DialogActions>
        </ConfirmShell>
      )}
    </AdminSurface>
  );
}

function StaffRow({
  member,
  roles,
  onChanged,
  onError,
}: {
  member: AdminStaffMember;
  roles: AdminRoleDTO[];
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const change = async (roleId: string | null) => {
    setBusy(true);
    try {
      await adminAccessApi.assignRole(member.id, roleId);
      onChanged();
    } catch (e) {
      onError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось изменить роль');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid var(--line-1)',
      }}
    >
      <Avatar seed={member.avatarSeed} src={member.avatarUrl} name={member.username} size={34} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.username}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.email}</span>
      </div>
      <select
        value={member.roleId ?? ''}
        disabled={busy || member.roleKey === 'super_admin'}
        onChange={(e) => void change(e.target.value || null)}
        style={{
          height: 34,
          padding: '0 10px',
          borderRadius: 999,
          background: 'var(--bg-2)',
          color: 'var(--text-0)',
          border: '1px solid var(--line-2)',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
        <option value="">— снять доступ —</option>
      </select>
    </div>
  );
}

function CreateRoleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (r: AdminRoleDTO) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminAccessApi.createRole({ name: name.trim(), permissions: [] });
      onCreated(res.role);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmShell title="Новая роль" onClose={onClose}>
      <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
        Создайте кастомную роль, затем настройте её права в редакторе.
      </p>
      <input
        value={name}
        autoFocus
        placeholder="Название роли"
        onChange={(e) => setName(e.target.value)}
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: '10px 12px', color: 'var(--text-0)', fontSize: 14 }}
      />
      {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void submit()}>Создать</Button>
      </DialogActions>
    </ConfirmShell>
  );
}

/** Поиск пользователя (по admin-списку) и назначение ему роли. */
function AssignRoleDialog({ roles, onClose, onDone }: { roles: AdminRoleDTO[]; onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<AdminUserSummary[]>([]);
  const [picked, setPicked] = useState<AdminUserSummary | null>(null);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debounced) {
      setResults([]);
      return;
    }
    let alive = true;
    adminApi
      .listUsers({ q: debounced, limit: 8 })
      .then((r) => alive && setResults(r.users))
      .catch(() => alive && setError('Поиск недоступен (нужно право users.view)'));
    return () => {
      alive = false;
    };
  }, [debounced]);

  const submit = async () => {
    if (!picked || !roleId) return;
    setBusy(true);
    setError(null);
    try {
      await adminAccessApi.assignRole(picked.id, roleId);
      onDone();
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmShell title="Назначить роль" onClose={onClose}>
      {!picked ? (
        <>
          <input
            value={query}
            autoFocus
            placeholder="Поиск пользователя по email или username"
            onChange={(e) => setQuery(e.target.value)}
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: '10px 12px', color: 'var(--text-0)', fontSize: 14 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => setPicked(u)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer', background: 'var(--bg-2)', color: 'var(--text-0)', textAlign: 'left' }}
              >
                <Avatar seed={u.avatarSeed} src={u.avatarUrl} name={u.username} size={30} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{u.username}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{u.email}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar seed={picked.avatarSeed} src={picked.avatarUrl} name={picked.username} size={34} />
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ fontSize: 14 }}>{picked.username}</b>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{picked.email}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)} style={{ marginLeft: 'auto' }}>Сменить</Button>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
            Роль
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              style={{ height: 38, padding: '0 12px', borderRadius: 'var(--r-md)', background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--line-2)', fontSize: 14 }}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={!picked || !roleId || busy} onClick={() => void submit()}>Назначить</Button>
      </DialogActions>
    </ConfirmShell>
  );
}
