import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

/**
 * «Голоса» людей в тестах — то, что звучит в их микрофонах.
 *
 * Chrome подставляет WAV-файл вместо микрофона и крутит его по кругу. Голоса
 * у двоих разные: синтезатор речи Windows (русский и английский дикторы), а
 * где его нет — синтетическая «речь»: гармонический звук со своей высотой и
 * слоговой огибающей. Чистый тон не годится: шумоподавление вправе вырезать
 * его как фон, и тест проверял бы не то, что слышит человек.
 */

const PHRASE_A =
  'Привет! Слышишь меня? Я рассказываю, как прошёл день: утром была прогулка, ' +
  'потом работа, а вечером мы собирались посмотреть фильм вместе. ' +
  'Расскажи, как у тебя дела, и что ты думаешь про субботу. ';

const PHRASE_B =
  'Hello there, can you hear me well? I am telling you about my weekend, ' +
  'we went to the lake, cooked dinner together and talked until late at night. ' +
  'Let me know what time works for the movie tomorrow. ';

function sapiAvailable(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Speech'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function sapiSpeak(text: string, culture: string, out: string): boolean {
  // Текст повторяется, чтобы файл был длиннее и пауза перехода по кругу
  // случалась реже. Темп чуть выше обычного — меньше пауз между словами.
  const script = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq '${culture}' } | Select-Object -First 1
if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
$s.Rate = 2
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile('${out.replace(/'/g, "''")}', $fmt)
$s.Speak('${(text.repeat(3)).replace(/'/g, "''")}')
$s.Dispose()
`;
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
    return existsSync(out);
  } catch {
    return false;
  }
}

/** Синтетическая речь: основной тон с вибрато, обертоны и слоги ~4 Гц. */
function synthVoice(out: string, f0: number, seconds = 30): void {
  const rate = 48000;
  const n = rate * seconds;
  const data = Buffer.alloc(44 + n * 2);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const f = f0 * (1 + 0.04 * Math.sin(2 * Math.PI * 5.3 * t));
    phase += (2 * Math.PI * f) / rate;
    let s = 0;
    for (let h = 1; h <= 8; h++) s += Math.sin(phase * h) / h;
    // Слоговая огибающая: звук идёт непрерывно, но «дышит», как речь.
    const env = 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * 4 * t));
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * env * 0.35)) * 32767), 44 + i * 2);
  }
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 2, 40);
  writeFileSync(out, data);
}

export function prepareVoices(a: string, b: string): string {
  if (sapiAvailable() && sapiSpeak(PHRASE_A, 'ru-RU', a) && sapiSpeak(PHRASE_B, 'en-US', b)) {
    return 'синтезатор речи Windows';
  }
  synthVoice(a, 140);
  synthVoice(b, 220);
  return 'синтетическая речь';
}
