'use client';

import { useState } from 'react';
import type { ChartType, ChartConfig } from '@/types';
import { buildChartData, buildKPIValue } from '@/lib/chartData';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LabelList, ResponsiveContainer,
} from 'recharts';

const DEFAULT_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#06b6d4',
];

// Trend line colors — slightly muted versions of series colors
const TREND_COLORS = [
  '#a5b4fc', '#86efac', '#fcd34d', '#fca5a5', '#93c5fd',
  '#c4b5fd', '#5eead4', '#fdba74', '#f9a8d4', '#67e8f9',
];

interface ChartRendererProps {
  chartType: ChartType;
  config: ChartConfig;
  rows: Record<string, unknown>[];
  height?: number;
  forExport?: boolean;
}

const BarLabel = ({ x, y, width, value }: { x?: number; y?: number; width?: number; value?: number }) => {
  if (!value || value === 0) return null;
  return (
    <text
      x={(x ?? 0) + (width ?? 0) / 2}
      y={(y ?? 0) - 4}
      fill="#64748b"
      textAnchor="middle"
      fontSize={10}
      fontWeight={500}
    >
      {Number(value).toLocaleString()}
    </text>
  );
};

const fmtNumber = (v: unknown) =>
  typeof v === 'number' ? v.toLocaleString() : String(v ?? '');

