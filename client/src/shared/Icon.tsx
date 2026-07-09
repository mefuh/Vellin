import type { CSSProperties, ReactNode } from 'react';

export type IconName =
  | 'play' | 'pause' | 'prev' | 'next' | 'skipBack' | 'skipFwd'
  | 'volume' | 'volumeOff' | 'fullscreen' | 'minimize' | 'chat'
  | 'send' | 'plus' | 'close' | 'search' | 'home' | 'compass'
  | 'library' | 'settings' | 'user' | 'users' | 'link' | 'lock'
  | 'globe' | 'bell' | 'smile' | 'upload' | 'download' | 'film'
  | 'sparkles' | 'crown' | 'heart' | 'heartFilled' | 'chevron' | 'chevronD' | 'eye'
  | 'mic' | 'micOff' | 'pin' | 'cast' | 'qr' | 'copy' | 'edit'
  | 'trash' | 'star' | 'arrow' | 'check' | 'sun' | 'moon' | 'image'
  | 'headphones' | 'speaker' | 'grid' | 'list' | 'filter' | 'sort'
  | 'arrowDown' | 'flame' | 'waveform' | 'refresh' | 'hash'
  | 'userMinus' | 'userPlus' | 'gripVertical'
  | 'video' | 'videoOff' | 'phone' | 'phoneOff' | 'logout'
  | 'cake' | 'mapPin' | 'cameraReverse';

interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
}

