import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  chromium,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';
import { API, CREATED_USERS, SITE } from './env';
import { HEARING_PROBE, analyse, type HearingReport, type Sample } from './hearing';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export interface Account {
  id: string;
  publicId: string;
  username: string;
  email: string;
  password: string;
  token: string;
}

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${r.status}: ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Зарегистрировать человека так же, как это делает форма регистрации. */
export async function register(name: string): Promise<Account> {
  const tag = randomBytes(4).toString('hex');
  const email = `e2e-call-${tag}@test.local`;
  const password = `pass-${tag}-word`;
  const username = `${name}_${tag}`.slice(0, 32);
  const res = await api<{ token: string; user: { id: string; publicId: string; username: string } }>(
    '/auth/register',
    { method: 'POST', body: JSON.stringify({ email, username, password }) },
  );
  appendFileSync(CREATED_USERS, `${JSON.stringify({ id: res.user.id })}\n`);
  return { ...res.user, email, password, token: res.token };
}

/** Подружить двоих: заявка одного и её принятие другим. */
export async function befriend(a: Account, b: Account): Promise<void> {
  const sent = await api<{ request: { id: string }; autoAccepted: boolean }>('/friends/requests', {
    method: 'POST',
    token: a.token,
    body: JSON.stringify({ userId: b.id }),
  });
  if (!sent.autoAccepted) {
    await api(`/friends/requests/${sent.request.id}/accept`, { method: 'POST', token: b.token, body: '{}' });
  }
}

export interface PersonOptions {
  /** WAV-файл, который звучит в микрофоне этого человека. */
  voice: string;
  /** Телефон: узкий экран, касания, мобильный браузер. */
  mobile?: boolean;
}

/**
 * Человек: свой аккаунт, свой браузер со своим микрофоном и камерой.
 * Отдельный процесс браузера на человека нужен потому, что поддельный
 * микрофон Chrome задаётся на весь процесс.
 */
export class Person {
  browser!: Browser;
  /** Последние строки журнала звонка со страницы. */
  readonly callLog: string[] = [];
  context!: BrowserContext;
  page!: Page;

  /**
   * Соединения страницы с сервером в реальном времени идут через прокси
   * теста: так их можно оборвать, как обрывает их пропавшая сеть. Обычное
   * «офлайн» в браузере уже открытые соединения не рвёт.
   */
  private wsRoutes = new Set<WebSocketRoute>();
  private wsBlocked = false;
  /** Сколько раз страница открывала соединение с сервером — переподключения видны по росту. */
  socketsOpened = 0;

  constructor(
    readonly account: Account,
    readonly options: PersonOptions,
  ) {}

  get name(): string {
    return this.account.username;
  }

