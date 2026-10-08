import { SOAK_SEC } from '../support/env';
import { describe } from '../support/hearing';
import {
  connect,
  expect,
  expectHears,
  expectSilence,
  listenBoth,
  movingVideos,
  test,
  waitUntilHears,
} from './fixtures';

/**
 * Звонки в личных сообщениях глазами и ушами двух людей.
 *
 * Главный вопрос каждой проверки — слышат ли они друг друга. «Слышит» значит:
 * на странице человека реально играет звук, и это именно голос собеседника —
 * его выключение микрофоном у собеседника превращает звук в тишину.
 */

test.describe('Звонок: соединение', () => {
  test('входящий доходит, принимается, и оба оказываются в разговоре', async ({ pair }) => {
    const { alice, bob } = pair;
    await alice.openChatWith(bob);
    await alice.callButton().click();

    // У звонящего — окно дозвона с именем того, кому звонят, и отменой.
    const outgoing = alice.page.getByRole('alertdialog', { name: new RegExp(bob.name) });
    await expect(outgoing).toBeVisible();
    await expect(outgoing.getByRole('button', { name: /Отменить вызов/ })).toBeVisible();

    // У принимающего — вызов от звонящего, с кнопками ответа и отказа.
    const incoming = bob.page.getByRole('alertdialog', { name: new RegExp(alice.name) });
    await expect(incoming).toBeVisible();
    await expect(incoming.getByRole('button', { name: 'Ответить', exact: true })).toBeVisible();
    await expect(incoming.getByRole('button', { name: /Отклонить/ })).toBeVisible();

    await incoming.getByRole('button', { name: 'Ответить', exact: true }).click();
    await expect(alice.inCall()).toBeVisible({ timeout: 30_000 });
    await expect(bob.inCall()).toBeVisible({ timeout: 30_000 });
    await expect(incoming).toBeHidden();
  });

  test('собеседники слышат друг друга', async ({ pair }) => {
    await connect(pair);
    await Promise.all([waitUntilHears(pair.alice), waitUntilHears(pair.bob)]);
    const r = await listenBoth(pair, 6000);
    expectHears('Алиса', r.alice);
    expectHears('Боб', r.bob);
  });

  test('звук идёт именно от собеседника: его микрофон выключен — тишина, включён — снова слышно', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    await Promise.all([waitUntilHears(alice), waitUntilHears(bob)]);

    // Алиса выключает микрофон — Боб перестаёт её слышать, а она его — нет.
    await alice.button('Выключить микрофон').click();
    await bob.page.waitForTimeout(1500);
    let r = await listenBoth(pair, 6000);
    expectSilence('Боб при выключенном микрофоне Алисы', r.bob);
    expectHears('Алиса при своём выключенном микрофоне', r.alice);

    await alice.button('Включить микрофон').click();
    await waitUntilHears(bob, 10_000);
    expectHears('Боб после включения микрофона Алисы', await bob.listen(6000));

    // И в обратную сторону.
    await bob.button('Выключить микрофон').click();
    await alice.page.waitForTimeout(1500);
    r = await listenBoth(pair, 6000);
    expectSilence('Алиса при выключенном микрофоне Боба', r.alice);
    expectHears('Боб при своём выключенном микрофоне', r.bob);

    await bob.button('Включить микрофон').click();
    await waitUntilHears(alice, 10_000);
  });

  test('нет эха: свой голос человеку не возвращается', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    await Promise.all([waitUntilHears(alice), waitUntilHears(bob)]);
    // Боб молчит — Алиса, которая всё это время говорит, должна слышать тишину.
    await bob.button('Выключить микрофон').click();
    await alice.page.waitForTimeout(1500);
    expectSilence('Алиса, когда говорит только она', await alice.listen(6000));
  });

  test('собеседник видит, что микрофон выключен', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    await alice.button('Выключить микрофон').click();
    await expect(bob.page.getByText('Микрофон выключен').first()).toBeVisible();
    await alice.button('Включить микрофон').click();
    await expect(bob.page.getByText('Микрофон выключен')).toHaveCount(0);
  });
});

