// Vellin — иконки, утилиты и общие визуальные блоки

const Icon = ({ name, size = 16, stroke = 1.6 }) => {
  const paths = {
    play: <path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none"/>,
    pause: <><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/></>,
    prev: <><path d="M19 5L9 12l10 7V5z" fill="currentColor" stroke="none"/><rect x="5" y="5" width="2" height="14" fill="currentColor" stroke="none"/></>,
    next: <><path d="M5 5l10 7-10 7V5z" fill="currentColor" stroke="none"/><rect x="17" y="5" width="2" height="14" fill="currentColor" stroke="none"/></>,
    skipBack: <path d="M11 19l-7-7 7-7v14zM21 19l-7-7 7-7v14z"/>,
    skipFwd: <path d="M13 5l7 7-7 7V5zM3 5l7 7-7 7V5z"/>,
    volume: <><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14"/></>,
    volumeOff: <><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></>,
    fullscreen: <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>,
    minimize: <path d="M8 4v4H4M16 4v4h4M8 20v-4H4M16 20v-4h4"/>,
    chat: <path d="M21 12a8 8 0 11-3.2-6.4L21 4l-1.4 3.5A7.96 7.96 0 0121 12z"/>,
    send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    close: <path d="M18 6L6 18M6 6l12 12"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    home: <path d="M3 11l9-8 9 8v10a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2V11z"/>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z"/></>,
    library: <><rect x="3" y="4" width="6" height="16" rx="1"/><rect x="11" y="4" width="6" height="16" rx="1"/><path d="M19 4l2 16"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.4 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.4-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.4-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.4H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.4 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></>,
    users: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0114 0M16 4a4 4 0 010 8M22 21a7 7 0 00-6-7"/></>,
    link: <><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1.5-1.5"/></>,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></>,
    bell: <><path d="M18 16V11a6 6 0 10-12 0v5l-2 3h16l-2-3z"/><path d="M10 21a2 2 0 004 0"/></>,
    smile: <><circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 15a4 4 0 008 0"/></>,
    upload: <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"/>,
    download: <path d="M12 4v12m0 0l4-4m-4 4l-4-4M4 20h16"/>,
    film: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M3 16h18M7 4v16M17 4v16"/></>,
    sparkles: <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z"/>,
    crown: <path d="M3 18l-1-10 6 4 4-7 4 7 6-4-1 10H3z"/>,
    heart: <path d="M20.8 6.6a5.4 5.4 0 00-9.3-2.2 5.4 5.4 0 00-9.3 5.6c.5 1.2 1.4 2.3 2.4 3.2L12 21l7.4-7.8c1-.9 1.9-2 2.4-3.2.4-1.1.4-2.3 0-3.4z"/>,
    chevron: <path d="M9 6l6 6-6 6"/>,
    chevronD: <path d="M6 9l6 6 6-6"/>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 19v3"/></>,
    micOff: <><path d="M9 9v2a3 3 0 005.1 2.1M15 12V6a3 3 0 00-6 0"/><path d="M5 11a7 7 0 0010.4 6M19 11a7 7 0 01-.2 1.7M12 19v3M3 3l18 18"/></>,
    pin: <path d="M12 2l3 6 6 1-4.5 4 1 6L12 16l-5.5 3 1-6L3 9l6-1 3-6z"/>,
    cast: <><path d="M3 16a5 5 0 015 5M3 12a9 9 0 019 9M3 8a13 13 0 0113 13"/><rect x="2" y="4" width="20" height="14" rx="2" strokeOpacity=".4"/></>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 14v3M14 20h3M20 17v4"/></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></>,
    edit: <path d="M16 3l5 5L8 21H3v-5L16 3z"/>,
    trash: <><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></>,
    star: <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1L12 2z"/>,
    arrow: <path d="M5 12h14M13 5l7 7-7 7"/>,
    check: <path d="M5 12l5 5L20 7"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></>,
    moon: <path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></>,
    headphones: <path d="M3 18v-6a9 9 0 0118 0v6a2 2 0 01-2 2h-2v-7h4M3 13h4v7H5a2 2 0 01-2-2z"/>,
    speaker: <><circle cx="12" cy="12" r="9" strokeOpacity=".25"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="6" r="1" fill="currentColor"/></>,
    grid: <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></>,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>,
    filter: <path d="M3 4h18l-7 9v6l-4 2v-8L3 4z"/>,
    sort: <path d="M3 6h13M3 12h9M3 18h5M17 4v16m0 0l4-4m-4 4l-4-4"/>,
    arrowDown: <path d="M12 5v14M5 12l7 7 7-7"/>,
    flame: <path d="M12 2s4 5 4 9a4 4 0 11-8 0c0-1 .5-2 1-3-3 1-5 4-5 7a8 8 0 0016 0c0-7-8-13-8-13z"/>,
    waveform: <path d="M2 12h2l2-7 4 14 4-11 4 8 2-4h2"/>,
    refresh: <path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/>,
    hash: <path d="M4 9h16M4 15h16M10 3l-4 18M18 3l-4 18"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {paths[name] || null}
    </svg>
  );
};

