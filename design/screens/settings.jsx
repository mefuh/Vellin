// Vellin — Настройки комнаты
const RoomSettings = () => {
  const [tab, setTab] = React.useState('overview');
  return (
    <AppFrame width={1280} height={820} dark title="Настройки · Закат в Альпах">
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '260px 1fr', background: 'var(--bg-0)' }}>
        {/* Сайдбар настроек */}
        <div style={{ background: 'var(--bg-1)', borderRight: '1px solid var(--line-1)', padding: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 18px' }}>
            <button style={{ width: 28, height: 28, border: 'none', background: 'var(--bg-3)', color: 'var(--text-1)', borderRadius: 8, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <Icon name="chevron" size={12} stroke={2.2}/>
            </button>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Комната</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Закат в Альпах</div>
            </div>
          </div>
          {[
            { id: 'overview', i: 'settings', l: 'Обзор' },
            { id: 'access', i: 'lock', l: 'Доступ и роли' },
            { id: 'playback', i: 'play', l: 'Воспроизведение' },
            { id: 'chat', i: 'chat', l: 'Чат и реакции' },
            { id: 'audio', i: 'mic', l: 'Звук и голос' },
            { id: 'integrations', i: 'cast', l: 'Интеграции' },
            { id: 'danger', i: 'trash', l: 'Опасная зона' },
          ].map(t => (
            <div key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              borderRadius: 8, cursor: 'pointer',
              background: tab === t.id ? 'var(--bg-3)' : 'transparent',
              color: tab === t.id ? 'var(--text-0)' : 'var(--text-1)',
              fontSize: 13.5,
            }}>
              <Icon name={t.i} size={14}/>{t.l}
            </div>
          ))}
        </div>

        {/* Контент */}
        <div style={{ overflow: 'auto', padding: '32px 48px' }}>
          <div style={{ maxWidth: 720 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>Обзор комнаты</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 6 }}>Базовые параметры, видимость и поведение по умолчанию.</p>

            <Card title="Идентичность">
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 96, height: 96, borderRadius: 'var(--r-lg)', background: 'var(--bg-3)', border: '1px solid var(--line-2)', overflow: 'hidden', position: 'relative' }}>
                  <MountainPoster seed={0}/>
                  <button style={{ position: 'absolute', right: 6, bottom: 6, padding: '4px 8px', fontSize: 10, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer' }}>Изменить</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Row label="Название"><Input value="Закат в Альпах"/></Row>
                  <Row label="Описание"><Input value="Пятничный показ кинопроб и таймлапсов"/></Row>
                </div>
              </div>
            </Card>

            <Card title="Видимость" desc="Кто может видеть и заходить в комнату.">
              <SettingRow label="Тип комнаты" value="Приватная" hint="Видна только по ссылке"/>
              <SettingRow label="Пароль" value="•••••••" action="Сменить"/>
              <SettingRow label="Лимит участников" value="50"/>
              <SettingRowToggle label="Разрешить гостевой вход" desc="Гости заходят по ссылке без регистрации" value={true}/>
              <SettingRowToggle label="Показывать в обзоре" desc="Только при публичном типе" value={false} disabled/>
            </Card>

            <Card title="Поведение по умолчанию">
              <SettingRowToggle label="Авто-синхронизация" desc="Подтягивать новых участников к текущей позиции" value={true}/>
              <SettingRowToggle label="Только хост ставит на паузу" value={true}/>
              <SettingRowToggle label="Реакции поверх видео" value={true}/>
              <SettingRow label="Стартовое качество" value="Авто (до 4K)"/>
            </Card>

            <Card title="Опасная зона" tone="danger">
              <SettingRow label="Архивировать комнату" value="" action="Архивировать"/>
              <div style={{ height: 1, background: 'var(--line-1)', margin: '4px 0' }}/>
              <SettingRow label="Удалить комнату навсегда" value="" desc="Действие нельзя отменить. История чата и список участников исчезнут." actionDanger="Удалить"/>
            </Card>
          </div>
        </div>
      </div>
    </AppFrame>
  );
};

const Card = ({ title, desc, children, tone }) => (
  <div style={{
    marginTop: 24, padding: 24, background: 'var(--bg-1)',
    border: `1px solid ${tone === 'danger' ? 'rgba(209,39,27,0.3)' : 'var(--line-1)'}`,
    borderRadius: 'var(--r-lg)',
  }}>
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: tone === 'danger' ? 'var(--accent-hi)' : 'var(--text-0)' }}>{title}</div>
      {desc && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{desc}</div>}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {children}
    </div>
  </div>
);

const Row = ({ label, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'center' }}>
    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
    {children}
  </div>
);

const Input = ({ value }) => (
  <input readOnly defaultValue={value} style={{
    width: '100%', height: 36, padding: '0 12px',
    background: 'var(--bg-3)', border: '1px solid var(--line-2)',
    borderRadius: 'var(--r-sm)', color: 'var(--text-0)',
    fontFamily: 'inherit', fontSize: 13, outline: 'none',
  }}/>
);

const SettingRow = ({ label, value, hint, desc, action, actionDanger }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13.5, color: 'var(--text-0)' }}>{label}</div>
      {(hint || desc) && <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 3 }}>{hint || desc}</div>}
    </div>
    {value && <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{value}</span>}
    {action && <Button variant="secondary" size="sm">{action}</Button>}
    {actionDanger && <Button variant="danger" size="sm">{actionDanger}</Button>}
    {value && !action && !actionDanger && <Icon name="chevron" size={13}/>}
  </div>
);

const SettingRowToggle = ({ label, desc, value, disabled }) => {
  const [v, setV] = React.useState(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0', opacity: disabled ? 0.5 : 1 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text-0)' }}>{label}</div>
        {desc && <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 3 }}>{desc}</div>}
      </div>
      <div onClick={() => !disabled && setV(!v)} style={{
        width: 38, height: 22, borderRadius: 11,
        background: v ? 'var(--accent)' : 'var(--bg-4)',
        padding: 2, cursor: disabled ? 'default' : 'pointer',
        transition: 'background .15s',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transform: v ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform .15s',
        }}/>
      </div>
    </div>
  );
};

window.RoomSettings = RoomSettings;
