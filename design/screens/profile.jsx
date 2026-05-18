// Vellin — Профиль пользователя
const Profile = () => {
  return (
    <AppFrame width={1280} height={820} dark title="vellin.app/u/artem">
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '240px 1fr', background: 'var(--bg-0)' }}>
        {/* Sidebar (сокращённый, как навигация по разделам профиля) */}
        <div style={{ background: 'var(--bg-1)', borderRight: '1px solid var(--line-1)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--line-1)' }}>
            <VellinLogo size={20}/>
          </div>
          <div style={{ padding: 12, fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Профиль</div>
          <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { i: 'user', l: 'Профиль', a: true },
              { i: 'settings', l: 'Аккаунт' },
              { i: 'bell', l: 'Уведомления' },
              { i: 'lock', l: 'Приватность' },
              { i: 'speaker', l: 'Звук и видео' },
              { i: 'sun', l: 'Внешний вид' },
              { i: 'cast', l: 'Подключения' },
              { i: 'crown', l: 'Подписка' },
            ].map(it => (
              <div key={it.l} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 8, cursor: 'pointer',
                background: it.a ? 'var(--bg-3)' : 'transparent',
                color: it.a ? 'var(--text-0)' : 'var(--text-1)', fontSize: 13.5,
              }}>
                <Icon name={it.i} size={14}/>{it.l}
              </div>
            ))}
          </div>
        </div>

        {/* Контент */}
        <div style={{ overflow: 'auto' }}>
          {/* Обложка */}
          <div style={{ position: 'relative', height: 180 }}>
            <MountainPoster seed={4}/>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent, var(--bg-0))' }}/>
            <button style={{ position: 'absolute', top: 16, right: 16, padding: '6px 12px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', border: 'none', color: '#fff', fontSize: 12, fontFamily: 'inherit', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="image" size={12}/> Изменить обложку
            </button>
          </div>

          {/* Карточка пользователя */}
          <div style={{ padding: '0 40px', marginTop: -56, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
              <div style={{ position: 'relative' }}>
                <div style={{ padding: 4, borderRadius: '50%', background: 'var(--bg-0)' }}>
                  <Avatar name="Артём Северов" size={112}/>
                </div>
                <button style={{ position: 'absolute', right: 6, bottom: 6, width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--bg-0)', background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <Icon name="edit" size={13}/>
                </button>
              </div>
              <div style={{ flex: 1, paddingBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>Артём Северов</h1>
                  <Chip tone="accent" icon="crown">Vellin Plus</Chip>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>@artem</span>
                  <span>·</span>
                  <span>С нами с марта 2024</span>
                  <span>·</span>
                  <span>Москва</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, paddingBottom: 12 }}>
                <Button variant="secondary" icon="edit">Редактировать</Button>
                <Button variant="primary" icon="users">Пригласить друзей</Button>
              </div>
            </div>

            {/* Статистика */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 28 }}>
              {[
                { n: '128', l: 'часов вместе' },
                { n: '42', l: 'комнаты создано' },
                { n: '37', l: 'друзей' },
                { n: '14', l: 'в библиотеке' },
              ].map(s => (
                <div key={s.l} style={{ padding: 18, background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)' }}>
                  <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>{s.n}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* О себе */}
            <Section title="О себе" action="Редактировать">
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-1)', maxWidth: 640 }}>
                Каждую пятницу — кинозал. Люблю медленное кино, документалки и закаты в 4K. Готов разделить наушники, если что.
              </p>
            </Section>

            {/* Активность */}
            <Section title="Последняя активность">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { t: 'Создал комнату', n: 'Закат в Альпах', dt: 'сейчас', i: 'plus' },
                  { t: 'Загрузил видео', n: 'dusk-alps-4k-2024.mp4', dt: '2 часа назад', i: 'upload' },
                  { t: 'Присоединился к', n: 'Документалке', dt: 'вчера', i: 'arrow' },
                  { t: 'Добавил в избранное', n: 'Космос вместе', dt: '3 дня назад', i: 'heart' },
                ].map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-3)', display: 'grid', placeItems: 'center', color: 'var(--text-1)', flexShrink: 0 }}>
                      <Icon name={a.i} size={14}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-1)' }}>
                        {a.t} <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>{a.n}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{a.dt}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Друзья */}
            <Section title="Друзья" action="Все 37">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                {['Аня', 'Миша', 'Даня', 'Ева', 'Кирилл', 'Лев', 'Маша', 'Поля', 'Тима', 'Юля', 'Ира', 'Ник'].map(n => (
                  <div key={n} style={{ padding: 12, background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <Avatar name={n} size={44} status={Math.random() > 0.6 ? 'online' : undefined}/>
                    <div style={{ fontSize: 12, fontWeight: 500, textAlign: 'center' }}>{n}</div>
                  </div>
                ))}
              </div>
            </Section>

            <div style={{ height: 40 }}/>
          </div>
        </div>
      </div>
    </AppFrame>
  );
};

const Section = ({ title, action, children }) => (
  <section style={{ marginTop: 32 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em' }}>{title}</h2>
      {action && <button style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{action}</button>}
    </div>
    {children}
  </section>
);

window.Profile = Profile;
