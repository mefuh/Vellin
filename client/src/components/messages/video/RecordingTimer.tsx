/** Форматирование длительности записи MM:SS (без лимита — минуты растут). */
export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** RecordingTimer — красная точка + таймер записи (как в Telegram). */
export function RecordingTimer({ elapsedMs }: { elapsedMs: number }): React.ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          background: '#ff3b30',
          animation: 'dmRecDot 1.2s ease-in-out infinite',
        }}
      />
      <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.02em' }}>{formatDuration(elapsedMs)}</span>
    </span>
  );
}
