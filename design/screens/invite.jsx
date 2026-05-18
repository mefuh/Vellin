// Vellin — Приглашение в комнату (модалка/панель)
const InviteModal = () => {
  return (
    <AppFrame width={1280} height={820} dark title="vellin.app/r/dusk-alps-7f3">
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* фоновое видео */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <MountainPoster seed={0}/>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,6,5,0.7)', backdropFilter: 'blur(24px)' }}/>
        </div>

        {/* Модалка */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 640,
          background: 'linear-gradient(180deg, var(--bg-2), var(--bg-1))',
          border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-3)',
          overflow: 'hidden',
        }}>
          {/* Шапка с превью */}
          <div style={{ position: 'relative', height: 160, overflow: 'hidden' }}>
            <MountainPoster seed={0}/>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(20,16,14,0.95))' }}/>
            <div style={{ position: 'absolute', left: 24, bottom: 16, right: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <Chip tone="live" style={{ marginBottom: 10 }}>В ЭФИРЕ</Chip>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="hash" size={18}/>
                  <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>Закат в Альпах</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>5 участников · приватная · хост: Артём</div>
              </div>
              <button style={{ width: 32, height: 32, border: 'none', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', color: '#fff', borderRadius: 8, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <Icon name="close" size={14}/>
              </button>
            </div>
          </div>

          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>Ссылка-приглашение</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                height: 48, padding: '0 6px 0 16px',
                background: 'var(--bg-3)', border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-md)',
              }}>
                <Icon name="link" size={15}/>
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-0)' }}>
                  vellin.app/r/<span style={{ color: 'var(--accent-hi)' }}>dusk-alps-7f3</span>
                </span>
                <Button variant="primary" size="sm" icon="copy">Скопировано</Button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
              {/* QR */}
              <div style={{ padding: 16, background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{
                  width: 84, height: 84, padding: 6,
                  background: '#fff', borderRadius: 8,
                  display: 'grid', placeItems: 'center',
                }}>
                  <FakeQR/>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Откройте с телефона</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.4 }}>Наведите камеру на QR-код — присоединитесь как гость одним тапом.</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ShareBtn icon="copy" label="Скопировать"/>
                <ShareBtn icon="send" label="Telegram"/>
                <ShareBtn icon="link" label="Discord"/>
              </div>
            </div>

            {/* Опции */}
            <div style={{ padding: 16, background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Icon name="settings" size={13}/>
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-1)' }}>Параметры ссылки</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <InviteOpt label="Срок действия" value="24 часа"/>
                <InviteOpt label="Максимум входов" value="без ограничения"/>
                <InviteOpt label="Гости" value="разрешены"/>
              </div>
            </div>

            {/* Кому уже отправлено */}
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>Кто получил приглашение</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: -6 }}>
                {[
                  { n: 'Аня', s: 'online' },
                  { n: 'Миша', s: 'online' },
                  { n: 'Даня', s: 'online' },
                  { n: 'Ева', s: 'idle' },
                  { n: 'Кирилл' },
                ].map((p, i) => (
                  <div key={i} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                    <Avatar name={p.n} size={32} status={p.s}/>
                  </div>
                ))}
                <button style={{ marginLeft: -8, width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-3)', border: '2px dashed var(--line-2)', display: 'grid', placeItems: 'center', color: 'var(--text-2)', cursor: 'pointer' }}>
                  <Icon name="plus" size={14}/>
                </button>
                <div style={{ flex: 1 }}/>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>3 ожидают</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
};

const ShareBtn = ({ icon, label }) => (
  <button style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 14px',
    background: 'var(--bg-3)', border: '1px solid var(--line-2)',
    borderRadius: 'var(--r-md)', color: 'var(--text-0)',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
  }}>
    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--bg-4)', display: 'grid', placeItems: 'center' }}>
      <Icon name={icon} size={13}/>
    </div>
    <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
  </button>
);

const InviteOpt = ({ label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{label}</span>
    <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line-2)', background: 'var(--bg-2)', color: 'var(--text-0)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>
      {value} <Icon name="chevronD" size={11}/>
    </button>
  </div>
);

// Декоративный «QR» — детерминированный шахматный паттерн
const FakeQR = () => {
  const cells = [];
  const seed = (x, y) => ((x * 73856093) ^ (y * 19349663) ^ 7919) & 0xff;
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    const on = seed(x, y) > 120;
    cells.push(<rect key={`${x}-${y}`} x={x*3.5} y={y*3.5} width={3.5} height={3.5} fill={on ? '#000' : '#fff'}/>);
  }
  return (
    <svg viewBox="0 0 73.5 73.5" width="72" height="72">
      {cells}
      {/* угловые маркеры */}
      {[[0,0],[14*3.5,0],[0,14*3.5]].map(([x,y],i)=>(
        <g key={i}>
          <rect x={x} y={y} width="24.5" height="24.5" fill="#000"/>
          <rect x={x+3.5} y={y+3.5} width="17.5" height="17.5" fill="#fff"/>
          <rect x={x+7} y={y+7} width="10.5" height="10.5" fill="#000"/>
        </g>
      ))}
    </svg>
  );
};

window.InviteModal = InviteModal;