test.describe('Звонок: стабильность', () => {
  test(`разговор держится ${SOAK_SEC} с без провалов звука в обе стороны`, async ({ pair }) => {
    test.setTimeout((SOAK_SEC + 120) * 1000);
    const { alice, bob } = pair;
    await connect(pair);
    await Promise.all([waitUntilHears(alice), waitUntilHears(bob)]);

    // Слушаем кусками, чтобы при провале было видно, когда он случился.
    const chunk = 10_000;
    const chunks = Math.max(1, Math.round((SOAK_SEC * 1000) / chunk));
    for (let i = 0; i < chunks; i++) {
      const r = await listenBoth(pair, chunk);
      const at = `${(i * chunk) / 1000}–${((i + 1) * chunk) / 1000} с`;
      expectHears(`Алиса (${at})`, r.alice);
      expectHears(`Боб (${at})`, r.bob);
      // Паузы между фразами есть и в живой речи; провал связи — дольше.
      expect(r.alice.longestSilenceMs, `Алиса, провал звука на ${at}: ${describe(r.alice)}`).toBeLessThanOrEqual(2500);
      expect(r.bob.longestSilenceMs, `Боб, провал звука на ${at}: ${describe(r.bob)}`).toBeLessThanOrEqual(2500);
      await expect(alice.inCall()).toBeVisible();
      await expect(bob.inCall()).toBeVisible();
    }
  });

  test('шесть звонков подряд, попеременно в обе стороны: каждый соединяется, и оба слышат', async ({ pair }) => {
    test.setTimeout(300_000);
    const { alice, bob } = pair;
    // Кто звонит, а кто отвечает, влияет на то, чья сторона начинает
    // согласование соединения, — поэтому направление чередуется.
    for (let i = 0; i < 6; i++) {
      const [caller, callee] = i % 2 === 0 ? [alice, bob] : [bob, alice];
      await caller.openChatWith(callee);
      await caller.callButton().click();
      const incoming = callee.page.getByRole('alertdialog', { name: new RegExp(caller.name) });
      await expect(incoming, `звонок ${i + 1}: вызов дошёл`).toBeVisible();
      await incoming.getByRole('button', { name: 'Ответить', exact: true }).click();
      await expect(caller.inCall(), `звонок ${i + 1}: разговор начался`).toBeVisible({ timeout: 20_000 });
      await expect(callee.inCall(), `звонок ${i + 1}: разговор начался`).toBeVisible({ timeout: 20_000 });
      await Promise.all([waitUntilHears(caller, 15_000), waitUntilHears(callee, 15_000)]);
      await caller.button('Завершить звонок').click();
      await expect(callee.inCall()).toBeHidden({ timeout: 15_000 });
      await expect(caller.inCall()).toBeHidden({ timeout: 15_000 });
    }
  });

  test('таймер разговора идёт и у обоих показывает одно и то же', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    const timer = (p: typeof alice) =>
      p.page.getByText(/^\d{2}:\d{2}$/).first().textContent();
    const toSec = (t: string | null) => {
      const [m, s] = (t ?? '0:0').split(':').map(Number);
      return m! * 60 + s!;
    };
    const a1 = toSec(await timer(alice));
    await alice.page.waitForTimeout(5000);
    const [a2, b2] = await Promise.all([timer(alice), timer(bob)]);
    expect(toSec(a2) - a1).toBeGreaterThanOrEqual(4);
    expect(toSec(a2) - a1).toBeLessThanOrEqual(7);
    expect(Math.abs(toSec(a2) - toSec(b2))).toBeLessThanOrEqual(2);
  });

  test('обрыв связи с сервером у одного на 8 с не роняет разговор', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    await Promise.all([waitUntilHears(alice), waitUntilHears(bob)]);

    const openedBefore = alice.socketsOpened;
    // Голос идёт напрямую между людьми — пока у Алисы нет связи с сервером,
    // Боб продолжает её слышать.
    const [cut, duringOutage] = await Promise.all([
      alice.loseNetwork(8000),
      bob.page.waitForTimeout(500).then(() => bob.listen(6000)),
    ]);
    expectHears('Боб, пока у Алисы нет связи с сервером', duringOutage);
    // Проверка имеет смысл, только если связь с сервером действительно рвалась.
    expect(cut, 'обрыв должен разорвать соединение страницы с сервером').toBeGreaterThan(0);
    // Сеть вернулась — сайт сам восстанавливает связь с сервером.
    await expect.poll(() => alice.socketsOpened, { timeout: 30_000 }).toBeGreaterThan(openedBefore);

    // Связь вернулась — разговор продолжается, оба снова слышат друг друга.
    await Promise.all([waitUntilHears(alice, 30_000), waitUntilHears(bob, 30_000)]);
    const r = await listenBoth(pair, 6000);
    expectHears('Алиса после обрыва', r.alice);
    expectHears('Боб после обрыва', r.bob);
    await expect(alice.inCall()).toBeVisible();
    await expect(bob.inCall()).toBeVisible();
  });

  test('перезагрузка страницы посреди разговора — звонок восстанавливается со звуком', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    await Promise.all([waitUntilHears(alice), waitUntilHears(bob)]);

    await bob.page.reload({ waitUntil: 'domcontentloaded' });
    await expect(bob.inCall()).toBeVisible({ timeout: 30_000 });
    await Promise.all([waitUntilHears(alice, 30_000), waitUntilHears(bob, 30_000)]);
    const r = await listenBoth(pair, 6000);
    expectHears('Алиса после перезагрузки у Боба', r.alice);
    expectHears('Боб после перезагрузки', r.bob);
  });

  test('свернуть и развернуть звонок, походить по сайту — звук не прерывается', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    await Promise.all([waitUntilHears(alice), waitUntilHears(bob)]);

    await bob.button('Свернуть звонок').click();
    await expect(bob.callScreen()).toBeHidden();
    // Свёрнутый звонок по-прежнему виден и управляем.
    await expect(bob.button(/Развернуть звонок/)).toBeVisible();
    const minimized = await listenBoth(pair, 6000);
    expectHears('Боб со свёрнутым звонком', minimized.bob);
    expectHears('Алиса, пока у Боба звонок свёрнут', minimized.alice);

    // Переход по сайту внутри приложения не обрывает разговор.
    const friends = bob.page.getByRole('link', { name: /Друзья/ }).or(bob.page.getByRole('button', { name: /Друзья/ }));
    await friends.first().click();
    await expect(bob.page).toHaveURL(/friends/);
    expectHears('Боб на другой странице сайта', await bob.listen(6000));

    await bob.button(/Развернуть звонок/).click();
    await expect(bob.callScreen()).toBeVisible();
    expectHears('Боб после разворота', await bob.listen(6000));
  });

  test('камера: собеседник видит живое видео, звук при этом не прерывается', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    await Promise.all([waitUntilHears(alice), waitUntilHears(bob)]);
    const before = await movingVideos(bob);

    await alice.button('Включить камеру').click();
    await expect.poll(() => movingVideos(bob), { timeout: 20_000 }).toBeGreaterThan(before);
    expectHears('Боб при включённой камере Алисы', await bob.listen(6000));

    expect((await alice.capturing()).camera, 'камера Алисы захвачена, пока включена').toBeGreaterThan(0);

    await alice.button('Выключить камеру').click();
    await expect.poll(() => movingVideos(bob), { timeout: 20_000 }).toBe(before);
    // Выключенная камера освобождена, а не просто скрыта — иначе её не взять
    // другой программе и у человека горит индикатор камеры.
    await expect.poll(async () => (await alice.capturing()).camera, { timeout: 10_000 }).toBe(0);
    expect((await alice.capturing()).microphone, 'микрофон при этом продолжает работать').toBeGreaterThan(0);
    expectHears('Боб после выключения камеры Алисы', await bob.listen(6000));
  });

  test('демонстрация экрана доходит до собеседника и не прерывает звук', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    await Promise.all([waitUntilHears(alice), waitUntilHears(bob)]);
    const before = await movingVideos(bob);

    await alice.button('Демонстрация экрана').click();
    await alice.button('Начать демонстрацию').click();
    await expect(bob.page.getByText(/демонстрирует экран/i).first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => movingVideos(bob), { timeout: 20_000 }).toBeGreaterThan(before);
    const during = await listenBoth(pair, 6000);
    expectHears('Боб во время демонстрации', during.bob);
    expectHears('Алиса во время своей демонстрации', during.alice);

    await alice.button('Остановить демонстрацию').click();
    await expect(bob.page.getByText(/демонстрирует экран/i)).toHaveCount(0, { timeout: 20_000 });
    // Захват экрана остановлен, а не только спрятан.
    await expect.poll(async () => (await alice.capturing()).screen, { timeout: 10_000 }).toBe(0);
    expectHears('Боб после демонстрации', await bob.listen(6000));
  });
});

