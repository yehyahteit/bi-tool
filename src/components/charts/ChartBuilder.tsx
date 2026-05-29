'use client';

import { useState, useMemo, useRef } from 'react';
import type { ChartType, ChartConfig, ColumnSchema, AggregationType, ChartFilter } from '@/types';
import ChartRenderer from './ChartRenderer';
import { buildChartData, applyFilters, unpivotRows } from '@/lib/chartData';
import { exportDashboardToPNG, exportDashboardToPDF } from '@/lib/export/exportDashboard';
import { Save, Loader2, BarChart2, TrendingUp, PieChart, ScatterChart, Table2, Activity, LayoutGrid, Plus, X, Filter, Check, ArrowLeftRight, Download, Image, Gauge } from 'lucide-react';
import { clsx } from 'clsx';

const CHART_TYPES: { type: ChartType; label: string; icon: React.ElementType }[] = [
  { type: 'bar',         label: 'Bar',         icon: BarChart2 },
  { type: 'stacked_bar', label: 'Stacked Bar', icon: LayoutGrid },
  { type: 'line',        label: 'Line',        icon: TrendingUp },
  { type: 'area',        label: 'Area',        icon: Activity },
  { type: 'pie',         label: 'Pie',         icon: PieChart },
  { type: 'donut',       label: 'Donut',       icon: PieChart },
  { type: 'scatter',     label: 'Scatter',     icon: ScatterChart },
  { type: 'table',       label: 'Table',       icon: Table2 },
  { type: 'kpi',         label: 'KPI Card',    icon: BarChart2 },
  { type: 'gauge',       label: 'Gauge',       icon: Gauge },
];

const DEFAULT_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#06b6d4',
];

