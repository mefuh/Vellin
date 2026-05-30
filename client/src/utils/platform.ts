/**
 * Платформенные проверки для обхода известных багов WebKit/iOS в WebRTC.
 *
 * На iOS ВСЕ браузеры используют WebKit (Apple это требует), поэтому баги
 * Safari проявляются и в Chrome/Firefox на iPhone/iPad.
 */

let cachedIsIOS: boolean | null = null;

/**
 * iPhone/iPod/iPad, включая iPadOS 13+, который маскируется под Macintosh,
 * но имеет тач-события.
 */
export function isIOS(): boolean {
  if (cachedIsIOS !== null) return cachedIsIOS;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOSDevice = /iP(hone|od|ad)/.test(ua);
  const iPadOS =
    /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  cachedIsIOS = iOSDevice || iPadOS;
  return cachedIsIOS;
}