test.describe('Звонок: завершение', () => {
  test('отбой одной стороной завершает звонок у обоих, и звук пропадает', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    await Promise.all([waitUntilHears(alice), waitUntilHears(bob)]);

    await alice.button('Завершить звонок').click();
    await expect(alice.inCall()).toBeHidden({ timeout: 15_000 });
    await expect(bob.inCall()).toBeHidden({ timeout: 15_000 });
    await bob.page.waitForTimeout(1500);
    const r = await listenBoth(pair, 6000);
    expectSilence('Боб после отбоя', r.bob, 0);
    expectSilence('Алиса после отбоя', r.alice, 0);
    // Значок записи гаснет: ни микрофон, ни камера больше не захвачены.
    await expect.poll(() => alice.capturing(), { timeout: 10_000 }).toEqual({ microphone: 0, camera: 0, screen: 0 });
    await expect.poll(() => bob.capturing(), { timeout: 10_000 }).toEqual({ microphone: 0, camera: 0, screen: 0 });
    // Можно сразу позвонить снова.
    await expect(alice.callButton()).toBeEnabled({ timeout: 15_000 });
  });

  test('отклонённый вызов исчезает у обоих, разговор не начинается', async ({ pair }) => {
    const { alice, bob } = pair;
    await alice.openChatWith(bob);
    await alice.callButton().click();
    const incoming = bob.page.getByRole('alertdialog', { name: new RegExp(alice.name) });
    await expect(incoming).toBeVisible();
    await incoming.getByRole('button', { name: /Отклонить/ }).click();
    await expect(incoming).toBeHidden();
    await expect(alice.button(/Отменить вызов/)).toBeHidden({ timeout: 15_000 });
    await expect(alice.inCall()).toBeHidden();
    await expect(bob.inCall()).toBeHidden();
    await expect(alice.callButton()).toBeEnabled({ timeout: 15_000 });
    // Отказ — не повод трогать микрофон: ни у кого он не захвачен.
    expect(await alice.capturing()).toEqual({ microphone: 0, camera: 0, screen: 0 });
    expect(await bob.capturing()).toEqual({ microphone: 0, camera: 0, screen: 0 });
  });

  test('вызов, отменённый до ответа, пропадает у получателя', async ({ pair }) => {
    const { alice, bob } = pair;
    await alice.openChatWith(bob);
    await alice.callButton().click();
    const incoming = bob.page.getByRole('alertdialog', { name: new RegExp(alice.name) });
    await expect(incoming).toBeVisible();
    await alice.button(/Отменить вызов/).click();
    await expect(incoming).toBeHidden({ timeout: 15_000 });
    await expect(bob.inCall()).toBeHidden();
  });
});

test.describe('Звонок с телефона', () => {
  test.use({ bobOnPhone: true });

  test('на телефоне вызов принимается, оба слышат друг друга, управление на экране', async ({ pair }) => {
    const { alice, bob } = pair;
    await connect(pair);
    await Promise.all([waitUntilHears(alice), waitUntilHears(bob)]);
    const r = await listenBoth(pair, 6000);
    expectHears('Алиса (собеседник на телефоне)', r.alice);
    expectHears('Боб на телефоне', r.bob);

    // Кнопки разговора целиком на экране телефона и не налезают друг на друга.
    const vp = bob.page.viewportSize()!;
    for (const name of ['Выключить микрофон', 'Включить камеру', 'Настройки звонка', 'Завершить звонок']) {
      const box = await bob.button(name).boundingBox();
      expect(box, `кнопка «${name}» видна`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
      // Палец должен попадать: не меньше 44 px.
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
    }
    // Демонстрации экрана мобильный браузер не умеет — кнопки быть не должно.
    await expect(bob.button('Демонстрация экрана')).toHaveCount(0);
    // Страница не уезжает вбок.
    const overflow = await bob.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