const AGGS: { value: AggregationType; label: string }[] = [
  { value: 'sum',   label: 'Sum' },
  { value: 'avg',   label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min',   label: 'Min' },
  { value: 'max',   label: 'Max' },
];

type FilterOperator = ChartFilter['operator'];

const TEXT_OPS: { value: FilterOperator; label: string }[] = [
  { value: 'eq',           label: '= Equals' },
  { value: 'neq',          label: '≠ Not equals' },
  { value: 'contains',     label: '⊃ Contains' },
  { value: 'not_contains', label: '⊅ Does not contain' },
  { value: 'starts_with',  label: '⌂ Starts with' },
  { value: 'ends_with',    label: '⌂ Ends with' },
  { value: 'in',           label: '∈ Is in list' },
  { value: 'not_in',       label: '∉ Not in list' },
  { value: 'is_empty',     label: '∅ Is empty' },
  { value: 'is_not_empty', label: '◉ Is not empty' },
];

const NUM_OPS: { value: FilterOperator; label: string }[] = [
  { value: 'eq',           label: '= Equals' },
  { value: 'neq',          label: '≠ Not equals' },
  { value: 'gt',           label: '> Greater than' },
  { value: 'gte',          label: '≥ Greater or equal' },
  { value: 'lt',           label: '< Less than' },
  { value: 'lte',          label: '≤ Less or equal' },
  { value: 'between',      label: '↔ Between' },
  { value: 'in',           label: '∈ Is in list' },
  { value: 'not_in',       label: '∉ Not in list' },
  { value: 'is_empty',     label: '∅ Is empty' },
  { value: 'is_not_empty', label: '◉ Is not empty' },
];

// Operators that take no value input
const NO_VALUE_OPS: FilterOperator[] = ['is_empty', 'is_not_empty'];
// Operators that show checklist + allow free-text entry (array values)
const MULTI_OPS: FilterOperator[] = ['in', 'not_in', 'contains', 'not_contains'];
// Operators that take only a single free-text input (no checklist)
const TEXT_INPUT_OPS: FilterOperator[] = ['starts_with', 'ends_with'];

import type { Chart } from '@/types';

interface ChartBuilderProps {
  datasetId: string;
  columns: ColumnSchema[];
  rows: Record<string, unknown>[];
  onSave?: (chartId: string) => void;
  /** Pre-filters carried over from the dataset page */
  initialFilters?: ChartFilter[];
  /** When set, ChartBuilder is in edit mode — updates existing chart instead of creating */
  initialChart?: Chart;
  onUpdate?: (chart: Chart) => void;
}

export default function ChartBuilder({ datasetId, columns, rows, onSave, initialFilters = [], initialChart, onUpdate }: ChartBuilderProps) {
  const isEditMode = !!initialChart;
  const [chartType, setChartType] = useState<ChartType>(initialChart?.chart_type ?? 'bar');
  const [chartName, setChartName] = useState(initialChart?.name ?? 'My Chart');
  const [config, setConfig] = useState<ChartConfig>(initialChart?.config ?? {
    xAxis: columns.find((c) => c.type === 'string')?.name ?? columns[0]?.name,
    yAxis: columns.find((c) => c.type === 'number')?.name,
    aggregation: 'sum',
    showLegend: true,
    showGrid: true,
    showLabels: false,
    colors: [...DEFAULT_COLORS],
    filters: initialFilters,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const chartPreviewRef = useRef<HTMLDivElement>(null);

  const numCols = columns.filter((c) => c.type === 'number');
  const allCols = columns;
  const catCols = columns.filter((c) => c.type === 'string' || c.type === 'number');

  const patch = (updates: Partial<ChartConfig>) => setConfig((c) => ({ ...c, ...updates }));

  // Derive current series keys for color pickers
  // For pie/donut, each slice (x-axis value) gets its own color
  const seriesKeys = useMemo(() => {
    const { data, keys } = buildChartData(rows, config);
    if ((chartType === 'pie' || chartType === 'donut') && config.xAxis) {
      return data.map((d) => String(d[config.xAxis!] ?? ''));
    }
    return keys;
  }, [rows, config.xAxis, config.yAxis, config.groupBy, config.aggregation, config.filters, chartType]);

  // Cascading unique values per filter index:
  // Filter[i] sees only the rows that pass filters 0..i-1 (all previous filters).
  // This means selecting a value in Filter 1 narrows the options in Filter 2, etc.
  const cascadingUniqueValues = useMemo(() => {
    const filters: ChartFilter[] = config.filters ?? [];
    // result[i] = { colName: string[] } for filter at index i
    const result: Record<string, string[]>[] = [];
    for (let i = 0; i < filters.length; i++) {
      // Apply only the filters before index i
      const precedingFilters = filters.slice(0, i);
      const filteredRows = applyFilters(rows, precedingFilters);
      const map: Record<string, string[]> = {};
      for (const col of columns) {
        const vals = [...new Set(filteredRows.map((r) => String(r[col.name] ?? '')).filter(Boolean))].sort();
        if (vals.length <= 200) map[col.name] = vals;
      }
      result.push(map);
    }
    return result;
  }, [rows, columns, config.filters]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const filters: ChartFilter[] = config.filters ?? [];

  function addFilter() {
    const defaultCol = columns[0];
    const newFilter: ChartFilter = {
      column: defaultCol?.name ?? '',
      operator: 'eq',
      value: '',
    };
    patch({ filters: [...filters, newFilter] });
  }

  function updateFilter(i: number, patch2: Partial<ChartFilter>) {
    const next = filters.map((f, idx) => idx === i ? { ...f, ...patch2 } : f);
    patch({ filters: next });
  }

  function removeFilter(i: number) {
    patch({ filters: filters.filter((_, idx) => idx !== i) });
  }

  // ── Colors ─────────────────────────────────────────────────────────────────
  function setSeriesColor(index: number, color: string) {
    const current = config.colors ?? [...DEFAULT_COLORS];
    const next = [...current];
    while (next.length <= index) next.push(DEFAULT_COLORS[next.length % DEFAULT_COLORS.length]);
    next[index] = color;
    patch({ colors: next });
  }

  function getSeriesColor(index: number) {
    return config.colors?.[index] ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId, name: chartName, chart_type: chartType, config }),
      });
      const json = await res.json();
      if (res.ok) {
        setSaved(true);
        onSave?.(json.data.id);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(json.error ?? 'Failed to save chart');
      }
    } catch (e) {
      setSaveError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!initialChart) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = { name: chartName, chart_type: chartType, config };
      console.log('[ChartBuilder] PATCH', `/api/charts/${initialChart.id}`, payload);
      const res = await fetch(`/api/charts/${initialChart.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      console.log('[ChartBuilder] PATCH response', res.status, json);
      if (res.ok) {
        setSaved(true);
        // Pass back the full server response so updated_at is fresh (triggers LiveChartWidget remount)
        onUpdate?.(json.data as Chart);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(json.error ?? `HTTP ${res.status} — Failed to update chart`);
      }
    } catch (e) {
      console.error('[ChartBuilder] PATCH exception', e);
      setSaveError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleExport(format: 'png' | 'pdf') {
    if (!chartPreviewRef.current) return;
    setExporting(true);
    try {
      if (format === 'png') {
        await exportDashboardToPNG(chartPreviewRef.current, chartName);
      } else {
        await exportDashboardToPDF(chartPreviewRef.current, chartName);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Config sidebar */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto pb-4">

        {/* Chart name */}
        <div className="card p-4">
          <label className="label">Chart name</label>
          <input value={chartName} onChange={(e) => setChartName(e.target.value)} className="input" />
        </div>

        {/* Chart type picker */}
        <div className="card p-4">
          <p className="label mb-2">Chart type</p>
          <div className="grid grid-cols-3 gap-1.5">
            {CHART_TYPES.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                onClick={() => {
                  setChartType(type);
                  // When switching to pie/donut, auto-fix xAxis to a string column if current isn't one
                  if (type === 'pie' || type === 'donut') {
                    const strCols = columns.filter((c) => c.type === 'string');
                    const currentIsStr = strCols.some((c) => c.name === config.xAxis);
                    if (!currentIsStr && strCols.length > 0) {
                      patch({ xAxis: strCols[0].name });
                    }
                  }
                }}
                className={clsx(
                  'flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium border transition-all',
                  chartType === type
                    ? 'border-brand-400 bg-brand-50 text-brand-700'
                    : 'border-gray-100 text-gray-500 hover:bg-gray-50'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Unpivot (Wide → Long) */}
        {chartType !== 'kpi' && chartType !== 'table' && (
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-3.5 h-3.5 text-gray-400" />
                <p className="label mb-0">Unpivot Data</p>
              </div>
              <button
                onClick={() => patch({
                  unpivot: !config.unpivot,
                  unpivotIdCols: config.unpivotIdCols ?? columns.filter((c) => c.type === 'string').map((c) => c.name),
                  unpivotValueCols: config.unpivotValueCols ?? columns.filter((c) => c.type === 'number').map((c) => c.name),
                  unpivotKeyName: config.unpivotKeyName ?? 'Period',
                  unpivotValueName: config.unpivotValueName ?? 'Value',
                  // Auto-set axes for unpivoted data
                  xAxis: !config.unpivot ? (config.unpivotKeyName ?? 'Period') : config.xAxis,
                  yAxis: !config.unpivot ? (config.unpivotValueName ?? 'Value') : config.yAxis,
                })}
                className={clsx(
                  'relative w-10 h-5 rounded-full transition-colors flex-shrink-0',
                  config.unpivot ? 'bg-brand-600' : 'bg-gray-300'
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  config.unpivot ? 'translate-x-5' : 'translate-x-0.5'
                )} />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 -mt-1">
              Turn on when your dataset has date/period columns as headers (wide format). This melts them into rows.
            </p>

            {config.unpivot && (
              <>
                {/* ID columns */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Keep as labels <span className="text-gray-400">(category columns — e.g. Key Metric, Metric Type)</span>
                  </label>
                  <div className="max-h-36 overflow-y-auto flex flex-col gap-0.5 border border-gray-200 rounded-lg bg-white p-1">
                    {columns.map((c) => {
                      const checked = (config.unpivotIdCols ?? []).includes(c.name);
                      return (
                        <div
                          key={c.name}
                          onClick={() => {
                            const next = checked
                              ? (config.unpivotIdCols ?? []).filter((n) => n !== c.name)
                              : [...(config.unpivotIdCols ?? []), c.name];
                            // Remove from value cols if added to id cols
                            const nextVals = (config.unpivotValueCols ?? []).filter((n) => !next.includes(n));
                            patch({ unpivotIdCols: next, unpivotValueCols: nextVals });
                          }}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-brand-50 cursor-pointer text-xs text-gray-700 select-none"
                        >
                          <div className={clsx(
                            'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                            checked ? 'bg-brand-600 border-brand-600' : 'border-gray-300'
                          )}>
                            {checked && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="truncate">{c.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Value columns */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Melt into rows <span className="text-gray-400">(date/period columns — e.g. 13-APR-2026)</span>
                  </label>
                  <div className="max-h-36 overflow-y-auto flex flex-col gap-0.5 border border-gray-200 rounded-lg bg-white p-1">
                    {columns.filter((c) => !(config.unpivotIdCols ?? []).includes(c.name)).map((c) => {
                      const checked = (config.unpivotValueCols ?? []).includes(c.name);
                      return (
                        <div
                          key={c.name}
                          onClick={() => {
                            const next = checked
                              ? (config.unpivotValueCols ?? []).filter((n) => n !== c.name)
                              : [...(config.unpivotValueCols ?? []), c.name];
                            patch({ unpivotValueCols: next });
                          }}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-brand-50 cursor-pointer text-xs text-gray-700 select-none"
                        >
                          <div className={clsx(
                            'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                            checked ? 'bg-green-600 border-green-600' : 'border-gray-300'
                          )}>
                            {checked && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="truncate">{c.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Column name overrides */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Period column name</label>
                    <input className="input text-xs" value={config.unpivotKeyName ?? 'Period'}
                      onChange={(e) => patch({ unpivotKeyName: e.target.value, xAxis: e.target.value })} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Value column name</label>
                    <input className="input text-xs" value={config.unpivotValueName ?? 'Value'}
                      onChange={(e) => patch({ unpivotValueName: e.target.value, yAxis: e.target.value })} />
                  </div>
                </div>

                {/* Preview row count */}
                {(() => {
                  const previewRows = unpivotRows(applyFilters(rows, config.filters ?? []), config);
                  return (
                    <p className="text-[11px] text-brand-600 font-medium">
                      ✓ {rows.length} rows × {(config.unpivotValueCols ?? []).length} date columns = {previewRows.length} unpivoted rows
                    </p>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Axes */}
        {chartType !== 'kpi' && chartType !== 'table' && (
          <div className="card p-4 space-y-3">
            <p className="label">Axes</p>

            {/* When unpivot is on, axes are auto-set — just show info */}
            {config.unpivot ? (
              <div className="text-[11px] text-gray-400 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 space-y-0.5">
                <p><span className="font-medium text-brand-700">X Axis:</span> {config.unpivotKeyName ?? 'Period'}</p>
                <p><span className="font-medium text-brand-700">Y Axis:</span> {config.unpivotValueName ?? 'Value'}</p>
                <p className="text-gray-400">Axes are set automatically by the Unpivot configuration above.</p>
              </div>
            ) : (
              <>
                {/* X Axis — for pie/donut only show categorical columns */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {(chartType === 'pie' || chartType === 'donut') ? 'Slice Label (Category)' : 'X Axis'}
                  </label>
                  <select
                    className="input text-sm"
                    value={config.xAxis ?? ''}
                    onChange={(e) => patch({ xAxis: e.target.value })}
                  >
                    <option value="">— select —</option>
                    {((chartType === 'pie' || chartType === 'donut')
                      ? columns.filter((c) => c.type === 'string')
                      : allCols
                    ).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  {(chartType === 'pie' || chartType === 'donut') && (
                    <p className="text-[11px] text-gray-400 mt-1">Each unique value becomes a slice</p>
                  )}
                </div>

                {/* Y Axis */}
                {chartType !== 'scatter' && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      {(chartType === 'pie' || chartType === 'donut') ? 'Slice Value (Numeric)' : 'Y Axis'}
                    </label>
                    <select
                      className="input text-sm"
                      value={typeof config.yAxis === 'string' ? config.yAxis : (Array.isArray(config.yAxis) ? config.yAxis[0] ?? '' : '')}
                      onChange={(e) => patch({ yAxis: e.target.value })}
                    >
                      <option value="">— count rows —</option>
                      {numCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                    {(chartType === 'pie' || chartType === 'donut') && (
                      <p className="text-[11px] text-gray-400 mt-1">The numeric column that determines each slice's size</p>
                    )}
                  </div>
                )}
              </>
            )}

            {(chartType === 'stacked_bar' || chartType === 'bar' || chartType === 'line' || chartType === 'area') && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Group By <span className="text-gray-300">(optional — splits into series)</span>
                </label>
                <select className="input text-sm" value={config.groupBy ?? ''}
                  onChange={(e) => patch({ groupBy: e.target.value || undefined })}>
                  <option value="">— none —</option>
                  {catCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                {config.groupBy && (
                  <p className="text-[11px] text-brand-600 mt-1">
                    Each unique value in <strong>{config.groupBy}</strong> becomes a separate series.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Aggregation</label>
              <select className="input text-sm" value={config.aggregation ?? 'sum'}
                onChange={(e) => patch({ aggregation: e.target.value as AggregationType })}>
                {AGGS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* KPI config */}
        {chartType === 'kpi' && (
          <div className="card p-4 space-y-3">
            <p className="label">KPI Settings</p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Column</label>
              <select className="input text-sm" value={config.kpiColumn ?? ''} onChange={(e) => patch({ kpiColumn: e.target.value })}>
                <option value="">Row count</option>
                {numCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Aggregation</label>
              <select className="input text-sm" value={config.kpiAggregation ?? 'sum'}
                onChange={(e) => patch({ kpiAggregation: e.target.value as AggregationType })}>
                {AGGS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Prefix</label>
                <input className="input text-sm" value={config.kpiPrefix ?? ''} onChange={(e) => patch({ kpiPrefix: e.target.value })} placeholder="$" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Suffix</label>
                <input className="input text-sm" value={config.kpiSuffix ?? ''} onChange={(e) => patch({ kpiSuffix: e.target.value })} placeholder="%" />
              </div>
            </div>
          </div>
        )}

        {/* Gauge config */}
        {chartType === 'gauge' && (
          <div className="card p-4 space-y-3">
            <p className="label">Gauge Settings</p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Value Column</label>
              <select className="input text-sm" value={config.gaugeColumn ?? ''} onChange={(e) => patch({ gaugeColumn: e.target.value })}>
                <option value="">Row count</option>
                {numCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Aggregation</label>
              <select className="input text-sm" value={config.gaugeAggregation ?? 'sum'}
                onChange={(e) => patch({ gaugeAggregation: e.target.value as AggregationType })}>
                {AGGS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Min</label>
                <input type="number" className="input text-sm" value={config.gaugeMin ?? 0} onChange={(e) => patch({ gaugeMin: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Max</label>
                <input type="number" className="input text-sm" value={config.gaugeMax ?? 100} onChange={(e) => patch({ gaugeMax: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Prefix</label>
                <input className="input text-sm" value={config.gaugePrefix ?? ''} onChange={(e) => patch({ gaugePrefix: e.target.value })} placeholder="$" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Suffix</label>
                <input className="input text-sm" value={config.gaugeSuffix ?? ''} onChange={(e) => patch({ gaugeSuffix: e.target.value })} placeholder="%" />
              </div>
            </div>
            {/* Thresholds */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">Color Thresholds</label>
                <button
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                  onClick={() => patch({ gaugeThresholds: [...(config.gaugeThresholds ?? []), { value: 75, color: '#f59e0b' }] })}
                >+ Add</button>
              </div>
              {(config.gaugeThresholds ?? []).map((t, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <input type="number" className="input text-xs w-24" value={t.value}
                    onChange={(e) => {
                      const next = [...(config.gaugeThresholds ?? [])];
                      next[i] = { ...next[i], value: Number(e.target.value) };
                      patch({ gaugeThresholds: next });
                    }} />
                  <input type="color" className="w-7 h-7 rounded border-0 cursor-pointer" value={t.color}
                    onChange={(e) => {
                      const next = [...(config.gaugeThresholds ?? [])];
                      next[i] = { ...next[i], color: e.target.value };
                      patch({ gaugeThresholds: next });
                    }} />
                  <button className="text-gray-300 hover:text-red-400 ml-auto"
                    onClick={() => patch({ gaugeThresholds: (config.gaugeThresholds ?? []).filter((_, j) => j !== i) })}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <p className="text-[10px] text-gray-400 mt-1">Values below the first threshold use the base color. Each threshold marks where the needle color changes.</p>
            </div>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="label mb-0 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              Filters
              {filters.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold">
                  {filters.length}
                </span>
              )}
            </p>
            <button onClick={addFilter}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors">
              <Plus className="w-3 h-3" /> Add filter
            </button>
          </div>

          {filters.length === 0 && (
            <p className="text-xs text-gray-400">No filters — showing all rows.</p>
          )}

          {filters.map((f, i) => {
            const col = columns.find((c) => c.name === f.column);
            const isNum = col?.type === 'number';
            const ops = isNum ? NUM_OPS : TEXT_OPS;
            // Use cascading values: options for filter[i] come from rows filtered by filters 0..i-1
            const uniqueVals = f.column ? (cascadingUniqueValues[i]?.[f.column] ?? []) : [];
            const isMulti = MULTI_OPS.includes(f.operator);          // in / not_in → checklist
            const isTextInput = TEXT_INPUT_OPS.includes(f.operator); // contains / not_contains / starts_with / ends_with → plain text box
            const noValue = NO_VALUE_OPS.includes(f.operator);
            const isBetween = f.operator === 'between';
            const selectedArr: string[] = Array.isArray(f.value) ? (f.value as string[]) : [];

            function toggleMultiVal(val: string) {
              const next = selectedArr.includes(val)
                ? selectedArr.filter((v) => v !== val)
                : [...selectedArr, val];
              updateFilter(i, { value: next });
            }

            return (
              <div key={i} className="flex flex-col gap-1.5 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                {/* Column + remove */}
                <div className="flex items-center gap-1.5">
                  <select className="input text-xs flex-1" value={f.column}
                    onChange={(e) => updateFilter(i, { column: e.target.value, operator: 'eq', value: '' })}>
                    <option value="">— column —</option>
                    {allCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  <button onClick={() => removeFilter(i)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Operator */}
                <select className="input text-xs" value={f.operator}
                  onChange={(e) => {
                    const op = e.target.value as FilterOperator;
                    // Reset value: array for checklist multi, string for everything else
                    updateFilter(i, { operator: op, value: MULTI_OPS.includes(op) ? [] : '' });
                  }}>
                  {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                {/* Value input — depends on operator */}
                {!noValue && (
                  <>
                    {/* BETWEEN — two number inputs */}
                    {isBetween && (
                      <div className="flex items-center gap-1.5">
                        <input className="input text-xs flex-1" type="number" placeholder="Min"
                          value={String(f.value ?? '')}
                          onChange={(e) => updateFilter(i, { value: e.target.value })} />
                        <span className="text-xs text-gray-400">–</span>
                        <input className="input text-xs flex-1" type="number" placeholder="Max"
                          value={String((f as {value2?: unknown}).value2 ?? '')}
                          onChange={(e) => updateFilter(i, { value2: e.target.value } as Partial<ChartFilter>)} />
                      </div>
                    )}

                    {/* STARTS_WITH / ENDS_WITH — single free-text input only */}
                    {isTextInput && !isBetween && (
                      <input
                        className="input text-xs"
                        type="text"
                        placeholder="Type any text…"
                        value={String(f.value ?? '')}
                        onChange={(e) => updateFilter(i, { value: e.target.value })}
                      />
                    )}

                    {/* CONTAINS / NOT_CONTAINS / IN / NOT_IN — checklist + tag input */}
                    {isMulti && !isBetween && (
                      uniqueVals.length > 0 ? (
                        <div className="max-h-52 overflow-y-auto flex flex-col gap-0.5 border border-gray-200 rounded-lg bg-white p-1">
                          {uniqueVals.map((v) => (
                            <div
                              key={v}
                              onClick={() => toggleMultiVal(v)}
                              className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-brand-50 cursor-pointer text-xs text-gray-700 select-none"
                            >
                              <div className={clsx(
                                'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all mt-0.5',
                                selectedArr.includes(v) ? 'bg-brand-600 border-brand-600' : 'border-gray-300'
                              )}>
                                {selectedArr.includes(v) && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <span className="break-words leading-tight">{v}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* Tag input for free-text multi */
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap gap-1 min-h-[28px] p-1 border border-gray-200 rounded-lg bg-white">
                            {selectedArr.map((v) => (
                              <span key={v} className="flex items-center gap-1 bg-brand-100 text-brand-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                                {v}
                                <button onClick={() => toggleMultiVal(v)} className="hover:text-brand-900">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                            <input
                              className="text-xs outline-none flex-1 min-w-[60px] px-1 placeholder:text-gray-300"
                              placeholder="Type & press Enter…"
                              onKeyDown={(e) => {
                                if ((e.key === 'Enter' || e.key === ',') && e.currentTarget.value.trim()) {
                                  e.preventDefault();
                                  toggleMultiVal(e.currentTarget.value.trim());
                                  e.currentTarget.value = '';
                                }
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-400">Press Enter or comma to add a value</p>
                        </div>
                      )
                    )}

                    {/* SINGLE VALUE (eq, neq, gt, gte, lt, lte) — dropdown or text/number input */}
                    {!isMulti && !isTextInput && !isBetween && (
                      uniqueVals.length > 0 ? (
                        <select className="input text-xs" value={String(f.value ?? '')}
                          onChange={(e) => updateFilter(i, { value: e.target.value })}>
                          <option value="">— any —</option>
                          {uniqueVals.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : (
                        <input className="input text-xs" type={isNum ? 'number' : 'text'} placeholder="Value…"
                          value={String(f.value ?? '')}
                          onChange={(e) => updateFilter(i, { value: isNum ? Number(e.target.value) : e.target.value })} />
                      )
                    )}
                  </>
                )}

                {/* Active selection summary for multi (contains / in / not_in checklist) */}
                {isMulti && selectedArr.length > 0 && uniqueVals.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedArr.map((v) => (
                      <span key={v} title={v} className="flex items-center gap-1 bg-brand-100 text-brand-700 text-[11px] px-2 py-0.5 rounded-full font-medium max-w-full">
                        <span className="break-all leading-tight">{v}</span>
                        <button onClick={() => toggleMultiVal(v)} className="hover:text-brand-900 flex-shrink-0">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Display options */}
        <div className="card p-4 space-y-3">
          <p className="label">Display</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={config.showLegend ?? true} onChange={(e) => patch({ showLegend: e.target.checked })} className="rounded" />
              Show legend
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={config.showGrid ?? true} onChange={(e) => patch({ showGrid: e.target.checked })} className="rounded" />
              Show grid
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={config.showLabels ?? false} onChange={(e) => patch({ showLabels: e.target.checked })} className="rounded" />
              Show value labels
            </label>
            {(chartType === 'bar' || chartType === 'line' || chartType === 'area') && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={config.showTrend ?? false} onChange={(e) => patch({ showTrend: e.target.checked })} className="rounded" />
                Show trend line
              </label>
            )}
          </div>

          {/* Per-series color pickers */}
          {seriesKeys.length > 0 && chartType !== 'kpi' && chartType !== 'table' && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Series colors</p>
              <div className="space-y-2">
                {seriesKeys.map((key, i) => (
                  <div key={key} className="flex items-center gap-2">
                    <label
                      className="relative w-7 h-7 rounded-md border border-gray-200 cursor-pointer overflow-hidden flex-shrink-0 shadow-sm hover:ring-2 hover:ring-brand-400 transition-all"
                      style={{ backgroundColor: getSeriesColor(i) }}
                    >
                      <input type="color" value={getSeriesColor(i)}
                        onChange={(e) => setSeriesColor(i, e.target.value)}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                    </label>
                    <span className="text-xs text-gray-600 truncate flex-1" title={key}>{key}</span>
                    <input type="text" value={getSeriesColor(i)}
                      onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setSeriesColor(i, v); }}
                      className="w-20 text-xs font-mono border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                  </div>
                ))}
              </div>
              <button onClick={() => patch({ colors: [...DEFAULT_COLORS] })}
                className="mt-2 text-[11px] text-gray-400 hover:text-brand-600 transition-colors">
                Reset to defaults
              </button>
            </div>
          )}

          {/* Trend line color pickers — only shown when trend is on */}
          {config.showTrend && seriesKeys.length > 0 && (chartType === 'bar' || chartType === 'line' || chartType === 'area') && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Trend line colors</p>
              <div className="space-y-2">
                {seriesKeys.map((key, i) => {
                  const TREND_DEFAULTS = ['#a5b4fc','#86efac','#fcd34d','#fca5a5','#93c5fd','#c4b5fd','#5eead4','#fdba74','#f9a8d4','#67e8f9'];
                  const currentTrendColor = config.trendColors?.[i] ?? TREND_DEFAULTS[i % TREND_DEFAULTS.length];
                  function setTrendColor(idx: number, color: string) {
                    const current = config.trendColors ?? [...TREND_DEFAULTS];
                    const next = [...current];
                    while (next.length <= idx) next.push(TREND_DEFAULTS[next.length % TREND_DEFAULTS.length]);
                    next[idx] = color;
                    patch({ trendColors: next });
                  }
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <label
                        className="relative w-7 h-7 rounded-md border border-gray-200 cursor-pointer overflow-hidden flex-shrink-0 shadow-sm hover:ring-2 hover:ring-brand-400 transition-all"
                        style={{ backgroundColor: currentTrendColor }}
                      >
                        <input type="color" value={currentTrendColor}
                          onChange={(e) => setTrendColor(i, e.target.value)}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                      </label>
                      <span className="text-xs text-gray-600 truncate flex-1" title={key}>{key} trend</span>
                      <input type="text" value={currentTrendColor}
                        onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setTrendColor(i, v); }}
                        className="w-20 text-xs font-mono border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                    </div>
                  );
                })}
              </div>
              <button onClick={() => patch({ trendColors: undefined })}
                className="mt-2 text-[11px] text-gray-400 hover:text-brand-600 transition-colors">
                Reset trend colors
              </button>
            </div>
          )}

          {/* Series label renaming */}
          {seriesKeys.length > 0 && chartType !== 'kpi' && chartType !== 'table' && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1">Rename labels</p>
              <p className="text-[10px] text-gray-400 mb-2">Shown in legend & tooltip</p>
              <div className="space-y-1.5">
                {seriesKeys.map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 truncate w-20 flex-shrink-0" title={key}>{key}</span>
                    <span className="text-gray-300 text-xs flex-shrink-0">→</span>
                    <input
                      className="input text-xs flex-1 py-1"
                      placeholder={key}
                      value={config.seriesLabels?.[key] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const next = { ...(config.seriesLabels ?? {}) };
                        if (val) next[key] = val;
                        else delete next[key];
                        patch({ seriesLabels: next });
                      }}
                    />
                  </div>
                ))}
              </div>
              {Object.keys(config.seriesLabels ?? {}).length > 0 && (
                <button onClick={() => patch({ seriesLabels: {} })}
                  className="mt-1.5 text-[10px] text-gray-400 hover:text-brand-600 transition-colors">
                  Clear all renames
                </button>
              )}
            </div>
          )}
        </div>

        {/* Save / Update */}
        <button onClick={isEditMode ? handleUpdate : handleSave} disabled={saving}
          className={clsx('btn-primary w-full justify-center', saved && 'bg-green-600 hover:bg-green-700')}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : isEditMode ? 'Update Chart' : 'Save Chart'}
        </button>
        {saveError && (
          <p className="text-xs text-red-500 text-center mt-1">{saveError}</p>
        )}
      </div>

      {/* Preview */}
      <div className="flex-1 card p-5 flex flex-col" ref={chartPreviewRef}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">{chartName}</h3>
          <div className="flex items-center gap-2">
            {filters.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-brand-600 bg-brand-50 px-2 py-1 rounded-full">
                <Filter className="w-3 h-3" />
                {filters.filter((f) => f.column && f.value !== '').length} filter{filters.filter((f) => f.column && f.value !== '').length !== 1 ? 's' : ''} active
              </span>
            )}
            {/* Export buttons */}
            <div className="flex items-center gap-1" data-export-skip>
              <button
                onClick={() => handleExport('png')}
                disabled={exporting}
                title="Export as PNG"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 border border-gray-200 hover:border-brand-300 bg-white px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
                PNG
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={exporting}
                title="Export as PDF"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 border border-gray-200 hover:border-brand-300 bg-white px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                PDF
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1">
          <ChartRenderer
            chartType={chartType}
            config={config}
            rows={rows}
            height={400}
          />
        </div>
      </div>
    </div>
  );
}
