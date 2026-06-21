/**
 * Считает амплитудную волну (для отрисовки в плеере) и длительность записанного
 * голосового. Декодируем blob через WebAudio один раз при записи — потом плеер
 * рисует столбики из готового массива чисел, не трогая аудио на воспроизведении.
 */

/** Сколько столбиков волны генерируем (совпадает с лимитом на сервере ≤64). */
export const VOICE_BARS = 48;

interface VoiceMeta {
  peaks: number[];
  durationSec: number;
}

type AudioCtor = typeof AudioContext;

function getAudioContext(): AudioContext | null {
  const Ctor =
    (window.AudioContext as AudioCtor | undefined) ??
    ((window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext as AudioCtor | undefined);
  return Ctor ? new Ctor() : null;
}

/**
 * Декодирует аудио-blob и возвращает нормализованную волну (целые 0..100) и
 * длительность. На ошибке декодирования возвращает плоскую волну и переданную
 * «измеренную» длительность (фоллбэк, чтобы UI не падал).
 */
export async function computeVoiceMeta(blob: Blob, fallbackDurationSec: number): Promise<VoiceMeta> {
  const ctx = getAudioContext();
  if (!ctx) return { peaks: flatPeaks(), durationSec: fallbackDurationSec };
  try {
    const arrayBuf = await blob.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    const durationSec = Number.isFinite(audioBuf.duration) && audioBuf.duration > 0 ? audioBuf.duration : fallbackDurationSec;
    const channel = audioBuf.getChannelData(0);
    const block = Math.max(1, Math.floor(channel.length / VOICE_BARS));
    const raw: number[] = [];
    let max = 0;
    for (let i = 0; i < VOICE_BARS; i++) {
      const start = i * block;
      let sum = 0;
      for (let j = 0; j < block; j++) {
        const v = channel[start + j] ?? 0;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / block);
      raw.push(rms);
      if (rms > max) max = rms;
    }
    // Нормируем к 0..100 с мягкой гаммой — тихая речь тоже видна столбиками.
    const peaks = raw.map((p) => {
      const n = max > 0 ? p / max : 0;
      return Math.round(Math.min(1, Math.pow(n, 0.85)) * 100);
    });
    return { peaks, durationSec };
  } catch {
    return { peaks: flatPeaks(), durationSec: fallbackDurationSec };
  } finally {
    void ctx.close();
  }
}

/** Плоская «заглушка» волны, если декодировать не удалось. */
function flatPeaks(): number[] {
  return Array.from({ length: VOICE_BARS }, () => 32);
}