// ─── Логотип Vellin ──────────────────────────────────────────
const VellinMark = ({ size = 22, color = 'var(--accent)' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="8" fill={color}/>
    <path d="M9 10l5 12h4l5-12h-3.5l-3.5 9-3.5-9H9z" fill="#fff"/>
  </svg>
);

const VellinLogo = ({ size = 22, tone = 'var(--text-0)', accent = 'var(--accent)' }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
    <VellinMark size={size} color={accent}/>
    <span style={{ fontSize: size * 0.85, fontWeight: 600, letterSpacing: '-0.02em', color: tone }}>Vellin</span>
  </div>
);

// ─── Аватарка (инициалы + детерминированный цвет) ────────────
const AVATAR_COLORS = [
  ['#d1271b', '#7a1610'], ['#c4632a', '#7a3812'], ['#a0612a', '#5e3814'],
  ['#9c5c8a', '#5a2d52'], ['#3a6b8a', '#1d3a4e'], ['#5a7a3e', '#2e421f'],
  ['#7a5a3e', '#4a3520'], ['#8a4a4a', '#4e2828'],
];
const Avatar = ({ name, size = 32, status, ring }) => {
  const initials = (name || '?').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
  const hash = [...(name||'?')].reduce((a,c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  const [c1, c2] = AVATAR_COLORS[hash];
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 600, fontSize: size * 0.38,
        letterSpacing: '-0.02em',
        boxShadow: ring ? `0 0 0 2px var(--bg-1), 0 0 0 ${2 + (ring === 'accent' ? 2 : 1)}px ${ring === 'accent' ? 'var(--accent)' : 'var(--ok)'}` : 'inset 0 1px 0 rgba(255,255,255,0.15)',
      }}>{initials}</div>
      {status && (
        <span style={{
          position: 'absolute', right: -1, bottom: -1,
          width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28),
          borderRadius: '50%',
          background: status === 'online' ? '#3fb950' : status === 'watching' ? 'var(--accent)' : status === 'idle' ? '#facc15' : '#5a504a',
          boxShadow: '0 0 0 2px var(--bg-1)',
        }}/>
      )}
    </div>
  );
};

// ─── Постер с горным пейзажем (SVG, не AI-слоп) ─────────────
// Кинематографичный плейсхолдер: слоистые силуэты гор + градиент
const MountainPoster = ({ width = '100%', height = '100%', seed = 0, label, time }) => {
  const palettes = [
    ['#3a2418', '#6b3a24', '#c4632a', '#e89456'],     // закат
    ['#0c1620', '#1a3450', '#3a6b8a', '#a8c5d8'],     // рассвет холодный
    ['#1a1410', '#3a2820', '#7a4a30', '#d18a5a'],     // тёплый
    ['#0a1a18', '#1c3a36', '#4a8076', '#a0c0b8'],     // мглистый
    ['#1a0a14', '#4a1a2e', '#8a3a52', '#d47280'],     // багровый
    ['#181820', '#2a2a3a', '#5a5a7a', '#a0a0c0'],     // ночь
  ];
  const p = palettes[seed % palettes.length];
  const id = 'mp' + seed;
  return (
    <svg viewBox="0 0 400 240" width={width} height={height} preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id+'sky'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p[0]}/>
          <stop offset="0.55" stopColor={p[1]}/>
          <stop offset="1" stopColor={p[2]}/>
        </linearGradient>
        <radialGradient id={id+'sun'} cx="0.72" cy="0.42" r="0.18">
          <stop offset="0" stopColor={p[3]} stopOpacity="0.9"/>
          <stop offset="1" stopColor={p[3]} stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={id+'haze'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p[1]} stopOpacity="0"/>
          <stop offset="1" stopColor={p[0]} stopOpacity="0.6"/>
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#${id}sky)`}/>
      <rect width="400" height="240" fill={`url(#${id}sun)`}/>
      <circle cx="288" cy="100" r="18" fill={p[3]} opacity="0.85"/>
      {/* дальние горы */}
      <path d={`M0 150 L40 130 L80 145 L130 115 L180 140 L230 110 L280 135 L330 120 L400 140 L400 240 L0 240Z`} fill={p[1]} opacity="0.85"/>
      <path d={`M0 170 L60 150 L110 165 L160 135 L220 165 L270 145 L340 170 L400 155 L400 240 L0 240Z`} fill={p[0]} opacity="0.95"/>
      <rect width="400" height="240" fill={`url(#${id}haze)`}/>
      {/* передний план */}
      <path d={`M0 200 L40 185 L90 195 L150 175 L210 190 L270 180 L340 195 L400 185 L400 240 L0 240Z`} fill="#000" opacity="0.7"/>
      <path d={`M0 220 L100 210 L200 218 L300 208 L400 220 L400 240 L0 240Z`} fill="#000" opacity="0.85"/>
      {label && (
        <text x="20" y="222" fill="#fff" opacity="0.85" fontSize="11" fontFamily="ui-monospace, monospace" letterSpacing="0.05em">{label}</text>
      )}
      {time && (
        <text x="380" y="222" fill="#fff" opacity="0.65" fontSize="11" fontFamily="ui-monospace, monospace" textAnchor="end">{time}</text>
      )}
    </svg>
  );
};

