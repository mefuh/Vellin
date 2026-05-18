// Vellin — Регистрация / Вход / Гость
const Auth = () => {
  const [mode, setMode] = React.useState('login'); // login | signup | guest
  return (
    <AppFrame width={1280} height={820} dark title="vellin.app/auth">
      <div style={{
        position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr',
        background: 'var(--bg-0)',
      }}>
        {/* Левая часть — атмосферное изображение */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRight: '1px solid var(--line-1)' }}>
          <MountainPoster seed={3} label="VELLIN · DUSK ROOM"/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,8,7,0.4) 0%, rgba(10,8,7,0.85) 100%)' }}/>
          <div style={{ position: 'absolute', inset: 0, padding: 48, display: 'flex', flexDirection: 'column' }}>
            <VellinLogo size={22}/>
            <div style={{ flex: 1 }}/>
            <div style={{ maxWidth: 420 }}>
              <Chip tone="live" style={{ marginBottom: 20 }}>В ЭФИРЕ · 14 КОМНАТ</Chip>
              <h2 style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1, margin: 0, color: '#fff' }}>
                Кинозал на двоих.<br/>Или на пятьдесят.
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.7)', marginTop: 16 }}>
                Vellin запоминает, на чём вы остановились, и кто сейчас смотрит вместе с вами.
              </p>
              <div style={{ display: 'flex', gap: 16, marginTop: 28, flexWrap: 'wrap' }}>
                {[
                  { n: 'Закат в Альпах', c: '4 смотрят' },
                  { n: 'Документалка', c: '2 смотрят' },
                  { n: 'Космос вместе', c: '11 смотрят' },
                ].map(r => (
                  <div key={r.n} style={{
                    padding: '10px 14px', background: 'var(--glass-bg)',
                    backdropFilter: 'blur(20px)', border: '1px solid var(--glass-bd)', borderRadius: 10, color: '#fff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500 }}>
                      <Icon name="hash" size={11}/>{r.n}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{r.c}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Правая часть — форма */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, position: 'relative' }}>
          <div style={{ width: '100%', maxWidth: 420 }}>
            {/* Переключатель */}
            <div style={{
              display: 'flex', padding: 4, background: 'var(--bg-2)', borderRadius: 'var(--r-md)',
              border: '1px solid var(--line-1)', marginBottom: 32,
            }}>
              {[['login', 'Войти'], ['signup', 'Регистрация'], ['guest', 'Гость']].map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} style={{
                  flex: 1, height: 34, border: 'none', cursor: 'pointer',
                  background: mode === k ? 'var(--bg-4)' : 'transparent',
                  color: mode === k ? 'var(--text-0)' : 'var(--text-2)',
                  borderRadius: 'var(--r-sm)', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 500, transition: 'all .15s',
                  boxShadow: mode === k ? 'inset 0 0 0 1px var(--line-2)' : 'none',
                }}>{l}</button>
              ))}
            </div>

            <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
              {mode === 'login' && 'С возвращением'}
              {mode === 'signup' && 'Создайте аккаунт'}
              {mode === 'guest' && 'Зайдите как гость'}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 8, marginBottom: 32 }}>
              {mode === 'login' && 'Войдите, чтобы продолжить смотреть с друзьями.'}
              {mode === 'signup' && 'Сохраните комнаты, библиотеку и историю.'}
              {mode === 'guest' && 'Только имя и аватар — этого достаточно для одного сеанса.'}
            </p>

            {/* Поля */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mode === 'signup' && (
                <Field label="Имя" placeholder="Как вас увидят друзья" value="Артём Северов"/>
              )}
              {(mode === 'login' || mode === 'signup') && (
                <>
                  <Field label="Email" placeholder="you@vellin.app" icon="link" value={mode === 'login' ? 'artem@vellin.app' : ''}/>
                  <Field label="Пароль" placeholder="••••••••" icon="lock" type="password" value="••••••••" trail={mode === 'login' ? 'Забыли?' : ''}/>
                </>
              )}
              {mode === 'guest' && (
                <>
                  <Field label="Как вас зовут" placeholder="Любое имя" value="Гость 4729"/>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>Аватар</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['Гость 4729', 'Аня', 'Миша', 'Ева', 'Лев'].map((n, i) => (
                        <div key={n} style={{
                          padding: 3, borderRadius: '50%',
                          boxShadow: i === 0 ? 'inset 0 0 0 2px var(--accent)' : 'none',
                        }}>
                          <Avatar name={n} size={42}/>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <Button variant="primary" size="lg" full style={{ marginTop: 24 }} iconRight="arrow">
              {mode === 'login' && 'Войти'}
              {mode === 'signup' && 'Создать аккаунт'}
              {mode === 'guest' && 'Продолжить как гость'}
            </Button>

            {mode !== 'guest' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0', color: 'var(--text-3)', fontSize: 12 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--line-1)' }}/>
                  или
                  <div style={{ flex: 1, height: 1, background: 'var(--line-1)' }}/>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Button variant="secondary">Google</Button>
                  <Button variant="secondary">Apple</Button>
                </div>
              </>
            )}

            <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.6 }}>
              Продолжая, вы соглашаетесь с <span style={{ color: 'var(--text-1)', textDecoration: 'underline', textDecorationColor: 'var(--line-2)' }}>условиями</span> и <span style={{ color: 'var(--text-1)', textDecoration: 'underline', textDecorationColor: 'var(--line-2)' }}>политикой конфиденциальности</span>.
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
};

const Field = ({ label, placeholder, icon, type, value, trail }) => (
  <label style={{ display: 'block' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
      {trail && <span style={{ fontSize: 12, color: 'var(--accent-hi)', cursor: 'pointer' }}>{trail}</span>}
    </div>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      height: 44, padding: '0 14px',
      background: 'var(--bg-2)', border: '1px solid var(--line-2)',
      borderRadius: 'var(--r-md)', color: 'var(--text-0)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
    }}>
      {icon && <Icon name={icon} size={15}/>}
      <input readOnly type={type || 'text'} placeholder={placeholder} defaultValue={value} style={{
        flex: 1, background: 'transparent', border: 'none', outline: 'none',
        color: 'inherit', fontFamily: 'inherit', fontSize: 14, letterSpacing: '-0.005em',
      }}/>
    </div>
  </label>
);

window.Auth = Auth;
