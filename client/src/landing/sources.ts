/**
 * Источники видео, которые знает комната. Список для лэндинга: по нему бежит
 * лента под полем, и по нему же поле узнаёт вставленную ссылку.
 *
 * Порядок — порядок в ленте. Правило `match` проверяется по нормализованной
 * ссылке; первое совпадение выигрывает.
 */
export interface VideoSource {
  id: string;
  label: string;
  match: (url: URL | null, raw: string) => boolean;
}

const host = (url: URL | null, ...names: string[]) =>
  !!url && names.some((n) => url.hostname === n || url.hostname.endsWith(`.${n}`));

const ext = (url: URL | null, ...exts: string[]) =>
  !!url && exts.some((e) => url.pathname.toLowerCase().endsWith(`.${e}`));

export const VIDEO_SOURCES: VideoSource[] = [
  { id: 'youtube', label: 'YouTube', match: (u) => host(u, 'youtube.com', 'youtu.be') },
  { id: 'rutube', label: 'RuTube', match: (u) => host(u, 'rutube.ru') },
  { id: 'vk', label: 'VK Видео', match: (u) => host(u, 'vk.com', 'vkvideo.ru', 'vk.ru') },
  { id: 'vimeo', label: 'Vimeo', match: (u) => host(u, 'vimeo.com') },
  { id: 'mp4', label: 'MP4 и WebM', match: (u) => ext(u, 'mp4', 'webm', 'mov', 'mkv') },
  { id: 'hls', label: 'HLS', match: (u) => ext(u, 'm3u8') },
  { id: 'dash', label: 'DASH', match: (u) => ext(u, 'mpd') },
  { id: 'torrent', label: 'Торренты', match: (u, raw) => /^magnet:/i.test(raw) || ext(u, 'torrent') },
];

/** Разобрать ввод: пустое, ссылку, magnet или мусор. */
export function parseVideoInput(raw: string): {
  kind: 'empty' | 'link' | 'magnet' | 'invalid';
  url: URL | null;
  source: VideoSource | null;
} {
  const value = raw.trim();
  if (!value) return { kind: 'empty', url: null, source: null };
  if (/^magnet:\?/i.test(value)) {
    return { kind: 'magnet', url: null, source: VIDEO_SOURCES.find((s) => s.id === 'torrent') ?? null };
  }
  // Ссылку часто копируют без протокола — «youtube.com/watch?...».
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL | null = null;
  try {
    url = new URL(withProto);
  } catch {
    return { kind: 'invalid', url: null, source: null };
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) {
    return { kind: 'invalid', url: null, source: null };
  }
  return { kind: 'link', url, source: VIDEO_SOURCES.find((s) => s.match(url, value)) ?? null };
}

/** Название комнаты по ссылке: «Просмотр · youtube.com». */
export function roomNameFor(url: URL): string {
  return `Просмотр · ${url.hostname.replace(/^www\./, '')}`.slice(0, 80);
}
