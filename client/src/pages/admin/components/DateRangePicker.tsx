import type { AnalyticsRange } from '@vellin/shared';

const OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
];

/** Сегментированный pill-переключатель временного диапазона (стекло). */
export function DateRangePicker({ value, onChange }: { value: AnalyticsRange; onChange: (r: AnalyticsRange) => void }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        borderRadius: 999,
        background: 'var(--bg-2)',
        boxShadow: 'inset 0 0 0 1px var(--line-1)',
      }}
    >
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              background: active ? 'var(--bg-4)' : 'transparent',
              color: active ? 'var(--text-0)' : 'var(--text-2)',
              boxShadow: active ? 'inset 0 0 0 1px var(--line-2)' : 'none',
              transition: 'background .14s, color .14s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
