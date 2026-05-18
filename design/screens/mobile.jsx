// Vellin — Мобильная версия комнаты
const PhoneFrame = ({ children, label }) => (
  <div style={{
    width: 380, height: 780,
    background: '#000', borderRadius: 44, padding: 9,
    boxShadow: '0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)',
    position: 'relative',
  }}>
    <div style={{
      width: '100%', height: '100%', borderRadius: 36, overflow: 'hidden',
      background: 'var(--bg-0)', position: 'relative',
      fontFamily: 'var(--font-ui)', color: 'var(--text-0)',
    }} className="vellin">
      {/* Status bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 44, zIndex: 50,
        display: 'flex', alignItems: 'center', padding: '14px 28px 0',
        fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: '#fff',
        pointerEvents: 'none',
      }}>
        <span>20:38</span>
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor"><rect x="0" y="6" width="3" height="4" rx="0.5"/><rect x="4" y="4" width="3" height="6" rx="0.5"/><rect x="8" y="2" width="3" height="8" rx="0.5"/><rect x="12" y="0" width="3" height="10" rx="0.5"/></svg>
          <span style={{ fontSize: 11 }}>5G</span>
          <svg width="22" height="11" viewBox="0 0 22 11" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="18" height="10" rx="2"/><rect x="2" y="2" width="14" height="7" rx="1" fill="currentColor"/><rect x="19" y="3" width="2" height="5" rx="0.5" fill="currentColor"/></svg>
        </div>
      </div>
      {/* Notch */}
      <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 110, height: 32, background: '#000', borderRadius: 20, zIndex: 60 }}/>
      {children}
    </div>
  </div>
);