// ─── Полосатый плейсхолдер ──────────────────────────────────
const StripedPlaceholder = ({ children, height = 200, dark = true }) => (
  <div style={{
    height, borderRadius: 'var(--r-md)',
    background: dark
      ? 'repeating-linear-gradient(135deg, rgba(255,245,235,0.04) 0 10px, rgba(255,245,235,0.02) 10px 20px), var(--bg-3)'
      : 'repeating-linear-gradient(135deg, rgba(0,0,0,0.06) 0 10px, rgba(0,0,0,0.02) 10px 20px), var(--bg-2)',
    border: '1px dashed var(--line-2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 12,
    letterSpacing: '0.04em', textTransform: 'uppercase',
  }}>{children}</div>
);

// ─── Внешний фрейм (рамка приложения с traffic lights) ──────
const AppFrame = ({ children, width, height, title, dark = true }) => (
  <div style={{
    width, height,
    background: dark ? 'var(--bg-0)' : 'var(--bg-2)',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: 'var(--shadow-3)',
    border: '1px solid var(--line-1)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font-ui)', color: 'var(--text-0)',
  }} className="vellin">
    {title !== false && (
      <div style={{
        height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
        background: 'var(--bg-1)', borderBottom: '1px solid var(--line-1)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#e85c4a' }}/>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#e8b94a' }}/>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#5fc26f' }}/>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>
          {title || 'vellin.app'}
        </div>
        <div style={{ width: 50 }}/>
      </div>
    )}
    <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      {children}
    </div>
  </div>
);

// ─── Базовая кнопка ─────────────────────────────────────────
const Button = ({ children, variant = 'primary', size = 'md', icon, iconRight, full, onClick, style }) => {
  const sizes = {
    sm: { h: 30, px: 12, fs: 13, gap: 6, iconSize: 14 },
    md: { h: 38, px: 16, fs: 14, gap: 8, iconSize: 16 },
    lg: { h: 46, px: 20, fs: 15, gap: 10, iconSize: 18 },
  };
  const s = sizes[size];
  const variants = {
    primary: {
      background: 'var(--accent)', color: '#fff',
      boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 6px 20px var(--accent-glow)',
    },
    secondary: {
      background: 'var(--bg-3)', color: 'var(--text-0)',
      boxShadow: 'inset 0 0 0 1px var(--line-2)',
    },
    ghost: {
      background: 'transparent', color: 'var(--text-1)',
    },
    glass: {
      background: 'var(--glass-bg)', color: 'var(--text-0)',
      backdropFilter: 'blur(var(--glass-blur))',
      boxShadow: 'inset 0 0 0 1px var(--glass-bd)',
    },
    danger: {
      background: 'rgba(209, 39, 27, 0.12)', color: 'var(--accent-hi)',
      boxShadow: 'inset 0 0 0 1px rgba(209, 39, 27, 0.3)',
    },
  };
  return (
    <button onClick={onClick} style={{
      height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs, gap: s.gap,
      borderRadius: 'var(--r-md)', border: 'none',
      fontFamily: 'inherit', fontWeight: 500, letterSpacing: '-0.01em',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', whiteSpace: 'nowrap',
      width: full ? '100%' : 'auto',
      transition: 'transform .12s, filter .12s',
      ...variants[variant],
      ...style,
    }}>
      {icon && <Icon name={icon} size={s.iconSize}/>}
      {children}
      {iconRight && <Icon name={iconRight} size={s.iconSize}/>}
    </button>
  );
};

// ─── Бэйдж / чип ────────────────────────────────────────────
const Chip = ({ children, tone = 'neutral', icon, style }) => {
  const tones = {
    neutral: { bg: 'var(--bg-3)', fg: 'var(--text-1)', bd: 'var(--line-2)' },
    accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-hi)', bd: 'rgba(209,39,27,0.2)' },
    success: { bg: 'rgba(74,222,128,0.1)', fg: 'var(--ok)', bd: 'rgba(74,222,128,0.2)' },
    live: { bg: 'rgba(209,39,27,0.18)', fg: '#fff', bd: 'rgba(209,39,27,0.3)' },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 500, letterSpacing: '0.01em',
      background: t.bg, color: t.fg,
      boxShadow: `inset 0 0 0 1px ${t.bd}`,
      ...style,
    }}>
      {tone === 'live' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', boxShadow: '0 0 6px #fff' }}/>}
      {icon && <Icon name={icon} size={11}/>}
      {children}
    </span>
  );
};

Object.assign(window, { Icon, VellinMark, VellinLogo, Avatar, MountainPoster, StripedPlaceholder, AppFrame, Button, Chip });
