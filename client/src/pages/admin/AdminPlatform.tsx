import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AnnouncementDTO,
  FeatureFlagDTO,
  PlatformSettingsDTO,
  UpsertAnnouncementRequest,
} from '@vellin/shared';
import { adminPlatformApi } from '../../api/adminPlatform';
import { ApiHttpError } from '../../api/client';
import { Button, Chip, Icon } from '../../shared';
import { AdminPage, AdminSurface, AdminEmpty } from './components/AdminPage';
import { ConfirmShell, DialogActions } from './AdminUsers';

type Tab = 'settings' | 'flags' | 'announcements';
const TABS: { key: Tab; label: string }[] = [
  { key: 'settings', label: 'Настройки' },
  { key: 'flags', label: 'Feature flags' },
  { key: 'announcements', label: 'Объявления' },
];

export function AdminPlatform() {
  const [tab, setTab] = useState<Tab>('settings');
  return (
    <AdminPage eyebrow="Платформа" title="Управление платформой" subtitle="Тумблеры, лимиты, режим обслуживания, feature flags и объявления. Все изменения фиксируются в журнале аудита.">
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500,
              background: active ? 'var(--bg-3)' : 'var(--bg-1)', color: active ? 'var(--text-0)' : 'var(--text-2)',
              boxShadow: active ? 'inset 0 0 0 1px var(--line-2)' : 'inset 0 0 0 1px var(--line-1)',
            }}>{t.label}</button>
          );
        })}
      </div>
      {tab === 'settings' && <SettingsTab />}
      {tab === 'flags' && <FlagsTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
    </AdminPage>
  );
}

