import { roomsApi } from '../api/rooms';
import { roomNameFor } from './sources';

/**
 * Ссылка, вставленная на лэндинге до входа в аккаунт.
 *
 * Поле на первом экране обещает «вставь ссылку — и смотрите», а комнату
 * создать может только вошедший человек. Чтобы обещание не рвалось на
 * регистрации, ссылка ждёт здесь и после входа сразу становится комнатой.
 * sessionStorage, а не localStorage: намерение живёт одну вкладку и не
 * всплывает через неделю при случайном входе.
 */
const KEY = 'vellin.pendingVideo';

export function rememberPendingVideo(url: string): void {
  try {
    sessionStorage.setItem(KEY, url);
  } catch {
    // Хранилище закрыто (приватный режим) — после входа человек просто
    // окажется в библиотеке и вставит ссылку там.
  }
}

export function peekPendingVideo(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function forgetPendingVideo(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Нечего забывать.
  }
}

/** Создать комнату с видео и вернуть её адрес. */
export async function createRoomWithVideo(url: URL): Promise<string> {
  const { room } = await roomsApi.create({
    name: roomNameFor(url),
    isPrivate: false,
    videoUrl: url.toString(),
  });
  return `/room/${room.slug}`;
}

/**
 * Куда вести после входа: в комнату с отложенной ссылкой, если она есть,
 * иначе в библиотеку. Ссылка забывается в любом случае — вторая попытка
 * создать ту же комнату при следующем входе была бы сюрпризом.
 */
export async function destinationAfterAuth(): Promise<string> {
  const pending = peekPendingVideo();
  forgetPendingVideo();
  if (!pending) return '/library';
  try {
    return await createRoomWithVideo(new URL(pending));
  } catch {
    return '/library';
  }
}
