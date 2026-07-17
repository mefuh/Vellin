import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsPoint } from '@vellin/shared';

/**
 * Тема графиков из CSS-переменных приложения. Пересчитывается при смене
 * data-theme на корне (светлая/тёмная), чтобы recharts-SVG красился в тон.
 */
function readColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    accent: v('--accent', '#d1271b'),
    accentHi: v('--accent-hi', '#e8462a'),
    ok: v('--ok', '#4ade80'),
    text2: v('--text-2', '#8a7f78'),
    text3: v('--text-3', '#5a504a'),
    line: v('--line-2', 'rgba(255,245,235,0.1)'),
    bg: v('--bg-2', '#14100e'),
    grid: v('--line-1', 'rgba(255,245,235,0.06)'),
  };
}

function useChartColors() {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(readColors()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
};

function TooltipBox({ colors, label, value, unit }: { colors: ReturnType<typeof readColors>; label: string; value: number; unit?: string }) {
  return (
    <div
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.line}`,
        borderRadius: 10,
        padding: '7px 11px',
        fontSize: 12,
        color: 'var(--text-0)',
        boxShadow: 'var(--shadow-2)',
      }}
    >
      <div style={{ color: colors.text2, fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
        {value}{unit ? ` ${unit}` : ''}
      </div>
    </div>
  );
}

/** Плавная область-тренд для временного ряда. */
export function AreaTrend({
  points,
  height = 220,
  accent = true,
  unit,
}: {
  points: AnalyticsPoint[];
  height?: number;
  accent?: boolean;
  unit?: string;
}) {
  const c = useChartColors();
  const color = accent ? c.accentHi : c.ok;
  const gradId = `grad-${accent ? 'a' : 'b'}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: c.text3, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis tick={{ fill: c.text3, fontSize: 11 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
        <Tooltip
          cursor={{ stroke: c.line }}
          content={({ active, payload, label }) =>
            active && payload && payload.length ? (
              <TooltipBox colors={c} label={String(label)} value={Number(payload[0]?.value ?? 0)} unit={unit} />
            ) : null
          }
        />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Компактный live-график для реального времени (CPU/память): область-тренд по
 * накопленным на клиенте отсчётам. Без оси X (точки идут во времени слева
 * направо), с минимальной осью Y и тултипом значения.
 */
export function LiveArea({
  points,
  color = 'accent',
  unit,
  yMax,
  height = 130,
}: {
  points: { value: number }[];
  color?: 'accent' | 'ok';
  unit?: string;
  yMax?: number;
  height?: number;
}) {
  const c = useChartColors();
  const stroke = color === 'ok' ? c.ok : c.accentHi;
  const gradId = `live-${color}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: -22 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={[0, yMax ?? 'auto']} tick={{ fill: c.text3, fontSize: 10 }} axisLine={false} tickLine={false} width={38} allowDecimals={false} />
        <Tooltip
          cursor={{ stroke: c.line }}
          content={({ active, payload }) =>
            active && payload && payload.length ? (
              <TooltipBox colors={c} label="" value={Number(payload[0]?.value ?? 0)} unit={unit} />
            ) : null
          }
        />
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill={`url(#${gradId})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Столбчатая диаграмма (например активность по часам). */
export function BarSeries({
  data,
  xKey,
  height = 200,
  xFormatter,
  unit,
}: {
  data: Array<Record<string, number>>;
  xKey: string;
  height?: number;
  xFormatter?: (v: number) => string;
  unit?: string;
}) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <XAxis
          dataKey={xKey}
          tick={{ fill: c.text3, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={xFormatter ? (v) => xFormatter(Number(v)) : undefined}
          interval={1}
        />
        <YAxis tick={{ fill: c.text3, fontSize: 11 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: c.grid }}
          content={({ active, payload, label }) =>
            active && payload && payload.length ? (
              <TooltipBox colors={c} label={xFormatter ? xFormatter(Number(label)) : String(label)} value={Number(payload[0]?.value ?? 0)} unit={unit} />
            ) : null
          }
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={c.accentHi} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
