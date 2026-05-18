// Vellin — Модалка создания комнаты
const CreateRoomModal = () => {
  const [privacy, setPrivacy] = React.useState('private');
  const [allowGuests, setAllowGuests] = React.useState(true);
  const [hostControl, setHostControl] = React.useState(true);
  return (
    <AppFrame width={1280} height={820} dark title="vellin.app — Создание комнаты">
      <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-0)' }}>
        {/* Фоновый блюр (мок интерфейса позади) */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.4, filter: 'blur(8px)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 320px', height: '100%' }}>
            <div style={{ background: 'var(--bg-1)' }}/>
            <div style={{ background: '#000', display: 'grid', placeItems: 'center' }}>
              <MountainPoster seed={2}/>
            </div>
            <div style={{ background: 'var(--bg-1)' }}/>
          </div>
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,4,3,0.65)', backdropFilter: 'blur(20px)' }}/>

        {/* Модалка */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 600,
          background: 'linear-gradient(180deg, var(--bg-2), var(--bg-1))',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-3)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent-hi)' }}>
              <Icon name="plus" size={20} stroke={2.2}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em' }}>Новая комната</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>Создайте пространство для общего просмотра</div>
            </div>
            <button style={{ width: 32, height: 32, border: 'none', background: 'var(--bg-3)', color: 'var(--text-1)', borderRadius: 8, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <Icon name="close" size={14}/>
            </button>
          </div>

          <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <ModalField label="Название комнаты" value="Пятничный кинозал" hint="Так комната будет видна участникам."/>

            <div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>Приватность</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <PrivacyOption
                  active={privacy === 'private'} onClick={() => setPrivacy('private')}
                  icon="lock" title="Приватная"
                  desc="Только по ссылке-приглашению"
                />
                <PrivacyOption
                  active={privacy === 'public'} onClick={() => setPrivacy('public')}
                  icon="globe" title="Публичная"
                  desc="Видна в обзоре, любой может войти"
                />
              </div>
            </div>

            {privacy === 'private' && (
              <ModalField label="Пароль (необязательно)" value="" placeholder="оставьте пустым, если не нужен" icon="lock"/>
            )}

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Лимит участников</span>
                <span style={{ fontSize: 12, color: 'var(--text-0)', fontFamily: 'var(--font-mono)' }}>12 / 50</span>
              </div>
              <div style={{ position: 'relative', height: 28, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--bg-3)', overflow: 'hidden' }}>
                  <div style={{ width: '24%', height: '100%', background: 'var(--accent)' }}/>
                </div>
                <div style={{ position: 'absolute', left: '24%', transform: 'translateX(-50%)', width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-3)' }}>
                <span>2</span><span>10</span><span>25</span><span>50</span>
              </div>
            </div>

            <Toggle label="Разрешить гостевой вход" desc="Гости заходят по ссылке без регистрации" value={allowGuests} onChange={setAllowGuests}/>
            <Toggle label="Только хост управляет плеером" desc="Иначе плеер общий для всех" value={hostControl} onChange={setHostControl}/>
          </div>

          <div style={{ padding: '16px 28px', borderTop: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-1)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>
              После создания комната будет доступна по ссылке<br/>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-hi)' }}>vellin.app/r/cinema-fri-{Math.floor(Math.random()*999)}</span>
            </div>
            <Button variant="ghost">Отмена</Button>
            <Button variant="primary" iconRight="arrow">Создать комнату</Button>
          </div>
        </div>
      </div>
    </AppFrame>
  );
};

const ModalField = ({ label, value, placeholder, icon, hint }) => (
  <div>
    <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>{label}</div>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      height: 44, padding: '0 14px',
      background: 'var(--bg-3)', border: '1px solid var(--line-2)',
      borderRadius: 'var(--r-md)',
    }}>
      {icon && <Icon name={icon} size={15}/>}
      <input readOnly defaultValue={value} placeholder={placeholder} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-0)', fontFamily: 'inherit', fontSize: 14 }}/>
    </div>
    {hint && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{hint}</div>}
  </div>
);

const PrivacyOption = ({ active, onClick, icon, title, desc }) => (
  <button onClick={onClick} style={{
    padding: 14, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
    background: active ? 'var(--accent-soft)' : 'var(--bg-3)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--line-2)'}`,
    borderRadius: 'var(--r-md)',
    color: 'var(--text-0)',
    display: 'flex', alignItems: 'flex-start', gap: 12,
  }}>
    <div style={{ width: 32, height: 32, borderRadius: 8, background: active ? 'var(--accent)' : 'var(--bg-4)', color: active ? '#fff' : 'var(--text-1)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Icon name={icon} size={14}/>
    </div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
    </div>
  </button>
);

const Toggle = ({ label, desc, value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }} onClick={() => onChange(!value)}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-0)' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{desc}</div>
    </div>
    <div style={{
      width: 38, height: 22, borderRadius: 11,
      background: value ? 'var(--accent)' : 'var(--bg-4)',
      display: 'flex', alignItems: 'center',
      padding: 2, cursor: 'pointer',
      transition: 'background .15s',
      boxShadow: value ? '0 2px 8px var(--accent-glow)' : 'inset 0 0 0 1px var(--line-2)',
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transform: value ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform .15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
      }}/>
    </div>
  </div>
);

window.CreateRoomModal = CreateRoomModal;
