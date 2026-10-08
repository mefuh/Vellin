import { test as base, expect } from '@playwright/test';
import { VOICE_A, VOICE_B } from '../support/env';
import { Person, befriend, register } from '../support/person';
import { describe, type HearingReport } from '../support/hearing';

export { expect };

interface Pair {
  /** Звонящий, всегда за компьютером, говорит по-русски. */
  alice: Person;
  /** Принимающий, говорит по-английски; в мобильных проверках — с телефона. */
  bob: Person;
}

/**
 * Каждой проверке — своя свежая пара друзей. Звонки одной пары сервер
 * ограничивает по частоте, а состояние прошлой проверки (незавершённый
 * звонок, настройки) не должно влиять на следующую.
 */
export const test = base.extend<{ bobOnPhone: boolean; pair: Pair }>({
  bobOnPhone: [false, { option: true }],
  pair: async ({ bobOnPhone }, use) => {
    const [a, b] = await Promise.all([register('alice'), register('bob')]);
    await befriend(a, b);
    const alice = new Person(a, { voice: VOICE_A });
    const bob = new Person(b, { voice: VOICE_B, mobile: bobOnPhone });
    await Promise.all([alice.start(), bob.start()]);
    try {
      await use({ alice, bob });
    } finally {
      await Promise.all([alice.stop(), bob.stop()]);
    }
  },
});

/** Алиса звонит, Боб отвечает голосом; оба оказываются в разговоре. */
export async function connect({ alice, bob }: Pair, opts: { video?: boolean } = {}): Promise<void> {
  await alice.openChatWith(bob);
  await (opts.video ? alice.videoCallButton() : alice.callButton()).click();
  const incoming = bob.page.getByRole('alertdialog', { name: new RegExp(alice.name) });
  await expect(incoming).toBeVisible();
  await bob.button('Ответить').click();
  await expect(alice.inCall()).toBeVisible({ timeout: 30_000 });
  await expect(bob.inCall()).toBeVisible({ timeout: 30_000 });
}

/** Оба слушают одновременно. */
export async function listenBoth(p: Pair, ms: number): Promise<{ alice: HearingReport; bob: HearingReport }> {
  const [alice, bob] = await Promise.all([p.alice.listen(ms), p.bob.listen(ms)]);
  return { alice, bob };
}

/** Утверждение «человек слышит собеседника» с понятным отчётом при провале. */
export function expectHears(who: string, r: HearingReport, minRatio = 0.5): void {
  if (process.env.E2E_VERBOSE) console.log(`  [слух] ${who}: ${describe(r)}`);
  expect(r.speechRatio, `${who} должен слышать собеседника: ${describe(r)}`).toBeGreaterThanOrEqual(minRatio);
}

/** Утверждение «человек ничего не слышит». */
export function expectSilence(who: string, r: HearingReport, maxRatio = 0.05): void {
  if (process.env.E2E_VERBOSE) console.log(`  [тишина] ${who}: ${describe(r)}`);
  expect(r.speechRatio, `${who} должен слышать тишину: ${describe(r)}`).toBeLessThanOrEqual(maxRatio);
}

/** Дождаться, пока человек начнёт слышать собеседника (связь поднимается не мгновенно). */
export async function waitUntilHears(p: Person, timeoutMs = 20_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  let last: HearingReport | null = null;
  while (Date.now() < until) {
    last = await p.listen(1500);
    if (last.speechRatio >= 0.3) return;
  }
  throw new Error(`${p.name} так и не услышал собеседника за ${timeoutMs} мс: ${last ? describe(last) : 'нет замеров'}`);
}

/**
 * Живые видеокадры на странице, которые меняются со временем: сколько видео
 * человек реально видит в движении. Свои и чужие не различаются — это
 * делает сам тест, сравнивая «до» и «после».
 */
export async function movingVideos(p: Person): Promise<number> {
  return p.page.evaluate(async () => {
    const vids = [...document.querySelectorAll('video')].filter((v) => {
      const r = v.getBoundingClientRect();
      return v.videoWidth > 0 && r.width > 20 && r.height > 20 && getComputedStyle(v).visibility !== 'hidden';
    });
    const snap = (v: HTMLVideoElement): string => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 36;
      const g = c.getContext('2d')!;
      g.drawImage(v, 0, 0, 64, 36);
      const d = g.getImageData(0, 0, 64, 36).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i]! + d[i + 1]! * 3 + d[i + 2]! * 7) >>> 0;
      return String(h);
    };
    const first = vids.map(snap);
    await new Promise((r) => setTimeout(r, 1200));
    return vids.filter((v, i) => snap(v) !== first[i]).length;
  });
}
