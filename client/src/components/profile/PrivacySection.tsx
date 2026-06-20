import { useEffect, useMemo, useState } from 'react';
import type {
  FriendUser,
  PrivacyCategory,
  PrivacyRule,
  PrivacySettings,
  PrivacyVisibility,
} from '@vellin/shared';
import { defaultPrivacySettings } from '@vellin/shared';
import { Avatar, Button, Icon } from '../../shared';
import { authApi } from '../../api/auth';
import { friendsApi } from '../../api/friends';
import { ApiHttpError } from '../../api/client';
import { Card, StatusLine, labelStyle } from './ProfilePrimitives';

const CATS: { key: PrivacyCategory; title: string; desc: string }[] = [
  { key: 'online', title: 'Время «был в сети»', desc: 'Кто видит, что вы онлайн и когда заходили.' },
  { key: 'friends', title: 'Список друзей', desc: 'Кто видит ваших друзей в профиле.' },
  { key: 'personalInfo', title: 'Личная информация', desc: 'Пол, дата рождения и город.' },
  { key: 'favorites', title: 'Любимое кино', desc: 'Кто видит ваш список любимых фильмов.' },
  { key: 'messages', title: 'Личные сообщения', desc: 'Кто может писать вам в личку.' },
];

const VIS: { value: PrivacyVisibility; label: string }[] = [
  { value: 'everyone', label: 'Все' },
  { value: 'friends', label: 'Только друзья' },
  { value: 'nobody', label: 'Никто' },
];

type ExceptionKind = 'allow' | 'deny';

