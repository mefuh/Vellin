import { test as base, expect } from '@playwright/test';
import { VOICE_A } from '../support/env';
import { AppPerson } from '../support/app-person';
import { Person, befriend, register, type Account } from '../support/person';
import { describe as describeHearing, type HearingReport } from '../support/hearing';

/**
 * Звонки между сайтом и клиентом для Windows.
 *
 * Человек на сайте — Chrome с подставленным голосом, человек в приложении —
 * настоящий клиент с микрофоном этой машины (он может молчать). Поэтому, что
 * голос идёт в обе стороны, проверяется по сети, со стороны сайта:
 * - от приложения приходят пакеты голоса — растёт число принятых;
 * - приложение принимает наш голос — растёт число его отчётов о приёме (RTCP).
 * Это то, без чего человек на другой стороне ничего бы не услышал.
 *
 * Сторона, которая уступает при встречном согласовании соединения,
 * определяется порядком аккаунтов. Поэтому проверки идут в двух раскладках:
 * сайт уступает приложению — и наоборот.
 *
 * Только Windows: нужен Flutter и сборка клиента.
 */

base.skip(process.platform !== 'win32' || !!process.env.SKIP_APP_TESTS, 'нужен Windows и Flutter');

interface Mixed {
  web: Person;
  app: AppPerson;
}

const test = base.extend<{ webFirst: boolean; webOnPhone: boolean; mixed: Mixed }>({
  webFirst: [true, { option: true }],
  webOnPhone: [false, { option: true }],
  mixed: async ({ webFirst, webOnPhone }, use, testInfo) => {
    // Идентификаторы растут со временем регистрации: кто зарегистрирован
    // раньше, у того он меньше — и он «вежливая» сторона соединения.
    let webAcc: Account;
    let appAcc: Account;
    if (webFirst) {
      webAcc = await register('web');
      appAcc = await register('app');
    } else {
      appAcc = await register('app');
      webAcc = await register('web');
    }
    await befriend(webAcc, appAcc);
    const web = new Person(webAcc, { voice: VOICE_A, mobile: webOnPhone });
    const app = new AppPerson(appAcc);
    try {
      await Promise.all([web.start(), app.start()]);
      await use({ web, app });
    } finally {
      // Провал — прикладываем журналы обеих сторон, без них причину не найти.
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('журнал звонка сайта', { body: web.callLog.join('\n'), contentType: 'text/plain' });
        await testInfo.attach('вывод клиента', { body: app.tail(), contentType: 'text/plain' });
      }
      await Promise.all([web.stop(), app.stop()]);
    }
  },
});

/**
 * Голос идёт в обе стороны: за окно в 12 с от приложения пришли пакеты голоса
 * (при 50 пакетах в секунду — сотни) и пришли его отчёты о приёме нашего
 * голоса (раз в несколько секунд).
 */
async function expectVoiceBothWays(web: Person, what: string): Promise<void> {
  const flow = await web.rtcFlow(12_000);
  const got = `за 12 с: ${flow.inbound} пакетов голоса, ${flow.reports} отчётов о приёме; сеть: ${flow.inbound > 200 ? 'ок' : await web.rtcReport()}`;
  expect(flow.inbound, `${what}: голос из приложения доходит до сайта (${got})`).toBeGreaterThan(200);
  expect(flow.reports, `${what}: приложение принимает голос с сайта (${got})`).toBeGreaterThan(0);
  // И звук собеседника на сайте действительно играет.
  const heard = await web.page.evaluate(() =>
    (window as unknown as { __hearing: { level(): { sources: number } } }).__hearing.level(),
  );
  expect(heard.sources, `${what}: на сайте играет звук собеседника`).toBeGreaterThan(0);
}

/** Сайт звонит, приложение отвечает; оба в разговоре, голос идёт. */
async function callAndAnswer({ web, app }: Mixed, n: number): Promise<void> {
  await web.openChatWith({ account: app.account } as Person);
  await web.callButton().click();
  await app.waitForText('Ответить', 30_000);
  await app.tap('Ответить');
  await expect(web.inCall(), `звонок ${n}: сайт в разговоре`).toBeVisible({ timeout: 30_000 });
  // Приложение показывает разговор, когда связь действительно поднялась.
  await app.waitForText('Завершить звонок', 30_000);
  await expect
    .poll(async () => (await web.rtcFlow(1500)).inbound, {
      timeout: 20_000,
      message: `звонок ${n}: голос из приложения не пошёл`,
    })
    .toBeGreaterThan(0);
  await expectVoiceBothWays(web, `звонок ${n}`);
}

async function hangupFromWeb({ web, app }: Mixed): Promise<void> {
  await web.button('Завершить звонок').click();
  await expect(web.inCall()).toBeHidden({ timeout: 15_000 });
  await app.waitGone('Завершить звонок', 20_000);
}

