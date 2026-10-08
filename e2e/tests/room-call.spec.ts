import { API } from '../support/env';
import type { Person } from '../support/person';
import { expect, expectHears, expectSilence, test, waitUntilHears } from './fixtures';

/**
 * Голосовой чат в комнате совместного просмотра — та же механика звонка,
 * что и в личных сообщениях, только участников может быть больше. Здесь
 * проверяется главное: двое в комнате слышат друг друга.
 */

async function createRoom(owner: Person): Promise<string> {
  const r = await fetch(`${API}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.account.token}` },
    body: JSON.stringify({ name: 'Проверка звонка', isPrivate: false }),
  });
  if (!r.ok) throw new Error(`POST /rooms → ${r.status}: ${await r.text()}`);
  const body = (await r.json()) as { room?: { slug: string }; slug?: string };
  const slug = body.room?.slug ?? body.slug;
  if (!slug) throw new Error(`нет slug в ответе: ${JSON.stringify(body)}`);
  return slug;
}

async function enterRoomCall(p: Person, slug: string): Promise<void> {
  await p.page.goto(`/room/${slug}`, { waitUntil: 'domcontentloaded' });
  const join = p.page.getByRole('button', { name: /Войти в звонок|Начать звонок/ }).first();
  await join.click();
  // В комнате входят в звонок с выключенным микрофоном — включаем сами.
  const micOn = p.page.getByRole('button', { name: 'Включить микрофон' }).first();
  await expect(micOn).toBeVisible({ timeout: 20_000 });
  await micOn.click();
  await expect(p.page.getByRole('button', { name: 'Выключить микрофон' }).first()).toBeVisible();
}

test.describe('Голосовой чат в комнате', () => {
  test('двое в комнате слышат друг друга, а выключенный микрофон — тишина', async ({ pair }) => {
    const { alice, bob } = pair;
    const slug = await createRoom(alice);
    await enterRoomCall(alice, slug);
    await enterRoomCall(bob, slug);

    await Promise.all([waitUntilHears(alice, 30_000), waitUntilHears(bob, 30_000)]);
    const [a, b] = await Promise.all([alice.listen(6000), bob.listen(6000)]);
    expectHears('Алиса в комнате', a);
    expectHears('Боб в комнате', b);

    await alice.page.getByRole('button', { name: 'Выключить микрофон' }).first().click();
    await bob.page.waitForTimeout(1500);
    expectSilence('Боб при выключенном микрофоне Алисы', await bob.listen(6000));

    // Покинувшего звонок больше не слышно.
    await alice.page.getByRole('button', { name: 'Включить микрофон' }).first().click();
    await waitUntilHears(bob, 10_000);
    await bob.page.getByRole('button', { name: 'Покинуть звонок' }).first().click();
    await alice.page.waitForTimeout(2000);
    expectSilence('Алиса после ухода Боба из звонка', await alice.listen(5000), 0);
  });
});