// ── Мобильный главный экран комнаты ─────────────────────────
const MobileRoom = () => {
  return (
    <PhoneFrame>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Видео-плеер */}
        <div style={{ position: 'relative', height: 240, flexShrink: 0, background: '#000', overflow: 'hidden' }}>
          <MountainPoster seed={0}/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.7) 100%)' }}/>
          {/* Топ */}
          <div style={{ position: 'absolute', top: 52, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', border: 'none', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <Icon name="chevron" size={14}/>
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="hash" size={11}/>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Закат в Альпах</span>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>5 участников · в эфире</div>
            </div>
            <button style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', border: 'none', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <Icon name="users" size={14}/>
            </button>
          </div>
          {/* Бэйджи */}
          <div style={{ position: 'absolute', top: 96, left: 16 }}>
            <Chip tone="live">СИНХРОН</Chip>
          </div>
          {/* Контролы */}
          <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.2)', overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ width: '38%', height: '100%', background: 'var(--accent)' }}/>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#fff' }}>
              <Icon name="play" size={20}/>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>01:24:33 / 03:42:00</span>
              <div style={{ flex: 1 }}/>
              <Icon name="volume" size={14}/>
              <Icon name="fullscreen" size={14}/>
            </div>
          </div>
        </div>

        {/* Под плеером — табы */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line-1)', flexShrink: 0 }}>
          <MobileTab active label="Чат" badge="24"/>
          <MobileTab label="Участники" badge="5"/>
          <MobileTab label="Инфо"/>
        </div>

        {/* Чат */}
        <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 10, color: 'var(--text-3)' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line-1)' }}/>
            <span>Артём начал просмотр · 20:30</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line-1)' }}/>
          </div>
          {[
            { n: 'Аня', m: 'успела с попкорном, го', t: '20:32' },
            { n: 'Миша', m: 'звук на этой сцене — отдельный фильм', t: '20:34', rx: [{ e: '🔥', c: 3 }] },
            { n: 'Артём', m: 'согласен, через минуту откатим', t: '20:36', mine: true },
            { n: 'Аня', m: 'это просто космос 🌌', t: '20:38', rx: [{ e: '❤️', c: 2 }] },
          ].map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <Avatar name={m.n} size={28}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: m.mine ? 'var(--accent-hi)' : 'var(--text-0)' }}>{m.n}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{m.t}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-0)', lineHeight: 1.45, marginTop: 1 }}>{m.m}</div>
                {m.rx && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {m.rx.map((r, i) => (
                      <span key={i} style={{ display: 'inline-flex', gap: 4, padding: '1px 6px', background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 999, fontSize: 10, color: 'var(--text-1)' }}>
                        {r.e}{r.c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Композер */}
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--line-1)', flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', background: 'var(--bg-2)',
            border: '1px solid var(--line-2)', borderRadius: 22,
          }}>
            <button style={{ width: 28, height: 28, border: 'none', borderRadius: 14, background: 'var(--bg-3)', color: 'var(--text-1)', display: 'grid', placeItems: 'center' }}>
              <Icon name="plus" size={13}/>
            </button>
            <input readOnly placeholder="Сообщение…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-0)', fontFamily: 'inherit', fontSize: 13 }}/>
            <Icon name="smile" size={15}/>
            <button style={{ width: 28, height: 28, border: 'none', borderRadius: 14, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <Icon name="send" size={12}/>
            </button>
          </div>
          {/* Home indicator */}
          <div style={{ width: 124, height: 4, background: 'rgba(255,255,255,0.4)', borderRadius: 2, margin: '10px auto 0' }}/>
        </div>
      </div>
    </PhoneFrame>
  );
};

const MobileTab = ({ label, badge, active }) => (
  <div style={{
    flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    color: active ? 'var(--text-0)' : 'var(--text-2)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  }}>
    {label}
    {badge && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 999, background: active ? 'var(--accent-soft)' : 'var(--bg-3)', color: active ? 'var(--accent-hi)' : 'var(--text-2)' }}>{badge}</span>}
  </div>
);

// ── Мобильная главная (лента комнат) ───────────────────────
const MobileHome = () => {
  return (
    <PhoneFrame>
      <div style={{ position: 'absolute', inset: 0, paddingTop: 50, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 18px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name="Артём Северов" size={36}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Привет,</div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em' }}>Артём</div>
          </div>
          <button style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--text-0)', display: 'grid', placeItems: 'center' }}>
            <Icon name="bell" size={14}/>
          </button>
        </div>

        <div style={{ padding: '0 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)' }}>
            <Icon name="search" size={14}/>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Найти комнату или видео</span>
          </div>
        </div>

        <div style={{ padding: '20px 18px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Сейчас в эфире</h2>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>14 комнат</span>
        </div>

        <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          {[
            { n: 'Закат в Альпах', s: 0, p: 5, h: 'Артём' },
            { n: 'Космос вместе', s: 5, p: 11, h: 'Лев' },
            { n: 'Документалка', s: 2, p: 2, h: 'Маша' },
            { n: 'Пятничный кинозал', s: 1, p: 8, h: 'Ник' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: 10, background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)' }}>
              <div style={{ width: 88, height: 60, borderRadius: 8, overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                <MountainPoster seed={r.s}/>
                <div style={{ position: 'absolute', top: 4, left: 4 }}>
                  <Chip tone="live" style={{ fontSize: 8, padding: '1px 5px' }}>LIVE</Chip>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.n}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>хост: {r.h}</div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
                  {[0,1,2].map(j => (
                    <div key={j} style={{ marginLeft: j === 0 ? 0 : -6 }}>
                      <Avatar name={'АБВГД'[j+i]} size={18}/>
                    </div>
                  ))}
                  <span style={{ fontSize: 10, color: 'var(--text-2)', marginLeft: 6 }}>{r.p} смотрят</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom nav */}
        <div style={{
          marginTop: 'auto', padding: '8px 8px 14px', borderTop: '1px solid var(--line-1)',
          background: 'var(--bg-1)', display: 'flex', justifyContent: 'space-around',
        }}>
          {[
            { i: 'home', l: 'Главная', a: true },
            { i: 'compass', l: 'Обзор' },
            { i: 'plus', l: '', primary: true },
            { i: 'library', l: 'Библиотека' },
            { i: 'user', l: 'Профиль' },
          ].map((n, i) => n.primary ? (
            <button key={i} style={{ width: 50, height: 50, marginTop: -16, borderRadius: 16, background: 'var(--accent)', border: '4px solid var(--bg-0)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 8px 20px var(--accent-glow)' }}>
              <Icon name={n.i} size={20} stroke={2.2}/>
            </button>
          ) : (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 14px', color: n.a ? 'var(--text-0)' : 'var(--text-3)' }}>
              <Icon name={n.i} size={20}/>
              <span style={{ fontSize: 9, fontWeight: n.a ? 600 : 400 }}>{n.l}</span>
            </div>
          ))}
          {/* Home indicator */}
          <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', width: 124, height: 4, background: 'rgba(255,255,255,0.4)', borderRadius: 2 }}/>
        </div>
      </div>
    </PhoneFrame>
  );
};

// ── Мобильный fullscreen-плеер ─────────────────────────────
const MobilePlayer = () => {
  return (
    <PhoneFrame>
      <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
        <MountainPoster seed={0}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 25%, transparent 60%, rgba(0,0,0,0.9) 100%)' }}/>

        {/* Топ */}
        <div style={{ position: 'absolute', top: 52, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', border: 'none', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <Icon name="chevronD" size={14}/>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Сейчас идёт</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Закат в Альпах · 4K</div>
          </div>
          <button style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', border: 'none', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <Icon name="cast" size={14}/>
          </button>
        </div>

        {/* Реакции, плавающие справа */}
        <div style={{ position: 'absolute', right: 14, bottom: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { e: '❤️', c: 12 },
            { e: '🔥', c: 4 },
            { e: '🤯', c: 2 },
          ].map(r => (
            <div key={r.e} style={{ width: 48, height: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 24, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', color: '#fff' }}>
              <span style={{ fontSize: 22 }}>{r.e}</span>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{r.c}</span>
            </div>
          ))}
        </div>

        {/* Чат-оверлей */}
        <div style={{ position: 'absolute', left: 16, right: 80, bottom: 160, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { n: 'Аня', m: 'это просто космос 🌌' },
            { n: 'Миша', m: 'звук топ' },
          ].map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Avatar name={m.n} size={22}/>
              <div style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', borderRadius: '14px 14px 14px 4px', color: '#fff', fontSize: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 10, opacity: 0.8 }}>{m.n}</span><br/>{m.m}
              </div>
            </div>
          ))}
        </div>

        {/* Контролы */}
        <div style={{ position: 'absolute', bottom: 36, left: 16, right: 16, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Chip tone="live">СИНХРОН · 5</Chip>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {[0,1,2,3].map(j => (
                <div key={j} style={{ marginLeft: j === 0 ? 0 : -6 }}>
                  <Avatar name={'АМДЕ'[j]} size={22}/>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.2)', overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: '38%', height: '100%', background: 'var(--accent)' }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
            <span>01:24:33</span>
            <span style={{ opacity: 0.6 }}>03:42:00</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <button style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="chat" size={16}/></button>
            <button style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="prev" size={16}/></button>
            <button style={{ width: 60, height: 60, borderRadius: 30, background: '#fff', border: 'none', color: '#000', display: 'grid', placeItems: 'center', boxShadow: '0 4px 20px rgba(255,255,255,0.2)' }}><Icon name="pause" size={22}/></button>
            <button style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="next" size={16}/></button>
            <button style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="smile" size={16}/></button>
          </div>
        </div>
        {/* Home indicator */}
        <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', width: 124, height: 4, background: 'rgba(255,255,255,0.6)', borderRadius: 2 }}/>
      </div>
    </PhoneFrame>
  );
};

Object.assign(window, { MobileRoom, MobileHome, MobilePlayer });
