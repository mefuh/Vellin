// Vellin — Главный интерфейс комнаты (desktop)
const Room = () => {
  const [playing, setPlaying] = React.useState(true);
  const [progress, setProgress] = React.useState(38);
  const [chatCollapsed, setChatCollapsed] = React.useState(false);
  return (
    <AppFrame width={1440} height={900} dark title="vellin.app/r/dusk-alps-7f3">
      <div style={{
        position: 'absolute', inset: 0,
        display: 'grid', gridTemplateColumns: `260px 1fr ${chatCollapsed ? '56px' : '340px'}`,
        background: 'var(--bg-0)',
      }}>
        {/* ── ЛЕВАЯ ПАНЕЛЬ ── */}
        <RoomSidebar/>

        {/* ── ЦЕНТР: плеер + информация ── */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-0)' }}>
          {/* Топ-бар комнаты */}
          <div style={{
            height: 56, display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px',
            borderBottom: '1px solid var(--line-1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="hash" size={16}/>
              <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em' }}>Закат в Альпах</span>
              <Chip tone="live">В ЭФИРЕ</Chip>
              <Chip tone="neutral" icon="lock">Приватная</Chip>
            </div>
            <div style={{ flex: 1 }}/>
            <ParticipantStack participants={[
              { n: 'Артём', status: 'watching' },
              { n: 'Аня', status: 'online' },
              { n: 'Миша', status: 'online' },
              { n: 'Даня', status: 'online' },
              { n: 'Ева', status: 'idle' },
            ]}/>
            <Button variant="secondary" size="sm" icon="users">Пригласить</Button>
            <Button variant="ghost" size="sm" icon="settings"/>
          </div>

          {/* Плеер */}
          <div style={{ padding: 24, paddingBottom: 16, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{
              position: 'relative', borderRadius: 'var(--r-lg)', overflow: 'hidden',
              background: '#000', flex: 1, minHeight: 0,
              boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
            }}>
              <MountainPoster seed={0} label="DUSK · ALPS · 4K" time="01:24:33"/>
              {/* Верхний градиент */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(180deg, rgba(0,0,0,0.6), transparent)', pointerEvents: 'none' }}/>
              {/* Нижний градиент */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 140, background: 'linear-gradient(0deg, rgba(0,0,0,0.85), transparent)', pointerEvents: 'none' }}/>

              {/* Топ: статус синхронизации */}
              <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Chip tone="live">СИНХРОН · 5 УЧАСТНИКОВ</Chip>
                  <Chip tone="neutral" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}>4K · HDR · Dolby</Chip>
                </div>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
                  padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', color: '#fff',
                }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Управляет плеером</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name="Артём Северов" size={20} ring="accent"/>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>Артём (вы)</span>
                  </div>
                </div>
              </div>

              {/* Центральная кнопка play (видна при паузе — оставим маленькой подсветкой) */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                opacity: playing ? 0 : 1, transition: 'opacity .2s',
                pointerEvents: playing ? 'none' : 'auto',
              }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <Icon name="play" size={32}/>
                </div>
              </div>

              {/* Контролы плеера */}
              <div style={{ position: 'absolute', left: 24, right: 24, bottom: 20, color: '#fff' }}>
                {/* Прогресс */}
                <div style={{ position: 'relative', height: 24, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', overflow: 'hidden', position: 'relative' }}>
                    {/* Буфер */}
                    <div style={{ position: 'absolute', inset: 0, width: '62%', background: 'rgba(255,255,255,0.18)' }}/>
                    {/* Прогресс */}
                    <div style={{ position: 'absolute', inset: 0, width: `${progress}%`, background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }}/>
                    {/* Метки участников */}
                    {[34, 36, 38, 39, 41].map((p, i) => (
                      <div key={i} style={{ position: 'absolute', top: -3, left: `${p}%`, width: 2, height: 10, background: 'rgba(255,255,255,0.7)' }}/>
                    ))}
                  </div>
                  <div style={{ position: 'absolute', left: `${progress}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}/>
                </div>

                {/* Кнопки */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
                  <PlayerBtn icon="prev"/>
                  <PlayerBtn icon={playing ? 'pause' : 'play'} primary onClick={() => setPlaying(!playing)}/>
                  <PlayerBtn icon="next"/>
                  <PlayerBtn icon="refresh" tooltip="Пересинхронизировать"/>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4 }}>
                    <Icon name="volume" size={16}/>
                    <div style={{ width: 80, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }}>
                      <div style={{ width: '72%', height: '100%', background: '#fff', borderRadius: 2 }}/>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.85)', marginLeft: 8 }}>
                    01:24:33 <span style={{ opacity: 0.5 }}>/ 03:42:00</span>
                  </span>
                  <div style={{ flex: 1 }}/>
                  <Chip tone="neutral" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', color: '#fff' }}>RU · СУБ</Chip>
                  <PlayerBtn icon="cast"/>
                  <PlayerBtn icon="settings"/>
                  <PlayerBtn icon="fullscreen"/>
                </div>
              </div>
            </div>

            {/* Под плеером: инфо о комнате */}
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 12 }}>
              <InfoCard
                title="Текущее видео"
                badge="Загружено"
                content={
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Закат в Альпах — таймлапс 4K</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      library://artem/dusk-alps-4k-2024.mp4 · 3,8 ГБ
                    </div>
                  </>
                }
                action={<><Icon name="copy" size={14}/></>}
              />
              <InfoCard
                title="Управляет"
                content={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name="Артём Северов" size={28} ring="accent"/>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>Артём (вы)</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>хост · может ставить на паузу</div>
                    </div>
                  </div>
                }
              />
              <InfoCard
                title="Активность"
                content={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <Stat n="5" l="смотрят"/>
                    <Stat n="2:14" l="средн. отставание"/>
                    <Stat n="HD+" l="качество"/>
                  </div>
                }
              />
            </div>
          </div>
        </div>

        {/* ── ПРАВАЯ ПАНЕЛЬ: ЧАТ + УЧАСТНИКИ ── */}
        <RoomChat collapsed={chatCollapsed} onToggle={() => setChatCollapsed(!chatCollapsed)}/>
      </div>
    </AppFrame>
  );
};

// ── Левая панель ────────────────────────────────────────────
const RoomSidebar = () => {
  const rooms = [
    { n: 'Закат в Альпах', cnt: 5, active: true, live: true },
    { n: 'Документалка', cnt: 2 },
    { n: 'Пятничный кинозал', cnt: 0 },
    { n: 'Космос вместе', cnt: 11, live: true },
    { n: 'Анимация', cnt: 0 },
  ];
  return (
    <div style={{
      background: 'var(--bg-1)', borderRight: '1px solid var(--line-1)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--line-1)' }}>
        <VellinLogo size={20}/>
        <div style={{ flex: 1 }}/>
        <button style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-3)', border: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-1)', cursor: 'pointer' }}>
          <Icon name="search" size={14}/>
        </button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflow: 'auto' }}>
        <NavItem icon="home" label="Главная"/>
        <NavItem icon="compass" label="Обзор"/>
        <NavItem icon="library" label="Библиотека" badge="124"/>
        <NavItem icon="bell" label="Уведомления" badge="3"/>

        <div style={{ height: 12 }}/>
        <SectionHeader title="Комнаты" action={<Icon name="plus" size={13}/>}/>
        {rooms.map(r => (
          <RoomItem key={r.n} {...r}/>
        ))}

        <div style={{ height: 12 }}/>
        <SectionHeader title="Прямые сообщения" action={<Icon name="plus" size={13}/>}/>
        {[
          { n: 'Аня Северова', status: 'online' },
          { n: 'Миша Кулагин', status: 'watching' },
          { n: 'Даня Васильев', status: 'idle' },
        ].map(d => (
          <div key={d.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: 'var(--text-1)', fontSize: 13 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Avatar name={d.n} size={22} status={d.status}/>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.n}</span>
          </div>
        ))}
      </div>

      {/* Карточка пользователя */}
      <div style={{
        padding: 10, borderTop: '1px solid var(--line-1)',
        background: 'var(--bg-2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 6, borderRadius: 8 }}>
          <Avatar name="Артём Северов" size={32} status="online"/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Артём Северов</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>в комнате «Альпы»</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ width: 26, height: 26, border: 'none', background: 'var(--bg-3)', color: 'var(--text-1)', borderRadius: 6, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="mic" size={12}/></button>
            <button style={{ width: 26, height: 26, border: 'none', background: 'var(--bg-3)', color: 'var(--text-1)', borderRadius: 6, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="settings" size={12}/></button>
          </div>
        </div>
      </div>
    </div>
  );
};

const NavItem = ({ icon, label, badge, active }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
    borderRadius: 8, cursor: 'pointer',
    background: active ? 'var(--bg-3)' : 'transparent',
    color: active ? 'var(--text-0)' : 'var(--text-1)', fontSize: 13.5,
  }}>
    <Icon name={icon} size={15}/>
    <span style={{ flex: 1 }}>{label}</span>
    {badge && (
      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--bg-4)', color: 'var(--text-2)' }}>{badge}</span>
    )}
  </div>
);

const SectionHeader = ({ title, action }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px 4px', fontSize: 10, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600,
  }}>
    <span>{title}</span>
    {action && (
      <button style={{ width: 18, height: 18, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: 4 }}>{action}</button>
    )}
  </div>
);

const RoomItem = ({ n, cnt, active, live }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
    borderRadius: 8, cursor: 'pointer',
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent-hi)' : 'var(--text-1)', fontSize: 13,
    position: 'relative',
  }}>
    {active && <div style={{ position: 'absolute', left: -12, top: 6, bottom: 6, width: 3, borderRadius: 2, background: 'var(--accent)' }}/>}
    <Icon name="hash" size={13}/>
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: active ? 600 : 400 }}>{n}</span>
    {live && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent-glow)' }}/>}
    {cnt > 0 && <span style={{ fontSize: 11, color: active ? 'var(--accent-hi)' : 'var(--text-2)' }}>{cnt}</span>}
  </div>
);

const PlayerBtn = ({ icon, primary, tooltip, onClick }) => (
  <button onClick={onClick} title={tooltip} style={{
    width: primary ? 44 : 32, height: primary ? 44 : 32,
    border: 'none', borderRadius: primary ? 22 : 8,
    background: primary ? 'rgba(255,255,255,0.95)' : 'transparent',
    color: primary ? '#000' : '#fff',
    display: 'grid', placeItems: 'center', cursor: 'pointer',
  }}>
    <Icon name={icon} size={primary ? 18 : 16}/>
  </button>
);

const ParticipantStack = ({ participants }) => (
  <div style={{ display: 'flex' }}>
    {participants.slice(0, 4).map((p, i) => (
      <div key={i} style={{ marginLeft: i === 0 ? 0 : -10 }}>
        <Avatar name={p.n} size={28} status={p.status} ring={i === 0 ? 'accent' : undefined}/>
      </div>
    ))}
    {participants.length > 4 && (
      <div style={{ marginLeft: -10, width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-3)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-1)', boxShadow: '0 0 0 2px var(--bg-0)' }}>+{participants.length - 4}</div>
    )}
  </div>
);

const InfoCard = ({ title, badge, content, action }) => (
  <div style={{
    padding: 14, background: 'var(--bg-1)', borderRadius: 'var(--r-md)',
    border: '1px solid var(--line-1)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>{title}</span>
      {badge && <Chip tone="accent" style={{ fontSize: 9 }}>{badge}</Chip>}
      {action && <div style={{ marginLeft: 'auto', color: 'var(--text-2)', cursor: 'pointer' }}>{action}</div>}
    </div>
    {content}
  </div>
);

const Stat = ({ n, l }) => (
  <div>
    <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em' }}>{n}</div>
    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{l}</div>
  </div>
);

// ── Чат справа ──────────────────────────────────────────────
const RoomChat = ({ collapsed, onToggle }) => {
  if (collapsed) {
    return (
      <div style={{
        background: 'var(--bg-1)', borderLeft: '1px solid var(--line-1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 12,
      }}>
        <button onClick={onToggle} style={{ width: 32, height: 32, border: 'none', background: 'var(--bg-3)', color: 'var(--text-1)', borderRadius: 8, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          <Icon name="chat" size={14}/>
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[{ n: 'Артём', s: 'watching' }, { n: 'Аня', s: 'online' }, { n: 'Миша', s: 'online' }, { n: 'Даня', s: 'online' }, { n: 'Ева', s: 'idle' }].map(p => (
            <Avatar key={p.n} name={p.n} size={32} status={p.s}/>
          ))}
        </div>
      </div>
    );
  }
  const messages = [
    { type: 'sys', t: 'Артём начал просмотр' },
    { type: 'msg', n: 'Аня', m: 'успела с попкорном, го', t: '20:32', mine: false, c: 'd18a' },
    { type: 'msg', n: 'Миша', m: 'звук на этой сцене — отдельный фильм', t: '20:34', reactions: [{ e: '🔥', c: 3 }, { e: '🎬', c: 1 }] },
    { type: 'msg', n: 'Даня', m: 'тут переснять надо, погнали обратно', t: '20:35', reply: { n: 'Миша', m: 'звук на этой сцене…' } },
    { type: 'sys', t: 'Ева присоединилась как гость' },
    { type: 'msg', n: 'Артём', m: 'согласен, через минуту откатим', t: '20:36', mine: true },
    { type: 'msg', n: 'Аня', m: 'это просто космос 🌌', t: '20:38', reactions: [{ e: '❤️', c: 2 }] },
    { type: 'msg', n: 'Ева', m: 'оо привет всем!', t: '20:39', guest: true },
  ];
  return (
    <div style={{ background: 'var(--bg-1)', borderLeft: '1px solid var(--line-1)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Заголовок */}
      <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid var(--line-1)' }}>
        <button style={{ flex: 1, height: 56, border: 'none', background: 'transparent', color: 'var(--text-0)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderBottom: '2px solid var(--accent)', cursor: 'pointer' }}>
          <Icon name="chat" size={14}/> Чат <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· 24</span>
        </button>
        <button style={{ flex: 1, height: 56, border: 'none', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
          <Icon name="users" size={14}/> Участники <span>5</span>
        </button>
        <button onClick={onToggle} style={{ width: 40, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          <Icon name="chevron" size={14}/>
        </button>
      </div>

      {/* Участники компактно */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-1)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>В комнате — 5</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { n: 'Артём Северов', r: 'хост', s: 'watching', me: true },
            { n: 'Аня', r: 'модератор', s: 'online' },
            { n: 'Миша Кулагин', r: '', s: 'online' },
            { n: 'Даня Васильев', r: '', s: 'online' },
            { n: 'Ева', r: 'гость', s: 'idle', guest: true },
          ].map(p => (
            <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <Avatar name={p.n} size={26} status={p.s}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-0)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.n} {p.r === 'хост' && <Icon name="crown" size={10} stroke={2}/>}
                </div>
                {p.r && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.r}</div>}
              </div>
              {p.s === 'watching' && <Chip tone="live" style={{ fontSize: 9, padding: '1px 6px' }}>СМОТРИТ</Chip>}
            </div>
          ))}
        </div>
      </div>

      {/* Сообщения */}
      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.map((m, i) => m.type === 'sys' ? (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11, color: 'var(--text-3)' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line-1)' }}/>
            <span>{m.t}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line-1)' }}/>
          </div>
        ) : (
          <Message key={i} {...m}/>
        ))}
      </div>

      {/* Композер */}
      <div style={{ padding: 12, borderTop: '1px solid var(--line-1)', flexShrink: 0 }}>
        {/* подсказка реакций / типинг */}
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, height: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)' }}/>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)' }}/>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)' }}/>
          </div>
          Аня печатает…
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px',
          background: 'var(--bg-2)', border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-md)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
        }}>
          <Icon name="plus" size={15}/>
          <input readOnly placeholder="Сообщение в #альпы" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-0)', fontFamily: 'inherit', fontSize: 13 }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
            <Icon name="smile" size={15}/>
            <Icon name="image" size={15}/>
          </div>
          <button style={{ width: 28, height: 28, border: 'none', borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="send" size={13}/>
          </button>
        </div>
      </div>
    </div>
  );
};

const Message = ({ n, m, t, mine, reactions, reply, guest }) => (
  <div style={{ display: 'flex', gap: 10 }}>
    <Avatar name={n} size={32}/>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: mine ? 'var(--accent-hi)' : 'var(--text-0)' }}>{n}</span>
        {guest && <Chip tone="neutral" style={{ fontSize: 9, padding: '0 5px' }}>гость</Chip>}
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{t}</span>
      </div>
      {reply && (
        <div style={{ padding: '4px 8px', marginBottom: 4, borderLeft: '2px solid var(--line-3)', background: 'var(--bg-2)', borderRadius: '0 6px 6px 0', fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 600 }}>{reply.n}:</span> {reply.m}
        </div>
      )}
      <div style={{ fontSize: 13.5, color: 'var(--text-0)', lineHeight: 1.5, textWrap: 'pretty' }}>{m}</div>
      {reactions && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {reactions.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 999, fontSize: 11, color: 'var(--text-1)' }}>
              <span style={{ fontSize: 12 }}>{r.e}</span>{r.c}
            </div>
          ))}
          <div style={{ width: 22, height: 22, borderRadius: 999, background: 'var(--bg-3)', border: '1px dashed var(--line-2)', display: 'grid', placeItems: 'center', color: 'var(--text-3)', cursor: 'pointer' }}>
            <Icon name="smile" size={11}/>
          </div>
        </div>
      )}
    </div>
  </div>
);

window.Room = Room;