function GroupCaption({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 16px 6px', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--line-1)', background: 'var(--bg-2)',
    }}>
      {children}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange, danger }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: '1px solid var(--line-1)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--text-0)', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{hint}</div>}
      </div>
      <button onClick={() => onChange(!checked)} aria-pressed={checked} style={{
        width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, position: 'relative',
        background: checked ? (danger ? 'var(--accent)' : 'var(--ok)') : 'var(--bg-4)', transition: 'background .16s',
      }}>
        <span style={{ position: 'absolute', top: 3, left: checked ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .16s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
      </button>
    </div>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState<PlatformSettingsDTO | null>(null);
  const [draft, setDraft] = useState<PlatformSettingsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminPlatformApi.getSettings()
      .then((r) => { setSettings(r.settings); setDraft(structuredClone(r.settings)); })
      .catch((e) => setError(e instanceof ApiHttpError ? e.payload.message : 'Не удалось загрузить настройки'));
  }, []);

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(draft), [settings, draft]);

  if (!draft || !settings) {
    return <AdminSurface><AdminEmpty>{error ?? 'Загрузка…'}</AdminEmpty></AdminSurface>;
  }

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const r = await adminPlatformApi.updateSettings({ toggles: draft.toggles, maintenance: draft.maintenance, limits: draft.limits });
      setSettings(r.settings); setDraft(structuredClone(r.settings));
      setSaved(true); window.setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка сохранения');
    } finally { setSaving(false); }
  };

  const T = draft.toggles;
  const setT = (k: keyof typeof T, v: boolean) => setDraft({ ...draft, toggles: { ...draft.toggles, [k]: v } });
  const setLimit = (k: keyof PlatformSettingsDTO['limits'], v: number) => setDraft({ ...draft, limits: { ...draft.limits, [k]: v } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <div style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)', padding: '10px 14px', borderRadius: 'var(--r-md)', fontSize: 13 }}>{error}</div>}

      <div>
        <SectionH>Доступность функций</SectionH>
        <p style={{ margin: '-4px 0 10px', fontSize: 12.5, color: 'var(--text-2)' }}>
          Выключенная функция мгновенно перестаёт работать у всех пользователей (без перезапуска). Уже открытые комнаты продолжают синхронизацию видео.
        </p>
        <AdminSurface>
          <GroupCaption>Доступ</GroupCaption>
          <ToggleRow label="Регистрация" hint="Новые пользователи могут создавать аккаунты" checked={T.registration} onChange={(v) => setT('registration', v)} />
          <ToggleRow label="Гостевой вход" hint="Вход без регистрации" checked={T.guests} onChange={(v) => setT('guests', v)} />

          <GroupCaption>Комнаты и просмотр</GroupCaption>
          <ToggleRow label="Создание комнат" hint="Пользователи могут создавать новые комнаты" checked={T.roomCreation} onChange={(v) => setT('roomCreation', v)} />
          <ToggleRow label="Чат в комнатах" hint="Сообщения в чате комнаты" checked={T.roomChat} onChange={(v) => setT('roomChat', v)} />
          <ToggleRow label="Реакции" hint="Эмодзи-реакции во время просмотра" checked={T.reactions} onChange={(v) => setT('reactions', v)} />
          <ToggleRow label="Звонки" hint="Голосовые и видеозвонки в комнатах" checked={T.calls} onChange={(v) => setT('calls', v)} />
          <ToggleRow label="Плейлисты" hint="Очередь видео в комнате" checked={T.playlists} onChange={(v) => setT('playlists', v)} />

          <GroupCaption>Общение</GroupCaption>
          <ToggleRow label="Личные сообщения" hint="Переписка в личных диалогах" checked={T.directMessages} onChange={(v) => setT('directMessages', v)} />
          <ToggleRow label="Друзья" hint="Отправка и приём заявок в друзья" checked={T.friends} onChange={(v) => setT('friends', v)} />
          <ToggleRow label="Приглашения в комнаты" hint="Ссылки-приглашения и зов друзей в комнату" checked={T.invites} onChange={(v) => setT('invites', v)} />

          <GroupCaption>Контент и уведомления</GroupCaption>
          <ToggleRow label="Загрузка файлов" hint="Аватары, изображения/голос/видео в ЛС" checked={T.uploads} onChange={(v) => setT('uploads', v)} />
          <ToggleRow label="Избранные фильмы" hint="Поиск и добавление любимых фильмов в профиль" checked={T.favorites} onChange={(v) => setT('favorites', v)} />
          <ToggleRow label="Push-уведомления" hint="Подписка на пуши и тестовая отправка" checked={T.push} onChange={(v) => setT('push', v)} />
        </AdminSurface>
      </div>

      <div>
        <SectionH>Режим обслуживания</SectionH>
        <AdminSurface>
          <ToggleRow label="Технические работы" hint="Не-администраторы не смогут войти" checked={draft.maintenance.enabled} onChange={(v) => setDraft({ ...draft, maintenance: { ...draft.maintenance, enabled: v } })} danger />
          <div style={{ padding: 16 }}>
            <input value={draft.maintenance.message} onChange={(e) => setDraft({ ...draft, maintenance: { ...draft.maintenance, message: e.target.value } })}
              placeholder="Сообщение для пользователей (необязательно)"
              style={{ width: '100%', height: 40, padding: '0 12px', borderRadius: 'var(--r-md)', background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--line-2)', fontSize: 14 }} />
          </div>
        </AdminSurface>
      </div>

      <div>
        <SectionH>Лимиты</SectionH>
        <AdminSurface>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <NumberField label="Макс. участников комнаты" value={draft.limits.maxRoomParticipants} onChange={(v) => setLimit('maxRoomParticipants', v)} />
            <NumberField label="Аватар, МБ" value={draft.limits.avatarMaxMb} onChange={(v) => setLimit('avatarMaxMb', v)} />
            <NumberField label="Изображение ЛС, МБ" value={draft.limits.dmImageMaxMb} onChange={(v) => setLimit('dmImageMaxMb', v)} />
            <NumberField label="Голосовое ЛС, МБ" value={draft.limits.dmVoiceMaxMb} onChange={(v) => setLimit('dmVoiceMaxMb', v)} />
            <NumberField label="Видео ЛС, МБ" value={draft.limits.dmVideoMaxMb} onChange={(v) => setLimit('dmVideoMaxMb', v)} />
          </div>
          <div style={{ padding: '0 16px 14px', fontSize: 12, color: 'var(--text-3)' }}>
            Лимиты хранятся и отдаются клиенту; жёсткий предел загрузки применяется на уровне сервера при перезапуске.
          </div>
        </AdminSurface>
      </div>

      {(dirty || saved) && (
        <div style={{ position: 'sticky', bottom: 16, display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
          {saved && <Chip tone="success">Сохранено</Chip>}
          <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
        </div>
      )}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
        style={{ height: 38, padding: '0 12px', borderRadius: 'var(--r-md)', background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--line-2)', fontSize: 15 }} />
    </label>
  );
}

function SectionH({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{children}</h3>;
}

// ── Feature flags ────────────────────────────────────────────────────────────
function FlagsTab() {
  const [flags, setFlags] = useState<FeatureFlagDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setFlags((await adminPlatformApi.listFlags()).flags); setError(null); }
    catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (f: FeatureFlagDTO) => {
    try { await adminPlatformApi.upsertFlag({ key: f.key, enabled: !f.enabled, description: f.description }); void load(); }
    catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); }
  };
  const del = async (key: string) => {
    try { await adminPlatformApi.deleteFlag(key); void load(); }
    catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Включение функций без деплоя. Пример: <code style={{ fontFamily: 'var(--font-mono)' }}>moderation.dm</code> управляет разделом модерации ЛС.</div>
        <Button variant="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>Новый флаг</Button>
      </div>
      {error && <div style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</div>}
      <AdminSurface>
        {flags.length === 0 ? <AdminEmpty>Флагов нет</AdminEmpty> : flags.map((f) => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid var(--line-1)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--text-0)' }}>{f.key}</div>
              {f.description && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{f.description}</div>}
            </div>
            <button onClick={() => void toggle(f)} style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, position: 'relative', background: f.enabled ? 'var(--ok)' : 'var(--bg-4)' }}>
              <span style={{ position: 'absolute', top: 3, left: f.enabled ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .16s' }} />
            </button>
            <Button variant="ghost" size="sm" icon="trash" onClick={() => void del(f.key)} />
          </div>
        ))}
      </AdminSurface>
      {adding && <FlagDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); void load(); }} />}
    </div>
  );
}

function FlagDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { await adminPlatformApi.upsertFlag({ key: key.trim(), enabled, description: description.trim() || null }); onDone(); }
    catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); setBusy(false); }
  };
  return (
    <ConfirmShell title="Новый feature flag" onClose={onClose}>
      <input value={key} autoFocus placeholder="ключ (например new.player)" onChange={(e) => setKey(e.target.value)}
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: '10px 12px', color: 'var(--text-0)', fontSize: 14, fontFamily: 'var(--font-mono)' }} />
      <input value={description} placeholder="Описание (необязательно)" onChange={(e) => setDescription(e.target.value)}
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: '10px 12px', color: 'var(--text-0)', fontSize: 14 }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-1)', cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Включить сразу
      </label>
      {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={busy || !key.trim()} onClick={() => void submit()}>Создать</Button>
      </DialogActions>
    </ConfirmShell>
  );
}

// ── Объявления ───────────────────────────────────────────────────────────────
const KIND_LABEL = { banner: 'Баннер', modal: 'Модалка', news: 'Новость' } as const;

function AnnouncementsTab() {
  const [items, setItems] = useState<AnnouncementDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AnnouncementDTO | 'new' | null>(null);

  const load = useCallback(async () => {
    try { setItems((await adminPlatformApi.listAnnouncements()).announcements); setError(null); }
    catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggleActive = async (a: AnnouncementDTO) => {
    try {
      await adminPlatformApi.updateAnnouncement(a.id, { kind: a.kind, title: a.title, body: a.body, ctaLabel: a.ctaLabel, ctaUrl: a.ctaUrl, style: a.style, audience: a.audience, active: !a.active, startsAt: a.startsAt, endsAt: a.endsAt });
      void load();
    } catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); }
  };
  const del = async (id: string) => {
    try { await adminPlatformApi.deleteAnnouncement(id); void load(); }
    catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Баннеры, модалки и новости с таргетингом по аудитории.</div>
        <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing('new')}>Новое объявление</Button>
      </div>
      {error && <div style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</div>}
      <AdminSurface>
        {items.length === 0 ? <AdminEmpty>Объявлений нет</AdminEmpty> : items.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid var(--line-1)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>{a.title}</span>
                <Chip tone="neutral">{KIND_LABEL[a.kind]}</Chip>
                {a.active ? <Chip tone="success">активно</Chip> : <Chip tone="neutral">черновик</Chip>}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>{a.audience.kind}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>{a.body}</div>
            </div>
            <button onClick={() => void toggleActive(a)} title={a.active ? 'Выключить' : 'Включить'} style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, position: 'relative', background: a.active ? 'var(--ok)' : 'var(--bg-4)' }}>
              <span style={{ position: 'absolute', top: 3, left: a.active ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff' }} />
            </button>
            <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(a)} />
            <Button variant="ghost" size="sm" icon="trash" onClick={() => void del(a.id)} />
          </div>
        ))}
      </AdminSurface>
      {editing && <AnnouncementDialog initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function AnnouncementDialog({ initial, onClose, onDone }: { initial: AnnouncementDTO | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<UpsertAnnouncementRequest>(() => initial
    ? { kind: initial.kind, title: initial.title, body: initial.body, ctaLabel: initial.ctaLabel, ctaUrl: initial.ctaUrl, style: initial.style, audience: initial.audience, active: initial.active, startsAt: initial.startsAt, endsAt: initial.endsAt }
    : { kind: 'banner', title: '', body: '', style: 'info', audience: { kind: 'all' }, active: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof UpsertAnnouncementRequest>(k: K, v: UpsertAnnouncementRequest[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (initial) await adminPlatformApi.updateAnnouncement(initial.id, form);
      else await adminPlatformApi.createAnnouncement(form);
      onDone();
    } catch (e) { setError(e instanceof ApiHttpError ? e.payload.message : 'Ошибка'); setBusy(false); }
  };

  const inp = { background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: '10px 12px', color: 'var(--text-0)', fontSize: 14 } as const;

  return (
    <ConfirmShell title={initial ? 'Редактировать объявление' : 'Новое объявление'} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Select value={form.kind} onChange={(v) => set('kind', v as UpsertAnnouncementRequest['kind'])} options={[['banner', 'Баннер'], ['modal', 'Модалка'], ['news', 'Новость']]} />
        <Select value={form.style ?? 'info'} onChange={(v) => set('style', v as UpsertAnnouncementRequest['style'])} options={[['info', 'Инфо'], ['accent', 'Акцент'], ['warn', 'Предупр.']]} />
        <Select value={form.audience?.kind ?? 'all'} onChange={(v) => set('audience', { kind: v as 'all' | 'role' | 'new-users' })} options={[['all', 'Все'], ['new-users', 'Новые'], ['role', 'По роли']]} />
      </div>
      <input value={form.title} placeholder="Заголовок" onChange={(e) => set('title', e.target.value)} style={inp} />
      <textarea value={form.body} placeholder="Текст" rows={3} onChange={(e) => set('body', e.target.value)} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={form.ctaLabel ?? ''} placeholder="Кнопка (текст)" onChange={(e) => set('ctaLabel', e.target.value || null)} style={{ ...inp, flex: 1 }} />
        <input value={form.ctaUrl ?? ''} placeholder="Ссылка" onChange={(e) => set('ctaUrl', e.target.value || null)} style={{ ...inp, flex: 1 }} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-1)', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.active ?? false} onChange={(e) => set('active', e.target.checked)} /> Активно
      </label>
      {error && <span style={{ color: 'var(--accent-hi)', fontSize: 13 }}>{error}</span>}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={busy || !form.title.trim() || !form.body.trim()} onClick={() => void submit()}>{initial ? 'Сохранить' : 'Создать'}</Button>
      </DialogActions>
    </ConfirmShell>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, height: 40, padding: '0 10px', borderRadius: 'var(--r-md)', background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--line-2)', fontSize: 13.5, cursor: 'pointer' }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
