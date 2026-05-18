import { HtmlVideoEngine } from './HtmlVideoEngine';

// Vite resolves this to the on-disk path at build time. The bundle itself is
// an ES module (it uses `export default`), so we have to load it with native
// dynamic import — a plain <script> tag would choke on the top-level `export`.
import webtorrentBundleUrl from 'webtorrent/dist/webtorrent.min.js?url';

let ctorPromise: Promise<new () => WebTorrentClient> | null = null;

function loadWebTorrentCtor(): Promise<new () => WebTorrentClient> {
  if (ctorPromise) return ctorPromise;
  // /* @vite-ignore */ tells Vite not to rewrite this dynamic import — we
  // want the URL string passed straight through to the browser so the prebuilt
  // bundle is fetched and evaluated as a module exactly once.
  ctorPromise = import(/* @vite-ignore */ webtorrentBundleUrl).then((mod) => {
    const exported = (mod as { default?: unknown }).default ?? mod;
    if (typeof exported !== 'function') {
      throw new Error('WebTorrent default export is not a constructor');
    }
    return exported as new () => WebTorrentClient;
  });
  return ctorPromise;
}

interface TorrentFile {
  name: string;
  length: number;
  streamTo(el: HTMLMediaElement): void;
  /** webtorrent's older API */
  renderTo?(el: HTMLMediaElement, opts: { autoplay?: boolean }): void;
}
interface TorrentInstance {
  files: TorrentFile[];
  numPeers: number;
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  destroy(cb?: (err?: Error) => void): void;
  on(
    event: 'ready' | 'download' | 'error' | 'wire' | 'warning' | 'metadata' | 'noPeers',
    cb: (...args: unknown[]) => void,
  ): void;
}
interface AddOptions {
  announce?: string[];
}
interface WebTorrentClient {
  add(
    magnetOrUrl: string,
    opts: AddOptions,
    cb: (torrent: TorrentInstance) => void,
  ): TorrentInstance;
  add(magnetOrUrl: string, cb: (torrent: TorrentInstance) => void): TorrentInstance;
  remove(torrentId: string | TorrentInstance, cb?: (err?: Error) => void): void;
  destroy(cb?: (err?: Error) => void): void;
  on(event: 'error' | 'warning', cb: (err: unknown) => void): void;
}

/**
 * Public WebRTC trackers that browser WebTorrent clients can actually reach.
 * UDP/HTTP trackers (the default for most magnets) are unreachable from a
 * browser tab, so we always announce against these as a safety net even if
 * the magnet specifies its own.
 */
const PUBLIC_WSS_TRACKERS = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.files.fm:7073/announce',
];

const METADATA_TIMEOUT_MS = 60_000;

/**
 * Append our PUBLIC_WSS_TRACKERS to a magnet URI when none of its existing
 * `tr=` entries is a WebSocket tracker. UDP-only magnets are useless to a
 * browser; this gives them at least a fighting chance via public webseeded
 * trackers.
 */
function enrichMagnet(magnet: string): string {
  if (!magnet.startsWith('magnet:')) return magnet;
  const hasWss = /[?&]tr=(?:wss%3A|wss:)/i.test(magnet);
  if (hasWss) return magnet;
  const extras = PUBLIC_WSS_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('');
  return magnet + extras;
}

const VIDEO_EXT_RE = /\.(mp4|webm|mkv|m4v|ogv|mov)$/i;

export interface TorrentStats {
  peers: number;
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
}

/**
 * WebTorrent engine. Streams a magnet/.torrent into the <video> element.
 *
 * Limitations:
 *  - Works only with WebRTC-tracked torrents (~5% of popular torrents).
 *  - Picks the largest video-typed file from the torrent and ignores the rest.
 *  - Stats are exposed via `getStats()` for the UI to poll.
 */
export class WebTorrentEngine extends HtmlVideoEngine {
  private client: WebTorrentClient | null = null;
  private torrent: TorrentInstance | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;

  override async load(url: string): Promise<void> {
    this.teardown();
    const Ctor = await loadWebTorrentCtor();
    this.client = new Ctor();
    this.beginRemoteUpdate();

    // Surface client-level diagnostics in the console so the operator can
    // tell apart "tracker unreachable", "peer connection failed", etc.
    this.client.on('error', (err) => console.error('[webtorrent client]', err));
    this.client.on('warning', (warn) => console.warn('[webtorrent client]', warn));

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const errTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.endRemoteUpdate();
        const peers = this.torrent?.numPeers ?? 0;
        this.emit('error', {
          kind: 'load_failed',
          message:
            peers > 0
              ? `Не удалось получить метаданные за ${METADATA_TIMEOUT_MS / 1000}с (peers: ${peers})`
              : 'WebRTC-пиры не найдены. Этот торрент не поддерживается в браузере — нужны wss://-трекеры или активный WebTorrent-сидер.',
        });
        reject(new Error('torrent metadata timeout'));
      }, METADATA_TIMEOUT_MS);

      const enriched = enrichMagnet(url);
      const opts: AddOptions = { announce: PUBLIC_WSS_TRACKERS };
      this.client!.add(enriched, opts, (torrent) => {
        if (settled) return;
        clearTimeout(errTimer);
        this.torrent = torrent;
        torrent.on('warning', (warn) => console.warn('[torrent]', warn));
        torrent.on('error', (err: unknown) => {
          console.error('[torrent error]', err);
          this.emit('error', {
            kind: 'load_failed',
            message: `Torrent: ${(err as Error).message ?? 'unknown'}`,
          });
        });

        const file =
          torrent.files
            .filter((f) => VIDEO_EXT_RE.test(f.name))
            .sort((a, b) => b.length - a.length)[0] ?? torrent.files[0];
        if (!file) {
          settled = true;
          this.endRemoteUpdate();
          this.emit('error', { kind: 'unsupported', message: 'No playable file in torrent' });
          reject(new Error('no playable file'));
          return;
        }
        // streamTo (webtorrent v2) is the modern API; renderTo is the v1 fallback.
        if (typeof file.streamTo === 'function') {
          file.streamTo(this.video);
        } else if (typeof file.renderTo === 'function') {
          file.renderTo(this.video, { autoplay: false });
        }
        this.startStatsLoop();
        settled = true;
        this.endRemoteUpdate();
        this.emit('ready');
        resolve();
      });
    });
  }

  override getQualityLevels(): string[] {
    return [];
  }
  override getCurrentQuality(): string {
    return 'auto';
  }
  override setQuality(_level: string): void {
    /* no quality variants in a torrent stream */
  }

  getStats(): TorrentStats | null {
    if (!this.torrent) return null;
    return {
      peers: this.torrent.numPeers,
      downloadSpeed: this.torrent.downloadSpeed,
      uploadSpeed: this.torrent.uploadSpeed,
      progress: this.torrent.progress,
    };
  }

  override destroy(): void {
    this.teardown();
    super.destroy();
  }

  private startStatsLoop(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = setInterval(() => {
      // No event — UI polls getStats() at its own cadence.
    }, 1000);
  }

  private teardown(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    if (this.torrent && this.client) {
      try {
        this.client.remove(this.torrent);
      } catch {
        /* ignore */
      }
      this.torrent = null;
    }
    if (this.client) {
      try {
        this.client.destroy();
      } catch {
        /* ignore */
      }
      this.client = null;
    }
  }
}