for (const webFirst of [true, false]) {
  const layout = webFirst ? 'сайт уступает приложению' : 'приложение уступает сайту';

  test.describe(`Сайт ↔ приложение (${layout})`, () => {
    test.use({ webFirst });
    test.setTimeout(12 * 60_000);

    test('три звонка подряд: каждый соединяется, голос идёт в обе стороны', async ({ mixed }) => {
      for (let i = 1; i <= 3; i++) {
        await callAndAnswer(mixed, i);
        await hangupFromWeb(mixed);
      }
    });

    test('обрыв связи с сервером у сайта на 8 с — разговор продолжается', async ({ mixed }) => {
      const { web, app } = mixed;
      await callAndAnswer(mixed, 1);
      const cut = await web.loseNetwork(8000);
      expect(cut, 'обрыв должен разорвать соединение сайта с сервером').toBeGreaterThan(0);
      // Связь вернулась — оба по-прежнему в разговоре, голос снова идёт.
      await expect(web.inCall()).toBeVisible({ timeout: 30_000 });
      await app.waitForText('Завершить звонок', 30_000);
      // Переподключение пересоздаёт соединение между людьми — даём ему
      // закончиться, а потом требуем, чтобы голос шёл ровно.
      await web.page.waitForTimeout(15_000);
      await expectVoiceBothWays(web, 'после обрыва');
    });

    test('отбой из приложения завершает звонок и на сайте', async ({ mixed }) => {
      const { web, app } = mixed;
      await callAndAnswer(mixed, 1);
      await app.tap('Завершить звонок');
      await expect(web.inCall()).toBeHidden({ timeout: 15_000 });
      await expect.poll(() => web.capturing(), { timeout: 10_000 }).toEqual({ microphone: 0, camera: 0, screen: 0 });
    });
  });
}

/**
 * Микрофон клиента настоящий — у машины он может слышать только тихий фон.
 * Но и тихий фон — это сигнал (уровень порядка −90…−110 дБ), а выключенный
 * микрофон даёт цифровую тишину: на сайте не играет ничего (−180 дБ). Этой
 * разницы достаточно, чтобы отличить «клиента слышно» от «клиента нет».
 */
const SILENT_DB = -150;

async function expectAppAudible(mixed: Mixed, what: string, r: HearingReport): Promise<void> {
  if (r.medianDb > SILENT_DB) return;
  const net = await mixed.web.rtcReport();
  const screen = (await mixed.app.screen()).texts.slice(0, 30).join(' · ');
  expect(r.medianDb, `${what}: от клиента должен идти звук (${describeHearing(r)}). Сеть: ${net}. Клиент: ${screen}`).toBeGreaterThan(SILENT_DB);
}

function expectAppSilent(what: string, r: HearingReport): void {
  expect(r.medianDb, `${what}: от клиента должна быть тишина (${describeHearing(r)})`).toBeLessThan(SILENT_DB);
}

test.describe('Телефон ↔ клиент для Windows: микрофон и демонстрация', () => {
  test.use({ webOnPhone: true });
  test.setTimeout(15 * 60_000);

  test('четыре звонка подряд: клиента слышно с начала, выключение микрофона — тишина, включение — снова слышно', async ({ mixed }) => {
    const { web, app } = mixed;
    for (let n = 1; n <= 4; n++) {
      await callAndAnswer(mixed, n);
      await web.page.waitForTimeout(2000);
      await expectAppAudible(mixed, `звонок ${n}, начало`, await web.listen(5000));

      await app.tap('Выключить микрофон');
      await web.page.waitForTimeout(1500);
      expectAppSilent(`звонок ${n}, микрофон клиента выключен`, await web.listen(5000));

      await app.tap('Включить микрофон');
      await web.page.waitForTimeout(1500);
      await expectAppAudible(mixed, `звонок ${n}, микрофон клиента снова включён`, await web.listen(5000));

      expect(await app.alive(), `звонок ${n}: клиент работает`).toBe(true);
      await hangupFromWeb(mixed);
      expect(await app.alive(), `после звонка ${n}: клиент не упал`).toBe(true);
    }
  });

  test('демонстрация экрана из клиента доходит до телефона и останавливается', async ({ mixed }) => {
    const { web, app } = mixed;
    await callAndAnswer(mixed, 1);
    await app.tap('Демонстрация экрана');
    await app.waitForText('Начать демонстрацию', 15_000);
    await app.tap('Начать демонстрацию');
    await expect(web.page.getByText(/демонстрирует экран|Экран:/i).first()).toBeVisible({ timeout: 20_000 });
    // Картинка демонстрации действительно идёт, а не только плашка.
    await expect
      .poll(() => web.page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).length), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    await app.tap('Остановить демонстрацию');
    await expect(web.page.getByText(/демонстрирует экран|Экран:/i)).toHaveCount(0, { timeout: 20_000 });
    expect(await app.alive(), 'клиент работает').toBe(true);
    await hangupFromWeb(mixed);
    expect(await app.alive(), 'после звонка клиент не упал').toBe(true);
  });
});
