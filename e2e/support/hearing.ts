/**
 * Зонд «что слышит человек». Встраивается в страницу до её скриптов и ничего
 * не знает о приложении: смотрит только на медиаэлементы, которые сейчас
 * действительно играют звук — не на паузе, не заглушены, с громкостью выше
 * нуля и с живой звуковой дорожкой, — и измеряет уровень этого звука.
 *
 * Свой голос человек не слышит: элементы, которые его показывают, приложение
 * глушит, и зонд их пропускает так же, как пропустило бы ухо.
 */
export const HEARING_PROBE = `
(() => {
  if (window.__hearing) return;
  let ctx = null;
  const taps = new WeakMap();
  const ensure = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  const audible = () =>
    [...document.querySelectorAll('audio, video')].filter((el) => {
      const s = el.srcObject;
      return (
        s instanceof MediaStream &&
        !el.muted &&
        !el.paused &&
        el.volume > 0 &&
        s.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled)
      );
    });
  const level = () => {
    const c = ensure();
    const els = audible();
    let sum = 0;
    for (const el of els) {
      let tap = taps.get(el);
      if (!tap || tap.stream !== el.srcObject) {
        const src = c.createMediaStreamSource(el.srcObject);
        const an = c.createAnalyser();
        an.fftSize = 2048;
        src.connect(an);
        tap = { stream: el.srcObject, an, buf: new Float32Array(an.fftSize) };
        taps.set(el, tap);
      }
      tap.an.getFloatTimeDomainData(tap.buf);
      let s = 0;
      for (let i = 0; i < tap.buf.length; i++) s += tap.buf[i] * tap.buf[i];
      // Громкость элемента — часть того, что слышно.
      const rms = Math.sqrt(s / tap.buf.length) * el.volume;
      sum += rms * rms;
    }
    return { db: 20 * Math.log10(Math.sqrt(sum) + 1e-9), sources: els.length };
  };
  const record = async (ms, step = 100) => {
    const out = [];
    const end = performance.now() + ms;
    while (performance.now() < end) {
      out.push(level());
      await new Promise((r) => setTimeout(r, step));
    }
    return out;
  };
  // Что сейчас захвачено с устройств — то, о чём браузер сообщает значком
  // записи: живые дорожки микрофона, камеры и экрана, выданные странице.
  const captured = new Set();
  const md = navigator.mediaDevices;
  if (md) {
    for (const fn of ['getUserMedia', 'getDisplayMedia']) {
      const orig = md[fn] && md[fn].bind(md);
      if (!orig) continue;
      md[fn] = async (...args) => {
        const stream = await orig(...args);
        for (const t of stream.getTracks()) captured.add({ track: t, screen: fn === 'getDisplayMedia' });
        return stream;
      };
    }
  }
  const capturing = () => {
    const out = { microphone: 0, camera: 0, screen: 0 };
    for (const c of captured) {
      if (c.track.readyState !== 'live') { captured.delete(c); continue; }
      if (c.screen) out.screen++;
      else if (c.track.kind === 'audio') out.microphone++;
      else out.camera++;
    }
    return out;
  };
  // Сетевая сторона звонка: сколько пакетов голоса пришло от собеседника и
  // сколько отчётов о приёме нашего голоса он прислал (RTCP). Нужна там, где
  // по уровню звука судить нельзя — у собеседника настоящий микрофон, и он
  // может молчать.
  const pcs = [];
  const NativePC = window.RTCPeerConnection;
  if (NativePC) {
    window.RTCPeerConnection = new Proxy(NativePC, {
      construct(target, args) {
        const pc = new target(...args);
        pcs.push(pc);
        return pc;
      },
    });
  }
  const snapshot = async () => {
    const out = new Map();
    for (const pc of pcs) {
      if (pc.connectionState === 'closed') continue;
      let inbound = 0;
      let reports = 0;
      const stats = await pc.getStats();
      stats.forEach((s) => {
        if (s.kind !== 'audio') return;
        if (s.type === 'inbound-rtp') inbound += s.packetsReceived || 0;
        if (s.type === 'remote-inbound-rtp') reports += s.roundTripTimeMeasurements || 0;
      });
      out.set(pc, { inbound, reports });
    }
    return out;
  };
  // Сколько пришло за окно по соединениям, живым в его конце. Соединение,
  // созданное внутри окна (пересоздание после переподключения), считается
  // целиком: всё, что оно приняло, пришло в это окно.
  const rtcFlow = async (ms) => {
    const a = await snapshot();
    await new Promise((r) => setTimeout(r, ms));
    const b = await snapshot();
    let inbound = 0;
    let reports = 0;
    for (const [pc, v] of b) {
      const before = a.get(pc) ?? { inbound: 0, reports: 0 };
      inbound += Math.max(0, v.inbound - before.inbound);
      reports += Math.max(0, v.reports - before.reports);
    }
    return { inbound, reports };
  };
  // Сетевая картина для отчёта о провале: о чём договорились по звуку и
  // сколько пакетов прошло — по каждому живому соединению.
  const rtcReport = async () => {
    const out = [];
    for (const pc of pcs) {
      if (pc.connectionState === 'closed') continue;
      const dirs = pc
        .getTransceivers()
        .filter((t) => t.receiver.track.kind === 'audio')
        .map((t) => 'mid=' + t.mid + ' ' + t.currentDirection + (t.receiver.track.muted ? ' (приём молчит)' : ''))
        .join(', ');
      let rx = 0;
      let tx = 0;
      let pair = '';
      const st = await pc.getStats();
      st.forEach((s) => {
        if (s.type === 'transport' && s.selectedCandidatePairId) {
          const cp = st.get(s.selectedCandidatePairId);
          const lc = cp && st.get(cp.localCandidateId);
          const rc = cp && st.get(cp.remoteCandidateId);
          pair = ', путь ' + (lc ? lc.address + ':' + lc.port + '(' + lc.candidateType + ')' : '?') + ' -> ' + (rc ? rc.address + ':' + rc.port + '(' + rc.candidateType + ')' : '?') + ' принято байт ' + (cp ? cp.bytesReceived : '?');
        }
      });
      st.forEach((s) => {
        if (s.kind !== 'audio') return;
        if (s.type === 'inbound-rtp') rx += s.packetsReceived || 0;
        if (s.type === 'outbound-rtp') tx += s.packetsSent || 0;
      });
      out.push('соединение ' + pc.connectionState + '/' + pc.iceConnectionState + ', звук: ' + (dirs || 'нет линий') + ', принято ' + rx + ', отправлено ' + tx + pair);
    }
    return out.length ? out.join('; ') : 'живых соединений нет';
  };
  window.__hearing = { level, record, capturing, rtcFlow, rtcReport };
})();
`;