  async start(): Promise<void> {
    this.browser = await chromium.launch({
      channel: process.env.E2E_BROWSER_CHANNEL ?? 'chrome',
      headless: !process.env.HEADED,
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${this.options.voice}`,
        '--autoplay-policy=no-user-gesture-required',
        '--auto-select-desktop-capture-source=Entire screen',
        // Стенд локальный: системный прокси и его автопоиск здесь только
        // мешают — на Windows с VPN первый запрос иногда висел до таймаута.
        '--no-proxy-server',
        // Только основной сетевой интерфейс. Оба собеседника в тестах на одном
        // компьютере, а у него есть виртуальные адаптеры (Hyper-V, VPN): через
        // них стороны иногда выбирали разные пути, и звук обрывался — так не
        // бывает между разными устройствами, где эти адреса недоступны.
        '--force-webrtc-ip-handling-policy=default_public_interface_only',
      ],
    });
    const mobile = !!this.options.mobile;
    this.context = await this.browser.newContext({
      baseURL: SITE,
      ignoreHTTPSErrors: true,
      permissions: ['microphone', 'camera'],
      locale: 'ru-RU',
      ...(mobile
        ? {
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
            userAgent:
              'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
          }
        : { viewport: { width: 1440, height: 900 } }),
    });
    // Проверяется стенд, а не чужие сети: внешние ресурсы (шрифты с CDN и
    // прочее) отключены. Иначе недоступный CDN держал страницу пустой и
    // тест падал по причине, не связанной со звонками.
    const local = new URL(SITE).hostname;
    await this.context.route(
      (url) => url.protocol.startsWith('http') && url.hostname !== local && url.hostname !== '127.0.0.1',
      (route) => route.abort(),
    );
    await this.context.addInitScript(HEARING_PROBE);
    await this.context.routeWebSocket(/\/ws\//, (ws) => {
      if (this.wsBlocked) {
        ws.close({ code: 1006, reason: 'нет сети' });
        return;
      }
      ws.connectToServer();
      this.socketsOpened++;
      this.wsRoutes.add(ws);
      ws.onClose(() => this.wsRoutes.delete(ws));
    });
    this.page = await this.context.newPage();
    // Журнал звонка страницы — для разбора провалов: что происходило с
    // соединением, пока тест ждал.
    this.page.on('console', (m) => {
      const t = m.text();
      if (!t.includes('[call]') || /RemoteAudio|mic settings/.test(t)) return;
      this.callLog.push(`${new Date().toISOString().slice(11, 23)} ${t.slice(0, 200)}`);
      if (this.callLog.length > 400) this.callLog.shift();
    });
    await this.login();
  }

  /** Вход через форму на сайте. */
  async login(): Promise<void> {
    const p = this.page;
    // Ждём готовности страницы, а не загрузки каждого ресурса: в режиме
    // разработки сайт тянет сотни модулей, а человеку важна форма.
    await p.goto('/login', { waitUntil: 'domcontentloaded' });
    await p.getByLabel('Email').fill(this.account.email);
    await p.getByLabel('Пароль').fill(this.account.password);
    await p.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(p).not.toHaveURL(/\/login/);
  }

  /** Открыть переписку с человеком — как по ссылке «Написать» из профиля. */
  async openChatWith(other: Person): Promise<void> {
    await this.page.goto(`/messages/${other.account.publicId}`, { waitUntil: 'domcontentloaded' });
    await expect(this.callButton()).toBeEnabled();
  }

  callButton() {
    return this.page.getByRole('button', { name: 'Позвонить', exact: true });
  }

  videoCallButton() {
    return this.page.getByRole('button', { name: 'Видеозвонок', exact: true });
  }

  /** Кнопка с этой подписью где угодно на странице (включая слой звонка). */
  button(name: string | RegExp) {
    return this.page.getByRole('button', { name, exact: typeof name === 'string' });
  }

  /**
   * Признак идущего разговора: есть чем его завершить — на экране разговора
   * или на свёрнутой полосе.
   */
  inCall() {
    return this.button('Завершить звонок').first();
  }

  /** Развёрнутый экран разговора. */
  callScreen() {
    return this.page.getByRole('dialog', { name: /^Звонок с / });
  }

  /** Послушать в течение `ms` и разобрать, что было слышно. */
  async listen(ms: number): Promise<HearingReport> {
    const samples = await this.page.evaluate(
      (d) => (window as unknown as { __hearing: { record(ms: number): Promise<Sample[]> } }).__hearing.record(d),
      ms,
    );
    return analyse(samples);
  }

  /** Что браузер сейчас захватывает у этого человека (значок записи). */
  async capturing(): Promise<{ microphone: number; camera: number; screen: number }> {
    return this.page.evaluate(() =>
      (window as unknown as { __hearing: { capturing(): { microphone: number; camera: number; screen: number } } }).__hearing.capturing(),
    );
  }

  /**
   * Пропала сеть: соединения с сервером обрываются, новые не устанавливаются
   * `ms` миллисекунд, потом сеть возвращается. Возвращает, сколько открытых
   * соединений оборвалось.
   */
  async loseNetwork(ms: number): Promise<number> {
    this.wsBlocked = true;
    await this.context.setOffline(true);
    const cut = [...this.wsRoutes];
    for (const ws of cut) {
      await ws.close({ code: 1006, reason: 'нет сети' }).catch(() => undefined);
    }
    this.wsRoutes.clear();
    await this.page.waitForTimeout(ms);
    await this.context.setOffline(false);
    this.wsBlocked = false;
    return cut.length;
  }

  /**
   * Сетевая сторона голоса за окно `ms`: сколько пакетов голоса пришло от
   * собеседника и сколько его отчётов о приёме нашего голоса (RTCP). Отчёты
   * о звуке приходят раз в несколько секунд — окно нужно не короче 10 с.
   */
  async rtcFlow(ms: number): Promise<{ inbound: number; reports: number }> {
    return this.page.evaluate(
      (d) => (window as unknown as { __hearing: { rtcFlow(ms: number): Promise<{ inbound: number; reports: number }> } }).__hearing.rtcFlow(d),
      ms,
    );
  }

  /** Сетевая картина звонка — для сообщения о провале. */
  async rtcReport(): Promise<string> {
    return this.page.evaluate(() =>
      (window as unknown as { __hearing: { rtcReport(): Promise<string> } }).__hearing.rtcReport(),
    );
  }

  async stop(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
  }
}