export function PrivacySection() {
  const [loaded, setLoaded] = useState<PrivacySettings | null>(null);
  const [draft, setDraft] = useState<PrivacySettings>(defaultPrivacySettings());
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Открытый пикер исключений: какая категория и какой список (allow/deny).
  const [picker, setPicker] = useState<{ cat: PrivacyCategory; kind: ExceptionKind } | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([authApi.privacy(), friendsApi.list()])
      .then(([p, f]) => {
        if (!alive) return;
        setLoaded(p.privacy);
        setDraft(p.privacy);
        setFriends(f.friends);
      })
      .catch((e) => {
        if (alive) setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить настройки');
      });
    return () => {
      alive = false;
    };
  }, []);

  const friendsById = useMemo(() => new Map(friends.map((f) => [f.id, f])), [friends]);
  const dirty = loaded !== null && JSON.stringify(loaded) !== JSON.stringify(draft);

  const setRule = (cat: PrivacyCategory, patch: Partial<PrivacyRule>) => {
    setSuccess(null);
    setDraft((d) => ({ ...d, [cat]: { ...d[cat], ...patch } }));
  };

  // Установить весь список исключений; ids из противоположного списка убираем
  // (один и тот же друг не может быть и в allow, и в deny).
  const applyException = (cat: PrivacyCategory, kind: ExceptionKind, ids: string[]) => {
    setSuccess(null);
    setDraft((d) => {
      const other: ExceptionKind = kind === 'allow' ? 'deny' : 'allow';
      const otherList = d[cat][other].filter((id) => !ids.includes(id));
      return { ...d, [cat]: { ...d[cat], [kind]: ids, [other]: otherList } };
    });
  };

  const removeException = (cat: PrivacyCategory, kind: ExceptionKind, id: string) => {
    setSuccess(null);
    setDraft((d) => ({ ...d, [cat]: { ...d[cat], [kind]: d[cat][kind].filter((x) => x !== id) } }));
  };

  const save = async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await authApi.updatePrivacy({ privacy: draft });
      setLoaded(res.privacy);
      setDraft(res.privacy);
      setSuccess('Сохранено');
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return (
      <Card title="Приватность" desc="Кто и что видит в вашем профиле." icon="lock">
        <div style={{ color: 'var(--text-3)', fontSize: 14 }}>{error ?? 'Загрузка…'}</div>
      </Card>
    );
  }

  return (
    <Card title="Приватность" desc="Кто и что видит в вашем профиле. Исключения переопределяют общее правило." icon="lock">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {CATS.map((c, i) => (
          <CategoryRow
            key={c.key}
            divider={i > 0}
            title={c.title}
            desc={c.desc}
            rule={draft[c.key]}
            friendsById={friendsById}
            hasFriends={friends.length > 0}
            onVisibility={(v) => setRule(c.key, { visibility: v })}
            onOpenPicker={(kind) => setPicker({ cat: c.key, kind })}
            onRemove={(kind, id) => removeException(c.key, kind, id)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
        <Button variant="primary" size="md" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <StatusLine error={error} success={success} />
      </div>

      {picker && (
        <FriendPickerModal
          title={picker.kind === 'allow' ? 'Всегда показывать' : 'Никогда не показывать'}
          friends={friends}
          selectedIds={draft[picker.cat][picker.kind]}
          onClose={() => setPicker(null)}
          onConfirm={(ids) => {
            applyException(picker.cat, picker.kind, ids);
            setPicker(null);
          }}
        />
      )}
    </Card>
  );
}

function CategoryRow({
  divider,
  title,
  desc,
  rule,
  friendsById,
  hasFriends,
  onVisibility,
  onOpenPicker,
  onRemove,
}: {
  divider: boolean;
  title: string;
  desc: string;
  rule: PrivacyRule;
  friendsById: Map<string, FriendUser>;
  hasFriends: boolean;
  onVisibility: (v: PrivacyVisibility) => void;
  onOpenPicker: (kind: ExceptionKind) => void;
  onRemove: (kind: ExceptionKind, id: string) => void;
}) {
  return (
    <div
      style={{
        padding: '16px 0',
        borderTop: divider ? '1px solid var(--line-1)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>{desc}</div>
      </div>

      {/* Сегментированный выбор базовой видимости. */}
      <div style={{ display: 'inline-flex', gap: 0, border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', overflow: 'hidden', alignSelf: 'flex-start' }}>
        {VIS.map((v, i) => {
          const active = rule.visibility === v.value;
          return (
            <button
              key={v.value}
              onClick={() => onVisibility(v.value)}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontFamily: 'inherit',
                cursor: 'pointer',
                border: 'none',
                borderLeft: i > 0 ? '1px solid var(--line-2)' : 'none',
                background: active ? 'var(--accent)' : 'var(--bg-2)',
                color: active ? '#fff' : 'var(--text-1)',
                fontWeight: active ? 600 : 400,
                transition: 'background .12s, color .12s',
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Исключения. */}
      {hasFriends ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ExceptionRow
            label="Всегда показывать"
            kind="allow"
            ids={rule.allow}
            friendsById={friendsById}
            onAdd={() => onOpenPicker('allow')}
            onRemove={(id) => onRemove('allow', id)}
          />
          <ExceptionRow
            label="Никогда не показывать"
            kind="deny"
            ids={rule.deny}
            friendsById={friendsById}
            onAdd={() => onOpenPicker('deny')}
            onRemove={(id) => onRemove('deny', id)}
          />
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Точечные исключения станут доступны, когда у вас появятся друзья.
        </div>
      )}
    </div>
  );
}

function ExceptionRow({
  label,
  kind,
  ids,
  friendsById,
  onAdd,
  onRemove,
}: {
  label: string;
  kind: ExceptionKind;
  ids: string[];
  friendsById: Map<string, FriendUser>;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const known = ids.map((id) => friendsById.get(id)).filter((f): f is FriendUser => !!f);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <span style={{ ...labelStyle, color: kind === 'deny' ? 'var(--accent-hi)' : 'var(--text-2)' }}>{label}</span>
      {known.map((f) => (
        <span
          key={f.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 6px 3px 3px',
            borderRadius: 999,
            background: 'var(--bg-3)',
            border: '1px solid var(--line-2)',
            fontSize: 12,
          }}
        >
          <Avatar seed={f.avatarSeed} src={f.avatarUrl} name={f.username} size={20} />
          {f.username}
          <button
            onClick={() => onRemove(f.id)}
            title="Убрать"
            style={{ display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0 }}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
      <button
        onClick={onAdd}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 10px',
          borderRadius: 999,
          background: 'transparent',
          border: '1px dashed var(--line-2)',
          color: 'var(--text-2)',
          fontSize: 12,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        <Icon name="plus" size={12} /> Добавить
      </button>
    </div>
  );
}

function FriendPickerModal({
  title,
  friends,
  selectedIds,
  onConfirm,
  onClose,
}: {
  title: string;
  friends: FriendUser[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(selectedIds));
  const [q, setQ] = useState('');
  const filtered = friends.filter((f) => f.username.toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = (id: string) =>
    setSel((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-lg)',
          width: 'min(460px, 100%)',
          maxHeight: '85svh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--line-1)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div style={{ padding: '12px 18px 0' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск среди друзей"
            style={{
              width: '100%',
              height: 38,
              padding: '0 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--line-2)',
              background: 'var(--bg-2)',
              color: 'var(--text-0)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Никого не найдено</div>
          )}
          {filtered.map((f) => {
            const checked = sel.has(f.id);
            return (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 'var(--r-md)',
                  border: 'none',
                  background: checked ? 'var(--bg-3)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <Avatar seed={f.avatarSeed} src={f.avatarUrl} name={f.username} size={32} />
                <span style={{ flex: 1, minWidth: 0, color: 'var(--text-0)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.username}
                </span>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    display: 'grid',
                    placeItems: 'center',
                    background: checked ? 'var(--accent)' : 'transparent',
                    border: `1px solid ${checked ? 'var(--accent)' : 'var(--line-2)'}`,
                    color: '#fff',
                  }}
                >
                  {checked && <Icon name="check" size={13} />}
                </span>
              </button>
            );
          })}
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--line-1)' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" size="sm" onClick={() => onConfirm([...sel])}>
            Готово
          </Button>
        </footer>
      </div>
    </div>
  );
}