const PATHS: Record<IconName, ReactNode> = {
  play: <path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  prev: (
    <>
      <path d="M19 5L9 12l10 7V5z" fill="currentColor" stroke="none" />
      <rect x="5" y="5" width="2" height="14" fill="currentColor" stroke="none" />
    </>
  ),
  next: (
    <>
      <path d="M5 5l10 7-10 7V5z" fill="currentColor" stroke="none" />
      <rect x="17" y="5" width="2" height="14" fill="currentColor" stroke="none" />
    </>
  ),
  skipBack: <path d="M11 19l-7-7 7-7v14zM21 19l-7-7 7-7v14z" />,
  skipFwd: <path d="M13 5l7 7-7 7V5zM3 5l7 7-7 7V5z" />,
  volume: (
    <>
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M22 9l-6 6M16 9l6 6" />
    </>
  ),
  fullscreen: <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />,
  minimize: <path d="M8 4v4H4M16 4v4h4M8 20v-4H4M16 20v-4h4" />,
  chat: (
    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
  ),
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M18 6L6 18M6 6l12 12" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  home: <path d="M3 11l9-8 9 8v10a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2V11z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
    </>
  ),
  library: (
    <>
      <rect x="3" y="4" width="6" height="16" rx="1" />
      <rect x="11" y="4" width="6" height="16" rx="1" />
      <path d="M19 4l2 16" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.4 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.4-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.4-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.4H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.4 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0114 0M16 4a4 4 0 010 8M22 21a7 7 0 00-6-7" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1.5-1.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </>
  ),
  bell: (
    <>
      <path d="M18 16V11a6 6 0 10-12 0v5l-2 3h16l-2-3z" />
      <path d="M10 21a2 2 0 004 0" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 10h.01M16 10h.01M8 15a4 4 0 008 0" />
    </>
  ),
  upload: <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />,
  download: <path d="M12 4v12m0 0l4-4m-4 4l-4-4M4 20h16" />,
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 8h18M3 16h18M7 4v16M17 4v16" />
    </>
  ),
  sparkles: <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />,
  crown: <path d="M3 18l-1-10 6 4 4-7 4 7 6-4-1 10H3z" />,
  heart: <path d="M20.8 6.6a5.4 5.4 0 00-9.3-2.2 5.4 5.4 0 00-9.3 5.6c.5 1.2 1.4 2.3 2.4 3.2L12 21l7.4-7.8c1-.9 1.9-2 2.4-3.2.4-1.1.4-2.3 0-3.4z" />,
  heartFilled: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
    />
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  chevronD: <path d="M6 9l6 6 6-6" />,
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 19v3" />
    </>
  ),
  micOff: (
    <>
      <path d="M9 9v2a3 3 0 005.1 2.1M15 12V6a3 3 0 00-6 0" />
      <path d="M5 11a7 7 0 0010.4 6M19 11a7 7 0 01-.2 1.7M12 19v3M3 3l18 18" />
    </>
  ),
  pin: <path d="M12 2l3 6 6 1-4.5 4 1 6L12 16l-5.5 3 1-6L3 9l6-1 3-6z" />,
  cast: (
    <>
      <path d="M3 16a5 5 0 015 5M3 12a9 9 0 019 9M3 8a13 13 0 0113 13" />
      <rect x="2" y="4" width="20" height="14" rx="2" strokeOpacity=".4" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M20 14v3M14 20h3M20 17v4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </>
  ),
  edit: <path d="M16 3l5 5L8 21H3v-5L16 3z" />,
  trash: (
    <>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </>
  ),
  star: <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1L12 2z" />,
  arrow: <path d="M5 12h14M13 5l7 7-7 7" />,
  check: <path d="M5 12l5 5L20 7" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </>
  ),
  headphones: <path d="M3 18v-6a9 9 0 0118 0v6a2 2 0 01-2 2h-2v-7h4M3 13h4v7H5a2 2 0 01-2-2z" />,
  speaker: (
    <>
      <circle cx="12" cy="12" r="9" strokeOpacity=".25" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="6" r="1" fill="currentColor" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  filter: <path d="M3 4h18l-7 9v6l-4 2v-8L3 4z" />,
  sort: <path d="M3 6h13M3 12h9M3 18h5M17 4v16m0 0l4-4m-4 4l-4-4" />,
  arrowDown: <path d="M12 5v14M5 12l7 7 7-7" />,
  flame: <path d="M12 2s4 5 4 9a4 4 0 11-8 0c0-1 .5-2 1-3-3 1-5 4-5 7a8 8 0 0016 0c0-7-8-13-8-13z" />,
  waveform: <path d="M2 12h2l2-7 4 14 4-11 4 8 2-4h2" />,
  refresh: <path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" />,
  hash: <path d="M4 9h16M4 15h16M10 3l-4 18M18 3l-4 18" />,
  userMinus: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0114 0M16 11h6" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0114 0M19 8v6M16 11h6" />
    </>
  ),
  gripVertical: (
    <>
      <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </>
  ),
  videoOff: (
    <>
      <path d="M16 10l5-3v10l-5-3" />
      <path d="M3 6h10l3 3v9H6a3 3 0 01-3-3V6z" />
      <path d="M3 3l18 18" />
    </>
  ),
  phone: (
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z" />
  ),
  phoneOff: (
    // Same handset as `phone`, rotated 135° and scaled to ~82% around center
    // so the rotated bbox (~28 wide) fits back inside the 24-unit viewBox.
    // `non-scaling-stroke` keeps the outline at the same thickness as the
    // other icons in the row despite the inner scale.
    <g transform="translate(12 12) rotate(135) scale(0.82) translate(-12 -12)">
      <path
        vectorEffect="non-scaling-stroke"
        d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z"
      />
    </g>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  cake: (
    <>
      <path d="M4 21v-7a2 2 0 012-2h12a2 2 0 012 2v7" />
      <path d="M3 21h18" />
      <path d="M4 15c1.3 0 1.3 1.2 2.7 1.2S8 15 9.3 15s1.4 1.2 2.7 1.2S13.3 15 14.6 15s1.4 1.2 2.7 1.2S18.7 15 20 15" />
      <path d="M12 12V8" />
      <circle cx="12" cy="6" r="1.2" />
    </>
  ),
  mapPin: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  cameraReverse: (
    <>
      <path d="M3 8.5A1.5 1.5 0 014.5 7H7l1.3-1.9A1 1 0 019.1 5h5.8a1 1 0 01.8.4L17 7h2.5A1.5 1.5 0 0121 8.5v9A1.5 1.5 0 0119.5 19h-15A1.5 1.5 0 013 17.5v-9z" />
      <path d="M9.2 12.8a2.8 2.8 0 015.2-1.3" />
      <path d="M14.8 13.2a2.8 2.8 0 01-5.2 1.3" />
      <path d="M14.5 9.1l-.1 2.1 2.1.1" />
      <path d="M9.5 16.9l.1-2.1-2.1-.1" />
    </>
  ),
};

export function Icon({ name, size = 16, stroke = 1.6, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
