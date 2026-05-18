// Vellin — Лендинг
const Landing = () => {
  return (
    <AppFrame width={1280} height={820} dark title="vellin.app">
      <div style={{
        position: 'absolute', inset: 0, overflow: 'auto',
        background: 'radial-gradient(1200px 600px at 80% -10%, rgba(209,39,27,0.18), transparent 60%), radial-gradient(800px 600px at -10% 30%, rgba(209,39,27,0.08), transparent 60%), var(--bg-0)',
      }}>
        {/* Шапка */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 10, height: 64,
          display: 'flex', alignItems: 'center', padding: '0 40px', gap: 32,
          background: 'rgba(10,8,7,0.6)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--line-1)',
        }}>
          <VellinLogo size={22}/>
          <nav style={{ display: 'flex', gap: 28, fontSize: 14, color: 'var(--text-1)' }}>
            <span style={{ cursor: 'pointer', color: 'var(--text-0)' }}>Возможности</span>
            <span style={{ cursor: 'pointer' }}>Как это работает</span>
            <span style={{ cursor: 'pointer' }}>Тарифы</span>
            <span style={{ cursor: 'pointer' }}>Сообщество</span>
          </nav>
          <div style={{ flex: 1 }}/>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="ghost" size="sm">Войти</Button>
            <Button variant="primary" size="sm" iconRight="arrow">Создать комнату</Button>
          </div>
        </header>

        {/* Hero */}
        <section style={{ padding: '72px 40px 0', display: 'grid', gridTemplateColumns: '1.05fr 1.25fr', gap: 56, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 999, fontSize: 12, color: 'var(--text-1)', marginBottom: 28 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }}/>
              Уже 12 408 человек смотрят прямо сейчас
            </div>
            <h1 style={{
              fontSize: 68, fontWeight: 600, lineHeight: 1.02, letterSpacing: '-0.035em',
              margin: 0, color: 'var(--text-0)',
            }}>
              Смотрите вместе,<br/>
              <span style={{ color: 'var(--text-2)' }}>будто вы в одной</span><br/>
              <span style={{ color: 'var(--accent)' }}>комнате.</span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.55, color: 'var(--text-1)', maxWidth: 480, marginTop: 24, textWrap: 'pretty' }}>
              Vellin синхронизирует видео, чат и реакции участников в реальном времени. Загружайте свои файлы, открывайте по ссылке или подключайтесь как гость — без лишних шагов.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 36 }}>
              <Button variant="primary" size="lg" iconRight="arrow">Создать комнату</Button>
              <Button variant="secondary" size="lg" icon="play">Посмотреть демо</Button>
            </div>
            <div style={{ display: 'flex', gap: 28, marginTop: 36, color: 'var(--text-2)', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="check" size={14}/> Без регистрации
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="check" size={14}/> До 50 участников
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="check" size={14}/> Сквозная синхронизация
              </div>
            </div>
          </div>

          {/* Иллюстрация интерфейса справа */}
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: -20, borderRadius: 24,
              background: 'radial-gradient(closest-side, rgba(209,39,27,0.28), transparent 80%)',
              filter: 'blur(40px)',
            }}/>
            <div style={{
              position: 'relative',
              borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px var(--line-2)',
              background: 'var(--bg-1)',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 220px', height: 420 }}>
                {/* Sidebar mini */}
                <div style={{ background: 'var(--bg-1)', padding: 14, borderRight: '1px solid var(--line-1)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <VellinLogo size={16}/>
                  <div style={{ height: 16 }}/>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Комнаты</div>
                  {['Закат в Альпах', 'Документалка', 'Пятничный кинозал', 'Космос вместе'].map((r, i) => (
                    <div key={r} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
                      background: i === 0 ? 'var(--accent-soft)' : 'transparent',
                      color: i === 0 ? 'var(--accent-hi)' : 'var(--text-1)', fontSize: 12,
                    }}>
                      <Icon name="hash" size={11}/>
                      {r}
                    </div>
                  ))}
                </div>
                {/* Player */}
                <div style={{ position: 'relative', background: '#000' }}>
                  <MountainPoster seed={0} label="DUSK / 4K" time="01:24:33"/>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 40%, transparent 70%, rgba(0,0,0,0.85) 100%)' }}/>
                  <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 6 }}>
                    <Chip tone="live">LIVE · СИНХРОН</Chip>
                  </div>
                  <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: -6 }}>
                    {['АН', 'МК', 'ДВ', 'ЕС'].map((n, i) => (
                      <div key={n} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                        <Avatar name={n} size={24} ring="accent"/>
                      </div>
                    ))}
                  </div>
                  <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.18)', overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ height: '100%', width: '38%', background: 'var(--accent)' }}/>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
                      <Icon name="play" size={16}/>
                      <Icon name="next" size={14}/>
                      <Icon name="volume" size={14}/>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', opacity: 0.85, marginLeft: 4 }}>01:24:33 / 03:42:00</span>
                      <div style={{ flex: 1 }}/>
                      <Icon name="cast" size={14}/>
                      <Icon name="fullscreen" size={14}/>
                    </div>
                  </div>
                </div>
                {/* Chat */}
                <div style={{ background: 'var(--bg-1)', borderLeft: '1px solid var(--line-1)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Чат</span>
                    <Chip tone="neutral" style={{ fontSize: 10, padding: '2px 6px' }}>· 14</Chip>
                  </div>
                  <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
                    {[
                      { n: 'Аня', m: 'это просто космос 🌌', c: '#d18a5a' },
                      { n: 'Миша', m: 'тут переслушать надо', c: '#3a6b8a' },
                      { n: 'Даня', m: 'звук на этой сцене — отдельный фильм', c: '#9c5c8a' },
                    ].map(m => (
                      <div key={m.n} style={{ display: 'flex', gap: 8 }}>
                        <Avatar name={m.n} size={22}/>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 10, color: 'var(--text-1)' }}>{m.n}</div>
                          <div style={{ color: 'var(--text-0)', lineHeight: 1.4 }}>{m.m}</div>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--bg-3)', borderRadius: 6, color: 'var(--text-2)', fontSize: 10, marginTop: 'auto' }}>
                      <Icon name="users" size={10}/> Ева вошла в комнату
                    </div>
                  </div>
                  <div style={{ padding: 10, borderTop: '1px solid var(--line-1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--bg-3)', borderRadius: 8, fontSize: 11, color: 'var(--text-2)' }}>
                      Сообщение… <div style={{ flex: 1 }}/> <Icon name="smile" size={12}/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Логи-стрипа */}
        <section style={{ padding: '64px 40px 0' }}>
          <div style={{ display: 'flex', gap: 48, alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-lg)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Работает в:</span>
            {['Chrome', 'Safari', 'Firefox', 'Arc', 'Edge', 'Brave'].map(b => (
              <span key={b} style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 500 }}>{b}</span>
            ))}
          </div>
        </section>

        {/* Возможности */}
        <section style={{ padding: '100px 40px 0' }}>
          <div style={{ maxWidth: 640, marginBottom: 56 }}>
            <div style={{ fontSize: 13, color: 'var(--accent-hi)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500, marginBottom: 12 }}>Возможности</div>
            <h2 style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1, margin: 0 }}>
              Всё, что нужно для уютного цифрового кинозала
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { i: 'film', t: 'Синхронный плеер', d: 'Кадр-в-кадр на всех устройствах. Пауза одного — пауза для всех.', big: true },
              { i: 'upload', t: 'Загрузка и URL', d: 'Видео из библиотеки или прямой ссылки. До 4K и HDR.' },
              { i: 'chat', t: 'Живой чат', d: 'Реакции, цитирование кадра и эмоджи прямо поверх видео.' },
              { i: 'users', t: 'Гостевой режим', d: 'Один клик по ссылке — и человек уже в комнате.' },
              { i: 'mic', t: 'Голос (скоро)', d: 'Звонки и голосовые комнаты без переключения вкладок.', soon: true },
              { i: 'lock', t: 'Приватность', d: 'Приватные комнаты, пароли и контроль кто управляет плеером.' },
            ].map((c, i) => (
              <div key={c.t} style={{
                gridColumn: c.big ? 'span 1' : 'span 1',
                padding: 24, borderRadius: 'var(--r-lg)',
                background: 'var(--bg-1)',
                border: '1px solid var(--line-1)',
                minHeight: 180, display: 'flex', flexDirection: 'column',
                position: 'relative', overflow: 'hidden',
              }}>
                {c.big && (
                  <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(closest-side at 100% 100%, rgba(209,39,27,0.18), transparent 60%)' }}/>
                )}
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: c.big ? 'var(--accent)' : 'var(--bg-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: c.big ? '#fff' : 'var(--text-0)',
                  boxShadow: c.big ? '0 4px 16px var(--accent-glow)' : 'inset 0 0 0 1px var(--line-2)',
                  position: 'relative', zIndex: 1,
                }}>
                  <Icon name={c.i} size={18}/>
                </div>
                <div style={{ flex: 1 }}/>
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>{c.t}</span>
                    {c.soon && <Chip tone="accent" style={{ fontSize: 9 }}>SOON</Chip>}
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-1)', textWrap: 'pretty' }}>{c.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Как это работает */}
        <section style={{ padding: '120px 40px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.3fr', gap: 60, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--accent-hi)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500, marginBottom: 12 }}>Как это работает</div>
              <h2 style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1, margin: 0 }}>Три шага<br/>до общего сеанса</h2>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-1)', marginTop: 20 }}>
                Без регистрации, расширений и приложений. Откройте сайт, создайте комнату — и отправьте ссылку друзьям.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { n: '01', t: 'Создайте комнату', d: 'Назовите её, выберите приватность и лимит участников.' },
                { n: '02', t: 'Добавьте видео', d: 'Загрузите файл с компьютера или вставьте ссылку.' },
                { n: '03', t: 'Поделитесь и смотрите', d: 'Скопируйте ссылку — участники присоединятся одним кликом.' },
              ].map(s => (
                <div key={s.n} style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 24, alignItems: 'center',
                  padding: '20px 24px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-lg)',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: 'var(--accent)', fontWeight: 500 }}>{s.n}</span>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em' }}>{s.t}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-1)', marginTop: 4 }}>{s.d}</div>
                  </div>
                  <Icon name="arrow" size={18}/>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Гостевой режим */}
        <section style={{ padding: '120px 40px 0' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 40, alignItems: 'center',
            padding: 48, borderRadius: 'var(--r-2xl)',
            background: 'linear-gradient(135deg, var(--bg-1), var(--bg-2))',
            border: '1px solid var(--line-1)', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', right: -100, top: -100, width: 400, height: 400, background: 'radial-gradient(closest-side, rgba(209,39,27,0.25), transparent 70%)', filter: 'blur(20px)' }}/>
            <div style={{ position: 'relative' }}>
              <Chip tone="accent" icon="sparkles">Гостевой режим</Chip>
              <h2 style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1, margin: '16px 0 16px' }}>
                Друзьям даже регистрироваться не нужно
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-1)', marginBottom: 24, maxWidth: 460 }}>
                Один клик по ссылке — гость сразу в комнате. Имя и аватар можно изменить позже. Хост видит, кто зашёл, и в любой момент может выдать права.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="primary" iconRight="arrow">Создать гостевую ссылку</Button>
                <Button variant="ghost">Подробнее</Button>
              </div>
            </div>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: 16, background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-1)' }}>
                <div style={{ color: 'var(--text-3)', marginBottom: 4 }}>ссылка-приглашение</div>
                vellin.app/r/<span style={{ color: 'var(--accent-hi)' }}>dusk-alps-7f3</span>
              </div>
              {[
                { n: 'Ева', t: 'присоединилась как гость', dt: 'сейчас' },
                { n: 'Кирилл', t: 'присоединился как гость', dt: '12с назад' },
                { n: 'Алина', t: 'присоединилась как гость', dt: '38с назад' },
              ].map(g => (
                <div key={g.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)' }}>
                  <Avatar name={g.n} size={32} status="online"/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{g.n} <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>{g.t}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{g.dt}</div>
                  </div>
                  <Button variant="ghost" size="sm">Принять</Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Цифры */}
        <section style={{ padding: '120px 40px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, textAlign: 'left' }}>
            {[
              { n: '4.2M', l: 'минут совместного просмотра в неделю' },
              { n: '38 000', l: 'активных комнат каждый день' },
              { n: '< 80мс', l: 'задержка синхронизации между участниками' },
              { n: '99.96%', l: 'аптайм сервиса за последний год' },
            ].map(s => (
              <div key={s.l}>
                <div style={{ fontSize: 48, fontWeight: 500, letterSpacing: '-0.03em', color: 'var(--text-0)' }}>{s.n}</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, maxWidth: 200, lineHeight: 1.4 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '120px 40px 80px' }}>
          <div style={{
            padding: '64px 40px', textAlign: 'center', borderRadius: 'var(--r-2xl)',
            background: 'radial-gradient(closest-side at 50% 0%, rgba(209,39,27,0.35), transparent 70%), var(--bg-1)',
            border: '1px solid var(--line-2)',
          }}>
            <h2 style={{ fontSize: 52, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0, maxWidth: 720, marginInline: 'auto' }}>
              Зовите своих.<br/>Свет уже выключен.
            </h2>
            <p style={{ fontSize: 16, color: 'var(--text-1)', marginTop: 20, maxWidth: 480, marginInline: 'auto' }}>
              Создайте первую комнату за 10 секунд — без карты, без email, без приложения.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 32 }}>
              <Button variant="primary" size="lg" iconRight="arrow">Создать комнату</Button>
              <Button variant="glass" size="lg">Войти</Button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ padding: '40px 40px 32px', borderTop: '1px solid var(--line-1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <VellinLogo size={18}/>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>© 2026 Vellin. Сделано для уютных вечеров.</span>
            <div style={{ flex: 1 }}/>
            <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--text-2)' }}>
              <span>Конфиденциальность</span>
              <span>Условия</span>
              <span>Поддержка</span>
              <span>Статус</span>
            </div>
          </div>
        </footer>
      </div>
    </AppFrame>
  );
};

window.Landing = Landing;