export interface Sample {
  db: number;
  sources: number;
}

/**
 * Порог речи. Синтезированная речь после всей обработки звонка доходит
 * громче −40 дБ, тишина канала — ниже −60. Граница между ними выбрана с
 * запасом в обе стороны, чтобы ни шум, ни приглушённый голос её не путали.
 */
export const SPEECH_DB = -50;

export interface HearingReport {
  samples: Sample[];
  /** Доля замеров, где слышна речь. */
  speechRatio: number;
  /** Самый длинный отрезок тишины, мс. */
  longestSilenceMs: number;
  /** Медианный уровень, дБ. */
  medianDb: number;
}

export function analyse(samples: Sample[], stepMs = 100): HearingReport {
  let speech = 0;
  let run = 0;
  let longest = 0;
  for (const s of samples) {
    if (s.db > SPEECH_DB) {
      speech++;
      run = 0;
    } else {
      run += stepMs;
      longest = Math.max(longest, run);
    }
  }
  const sorted = samples.map((s) => s.db).sort((a, b) => a - b);
  return {
    samples,
    speechRatio: samples.length ? speech / samples.length : 0,
    longestSilenceMs: longest,
    medianDb: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : -200,
  };
}

export function describe(r: HearingReport): string {
  return `речь ${(r.speechRatio * 100).toFixed(0)}% замеров, медиана ${r.medianDb.toFixed(1)} дБ, самая длинная тишина ${r.longestSilenceMs} мс`;
}
