const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Достаёт videoId из любой формы YouTube-ссылки. null — не YouTube. */
export function extractYouTubeId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return id && ID_RE.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && ID_RE.test(v)) return v;
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m && ID_RE.test(m[1])) return m[1];
  }
  return null;
}