export default function ChartRenderer({ chartType, config, rows, height = 320, forExport = false }: ChartRendererProps) {
  const { data, keys } = buildChartData(rows, config);
  const { xAxis, showLegend = true, showGrid = true, colors = DEFAULT_COLORS, showTrend = false } = config;
  const showLabels = forExport ? true : (config.showLabels ?? false);

  // Display name for a series key — falls back to the raw key
  const label = (key: string) => config.seriesLabels?.[key] ?? key;

  // Hidden series/slices — clicking legend items toggles them
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggleHidden(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const getColor = (i: number) => colors[i] ?? colors[i % DEFAULT_COLORS.length] ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];
  const getTrendColor = (i: number) =>
    config.trendColors?.[i] ?? TREND_COLORS[i % TREND_COLORS.length];

  // Trend keys are prefixed with __trend
  const trendKeys = showTrend ? keys.map((k) => `${k}__trend`) : [];

  // Pie/donut slice names for legend (derived from data)
  const pieSliceNames = (chartType === 'pie' || chartType === 'donut') && xAxis
    ? data.map((d) => String(d[xAxis] ?? ''))
    : [];

  // Shared interactive legend renderer
  function renderLegend(items: { key: string; displayName?: string; color: string }[]) {
    return (
      <ul className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs" style={{ paddingTop: 8 }}>
        {items.map(({ key, displayName, color }) => {
          const isHidden = hidden.has(key);
          const name = displayName ?? key;
          return (
            <li
              key={key}
              onClick={() => toggleHidden(key)}
              className="flex items-center gap-1.5 cursor-pointer select-none"
              title={isHidden ? `Show "${name}"` : `Hide "${name}"`}
              style={{ opacity: isHidden ? 0.35 : 1, transition: 'opacity 0.15s' }}
            >
              <span style={{
                display: 'inline-block', width: 12, height: 3,
                backgroundColor: color, borderRadius: 2,
              }} />
              <span style={{
                color: '#6b7280',
                textDecoration: isHidden ? 'line-through' : 'none',
              }}>{name}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  // Legend content for cartesian charts (bar, line, area, stacked_bar)
  const cartesianLegend = showLegend ? (
    <Legend
      wrapperStyle={{ fontSize: 12 }}
      content={({ payload }) => {
        if (!payload?.length) return null;
        // payload[i].dataKey = raw series key; payload[i].value = name prop we set
        const visible = payload.filter((p) => !String(p.dataKey ?? '').endsWith('__trend'));
        if (!visible.length) return null;
        return renderLegend(
          visible.map((p) => ({
            key: String(p.dataKey ?? p.value),   // use dataKey for toggle
            displayName: String(p.value),          // use name prop (already resolved label)
            color: String(p.color ?? '#6366f1'),
          }))
        );
      }}
    />
  ) : null;

  const commonAxis = (
    <>
      {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />}
      <XAxis dataKey={xAxis} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={60}
        tickFormatter={(v) => fmtNumber(v)} />
      <Tooltip
        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
        cursor={{ fill: '#f8fafc' }}
        formatter={(value, name) => {
          const nameStr = String(name ?? '');
          if (nameStr.endsWith('__trend')) return [null, null];
          return [fmtNumber(value), nameStr];
        }}
      />
      {cartesianLegend}
    </>
  );

  if (chartType === 'kpi') {
    const value = buildKPIValue(rows, config);
    const formatted = typeof value === 'number'
      ? (config.kpiPrefix ?? '') + value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + (config.kpiSuffix ?? '')
      : value;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 py-6">
        <p className="text-4xl font-bold text-gray-900">{formatted}</p>
        <p className="text-sm text-gray-400">{config.kpiColumn ?? 'Total rows'}</p>
      </div>
    );
  }

  if (chartType === 'gauge') {
    const rawVal = buildKPIValue(rows, {
      kpiColumn: config.gaugeColumn,
      kpiAggregation: config.gaugeAggregation ?? 'sum',
    });
    const value = typeof rawVal === 'number' ? rawVal : 0;
    const min   = config.gaugeMin ?? 0;
    const max   = config.gaugeMax ?? 100;
    const pct   = Math.min(1, Math.max(0, (value - min) / (max - min)));

    // Color from thresholds
    const sorted = [...(config.gaugeThresholds ?? [])].sort((a, b) => a.value - b.value);
    let arcColor = config.colors?.[0] ?? '#6366f1';
    for (const t of sorted) { if (value >= t.value) arcColor = t.color; }

    // ── Stroke-dasharray on a <path> half-circle ──────────────────────────
    // We draw a single open half-circle arc (no fill) as a thick stroked path.
    // The arc goes LEFT → RIGHT clockwise through the top (sweep=1, large-arc=0).
    // Half-circumference = π * R. dasharray = [filled_length, rest].
    //
    // The track is the same path stroked in gray.
    // The value arc is the same path stroked in color with dasharray clipping.

    const W = 300, H = 180;
    const cx = W / 2;
    const cy = H - 30;      // pivot near bottom
    const R  = 105;         // arc radius (center of stroke)
    const SW = 24;          // stroke width = arc thickness

    const halfCircum = Math.PI * R;  // length of the half-circle arc

    // The arc path: left point → right point, clockwise through top
    const arcPath = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;

    // Value dash: filled portion = pct * halfCircum, gap = rest
    const dashFilled = pct * halfCircum;
    const dashGap    = halfCircum - dashFilled;

    // Needle angle: pct=0 → left (180°), pct=1 → right (0°)
    // Math angle θ: pct=0 → π, pct=1 → 0
    const needleTheta = Math.PI * (1 - pct);
    const needleLen   = R - SW / 2 - 4;
    const ndx = cx + needleLen * Math.cos(needleTheta);
    const ndy = cy - needleLen * Math.sin(needleTheta);

    const formatted = (config.gaugePrefix ?? '') +
      value.toLocaleString(undefined, { maximumFractionDigits: 2 }) +
      (config.gaugeSuffix ?? '');

    return (
      <div className="flex flex-col items-center justify-center h-full">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: height - 30 }}>
          {/* Track arc — gray background */}
          <path
            d={arcPath}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={SW}
            strokeLinecap="butt"
          />

          {/* Value arc — colored, clipped with dasharray */}
          {pct > 0 && (
            <path
              d={arcPath}
              fill="none"
              stroke={arcColor}
              strokeWidth={SW}
              strokeLinecap="butt"
              strokeDasharray={`${dashFilled} ${dashGap + 1}`}
            />
          )}

          {/* Threshold ticks */}
          {sorted.map((t, i) => {
            const tp  = Math.min(1, Math.max(0, (t.value - min) / (max - min)));
            const ta  = Math.PI * (1 - tp);
            const rIn  = R - SW / 2 - 2;
            const rOut = R + SW / 2 + 2;
            const tx1 = cx + rIn  * Math.cos(ta), ty1 = cy - rIn  * Math.sin(ta);
            const tx2 = cx + rOut * Math.cos(ta), ty2 = cy - rOut * Math.sin(ta);
            return <line key={i} x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#fff" strokeWidth={2.5} />;
          })}

          {/* Needle */}
          <line x1={cx} y1={cy} x2={ndx} y2={ndy} stroke="#374151" strokeWidth={3} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={9} fill="#374151" />
          <circle cx={cx} cy={cy} r={4} fill="#f9fafb" />

          {/* Min / Max labels */}
          <text x={cx - R - SW / 2 - 6} y={cy + 4} fontSize={11} fill="#94a3b8" textAnchor="end">{min.toLocaleString()}</text>
          <text x={cx + R + SW / 2 + 6} y={cy + 4} fontSize={11} fill="#94a3b8" textAnchor="start">{max.toLocaleString()}</text>

          {/* Value + label */}
          <text x={cx} y={cy + 28} fontSize={22} fontWeight="bold" fill={arcColor} textAnchor="middle">{formatted}</text>
          <text x={cx} y={cy + 44} fontSize={10} fill="#9ca3af" textAnchor="middle">{config.gaugeColumn ?? 'Value'}</text>
        </svg>
      </div>
    );
  }

  if (chartType === 'table') {
    const cols = (config.tableColumns ?? Object.keys(data[0] ?? {})).slice(0, 10);
    return (
      <div className="overflow-auto h-full">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>{cols.map((c) => <th key={c} className="px-3 py-2 text-left font-medium text-gray-600">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.slice(0, config.pageSize ?? 50).map((row, i) => (
              <tr key={i} className={i % 2 ? 'bg-gray-50/40' : ''}>
                {cols.map((c) => <td key={c} className="px-3 py-1.5 text-gray-700 truncate max-w-[160px]">{String(row[c] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      {chartType === 'bar' ? (
        <BarChart data={data} margin={{ top: showLabels ? 20 : 8, right: 8, bottom: 8, left: 8 }}>
          {commonAxis}
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              name={label(k)}
              fill={getColor(i)}
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              hide={hidden.has(k)}
              isAnimationActive={!forExport}
            >
              {showLabels && <LabelList content={<BarLabel />} />}
            </Bar>
          ))}
          {showTrend && trendKeys.map((tk, i) => (
            <Line
              key={tk}
              type="linear"
              dataKey={tk}
              stroke={getTrendColor(i)}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              legendType="none"
              hide={hidden.has(keys[i])}
              isAnimationActive={!forExport}
            />
          ))}
        </BarChart>
      ) : chartType === 'stacked_bar' ? (
        <BarChart data={data} margin={{ top: showLabels ? 20 : 8, right: 8, bottom: 8, left: 8 }}>
          {commonAxis}
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} name={label(k)} stackId="s" fill={getColor(i)} hide={hidden.has(k)} isAnimationActive={!forExport}>
              {showLabels && (
                <LabelList
                  dataKey={k}
                  position="inside"
                  style={{ fontSize: 10, fill: '#fff', fontWeight: 600 }}
                  formatter={(v: unknown) => (Number(v) > 0 ? Number(v).toLocaleString() : '')}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      ) : chartType === 'line' ? (
        <LineChart data={data} margin={{ top: showLabels ? 20 : 8, right: 8, bottom: 8, left: 8 }}>
          {commonAxis}
          {keys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              name={label(k)}
              stroke={getColor(i)}
              strokeWidth={2}
              dot={showLabels}
              hide={hidden.has(k)}
              isAnimationActive={!forExport}
            >
              {showLabels && (
                <LabelList
                  dataKey={k}
                  position="top"
                  style={{ fontSize: 10, fill: '#64748b' }}
                  formatter={(v: unknown) => fmtNumber(v)}
                />
              )}
            </Line>
          ))}
          {showTrend && trendKeys.map((tk, i) => (
            <Line
              key={tk}
              type="linear"
              dataKey={tk}
              stroke={getTrendColor(i)}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              legendType="none"
              hide={hidden.has(keys[i])}
              isAnimationActive={!forExport}
            />
          ))}
        </LineChart>
      ) : chartType === 'area' ? (
        <AreaChart data={data} margin={{ top: showLabels ? 20 : 8, right: 8, bottom: 8, left: 8 }}>
          {commonAxis}
          {keys.map((k, i) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              name={label(k)}
              stroke={getColor(i)}
              fill={getColor(i)}
              fillOpacity={0.1}
              strokeWidth={2}
              hide={hidden.has(k)}
              isAnimationActive={!forExport}
            >
              {showLabels && (
                <LabelList
                  dataKey={k}
                  position="top"
                  style={{ fontSize: 10, fill: '#64748b' }}
                  formatter={(v: unknown) => fmtNumber(v)}
                />
              )}
            </Area>
          ))}
          {showTrend && trendKeys.map((tk, i) => (
            <Line
              key={tk}
              type="linear"
              dataKey={tk}
              stroke={getTrendColor(i)}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              legendType="none"
              hide={hidden.has(keys[i])}
              isAnimationActive={!forExport}
            />
          ))}
        </AreaChart>
      ) : chartType === 'scatter' ? (
        <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />}
          <XAxis dataKey={xAxis} name={xAxis} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} />
          <YAxis dataKey={keys[0]} name={keys[0]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} />
          <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
          <Scatter data={data} fill={getColor(0)} />
        </ScatterChart>
      ) : chartType === 'pie' || chartType === 'donut' ? (
        <PieChart>
          <Pie
            data={data.filter((d) => !hidden.has(String(d[xAxis ?? ''] ?? '')))}
            dataKey={keys[0] ?? 'value'}
            nameKey={xAxis}
            cx="50%"
            cy="50%"
            innerRadius={chartType === 'donut' ? '55%' : '0%'}
            outerRadius="70%"
            paddingAngle={2}
            label={({ name, value, percent }) =>
              showLabels
                ? `${name}: ${fmtNumber(value)} (${((percent ?? 0) * 100).toFixed(0)}%)`
                : `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
            labelLine={false}
          >
            {data
              .filter((d) => !hidden.has(String(d[xAxis ?? ''] ?? '')))
              .map((_, i) => {
                // Map back to original index for consistent color
                const origIdx = data.indexOf(data.filter((d) => !hidden.has(String(d[xAxis ?? ''] ?? '')))[i]);
                return <Cell key={i} fill={getColor(origIdx)} />;
              })}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            formatter={(value) => [fmtNumber(value), '']}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              content={() =>
                renderLegend(
                  pieSliceNames.map((name, i) => ({ key: name, displayName: label(name), color: getColor(i) }))
                )
              }
            />
          )}
        </PieChart>
      ) : (
        <BarChart data={data}>
          {commonAxis}
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={getColor(i)} hide={hidden.has(k)} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
