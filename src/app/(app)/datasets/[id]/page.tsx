'use client';

import { useEffect, useState, useMemo, use, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { VisibilityState } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/data-table/DataTable';
import TypeBadge from '@/components/data-table/TypeBadge';
import ChartRenderer from '@/components/charts/ChartRenderer';
import Link from 'next/link';
import {
  BarChart2, ArrowLeft, Link2, X, Check, Loader2, ChevronDown,
  Filter, Plus, ChevronUp, Pencil, Trash2, BarChart,
} from 'lucide-react';
import type { ColumnSchema, ColumnLookup, ChartFilter, Chart } from '@/types';
import { clsx } from 'clsx';
import { applyFilters } from '@/lib/chartData';

interface Category { id: string; name: string; columns: { key: string; label: string }[] }
interface Entry    { id: string; data: Record<string, unknown>; is_active: boolean }

interface DatasetInfo {
  id: string; name: string; file_type: string;
  row_count: number; column_count: number;
  columns_schema: ColumnSchema[];
}

type FilterOperator = ChartFilter['operator'];

const TEXT_OPS: { value: FilterOperator; label: string }[] = [
  { value: 'eq',           label: '= Equals' },
  { value: 'neq',          label: '≠ Not equals' },
  { value: 'contains',     label: '⊃ Contains' },
  { value: 'not_contains', label: '⊅ Does not contain' },
  { value: 'starts_with',  label: '⌂ Starts with' },
  { value: 'ends_with',    label: '⌂ Ends with' },
  { value: 'in',           label: '∈ Is one of' },
  { value: 'not_in',       label: '∉ Is not one of' },
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
  { value: 'is_empty',     label: '∅ Is empty' },
  { value: 'is_not_empty', label: '◉ Is not empty' },
];
const MULTI_OPS: FilterOperator[]      = ['in', 'not_in', 'contains', 'not_contains'];
const TEXT_INPUT_OPS: FilterOperator[] = ['starts_with', 'ends_with'];
const NO_VALUE_OPS: FilterOperator[]   = ['is_empty', 'is_not_empty'];

function DatasetDetailPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [dataset, setDataset]       = useState<DatasetInfo | null>(null);
  const [columns, setColumns]       = useState<ColumnSchema[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lookupMap, setLookupMap]   = useState<Record<string, Record<string, string>>>({});
  const [openCol, setOpenCol]       = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  // Tab state — default to 'charts' if ?tab=charts in URL
  const [activeTab, setActiveTab]   = useState<'data' | 'charts'>(
    searchParams?.get('tab') === 'charts' ? 'charts' : 'data'
  );

  // Charts for this dataset
  const [charts, setCharts]         = useState<Chart[]>([]);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [chartRows, setChartRows]   = useState<Record<string, unknown>[]>([]);
  const [deletingChart, setDeletingChart] = useState<string | null>(null);

  // All fetched rows (up to 2000 for filtering)
  const [allRows, setAllRows]       = useState<Record<string, unknown>[]>([]);

  // Data filter state
  const [filters, setFilters]       = useState<ChartFilter[]>([]);
  const [filterOpen, setFilterOpen] = useState(true);

  // Column visibility state — lifted from DataTable so we can pass hidden cols to chart builder
  const [colVisibility, setColVisibility] = useState<VisibilityState>({});
  const handleColVisibilityChange = useCallback((v: VisibilityState) => setColVisibility(v), []);

  // Load dataset + config categories + all rows in parallel
  useEffect(() => {
    Promise.all([
      fetch(`/api/datasets/${id}`).then((r) => r.json()),
      fetch('/api/config/categories').then((r) => r.json()),
      fetch(`/api/datasets/${id}/rows?page=1&pageSize=2000`).then((r) => r.json()),
    ]).then(([dsJson, catJson, rowsJson]) => {
      const ds: DatasetInfo = dsJson.data;
      setDataset(ds);
      setColumns(ds.columns_schema ?? []);
      setCategories(catJson.data ?? []);
      const fetched = (rowsJson.data ?? []).map((r: { data: Record<string, unknown> }) => r.data);
      setAllRows(fetched);
      setChartRows(fetched);
    });
  }, [id]);

  // Load charts for this dataset
  useEffect(() => {
    setChartsLoading(true);
    fetch(`/api/charts?dataset_id=${id}`)
      .then((r) => r.json())
      .then((json) => setCharts(json.data ?? []))
      .finally(() => setChartsLoading(false));
  }, [id]);

  async function handleDeleteChart(chartId: string) {
    setDeletingChart(chartId);
    await fetch(`/api/charts/${chartId}`, { method: 'DELETE' });
    setCharts((prev) => prev.filter((c) => c.id !== chartId));
    setDeletingChart(null);
  }

  // Whenever columns change and any has a lookup, fetch entries for those categories
  useEffect(() => {
    const linked = columns.filter((c) => c.lookup);
    if (!linked.length) return;
    const catIds = [...new Set(linked.map((c) => c.lookup!.categoryId))];
    catIds.forEach(async (catId) => {
      const res = await fetch(`/api/config/categories/${catId}/entries`);
      const json = await res.json();
      const col = linked.find((c) => c.lookup?.categoryId === catId)!;
      const { matchField, displayField } = col.lookup!;
      const map: Record<string, string> = {};
      (json.data ?? [] as Entry[]).forEach((e: Entry) => {
        const key = String(e.data[matchField] ?? '');
        map[key] = String(e.data[displayField] ?? '');
      });
      setLookupMap((prev) => ({ ...prev, [catId]: map }));
    });
  }, [columns]);

  // Cascading unique values per filter index
  const cascadingUniqueVals = useMemo(() => {
    return filters.map((_, i) => {
      const precedingFilters = filters.slice(0, i);
      const filtered = applyFilters(allRows, precedingFilters);
      const map: Record<string, string[]> = {};
      for (const col of columns) {
        const vals = [...new Set(filtered.map((r) => String(r[col.name] ?? '')).filter(Boolean))].sort();
        if (vals.length <= 200) map[col.name] = vals;
      }
      return map;
    });
  }, [allRows, columns, filters]);

  // Filtered rows shown in the preview table
  const filteredRows = useMemo(() => applyFilters(allRows, filters), [allRows, filters]);

  function addFilter() {
    setFilters((prev) => [...prev, { column: columns[0]?.name ?? '', operator: 'eq', value: '' }]);
  }
  function removeFilter(i: number) {
    setFilters((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateFilter(i: number, patch: Partial<ChartFilter>) {
    setFilters((prev) => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }
  function clearFilters() { setFilters([]); }

  function toggleMultiVal(filterIdx: number, val: string) {
    const f = filters[filterIdx];
    const selectedArr: string[] = Array.isArray(f.value) ? (f.value as string[]) : [];
    const next = selectedArr.includes(val)
      ? selectedArr.filter((v) => v !== val)
      : [...selectedArr, val];
    updateFilter(filterIdx, { value: next });
  }

  async function saveLookup(colName: string, lookup: ColumnLookup | undefined) {
    setSaving(true);
    const next = columns.map((c) =>
      c.name === colName ? { ...c, lookup } : c
    );
    await fetch(`/api/datasets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns_schema: next }),
    });
    setColumns(next);
    setSaving(false);
    setOpenCol(null);
  }

  // Build URL to chart builder — pass active filters + hidden columns as query params
  const chartBuilderUrl = useMemo(() => {
    const base = `/datasets/${id}/charts`;
    const params = new URLSearchParams();
    if (filters.length) params.set('filters', JSON.stringify(filters));
    // Hidden columns: those with visibility === false
    const hiddenCols = Object.entries(colVisibility)
      .filter(([, visible]) => visible === false)
      .map(([col]) => col);
    if (hiddenCols.length) params.set('hiddenCols', JSON.stringify(hiddenCols));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [id, filters, colVisibility]);

  if (!dataset) return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
    </div>
  );

  const activeFiltersCount = filters.filter((f) => {
    if (!f.column) return false;
    if (NO_VALUE_OPS.includes(f.operator)) return true;
    if (Array.isArray(f.value)) return (f.value as unknown[]).length > 0;
    return f.value !== '' && f.value !== null && f.value !== undefined;
  }).length;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/datasets" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{dataset.name}</h1>
            <p className="text-sm text-gray-400">
              {activeFiltersCount > 0
                ? <><span className="text-brand-600 font-medium">{filteredRows.length.toLocaleString()}</span> of {dataset.row_count?.toLocaleString()} rows</>
                : <>{dataset.row_count?.toLocaleString()} rows</>
              }
              {' '}· {dataset.column_count} columns · {dataset.file_type.toUpperCase()}
            </p>
          </div>
        </div>
        <Link href={chartBuilderUrl} className="btn-primary">
          <BarChart2 className="w-4 h-4" /> Build Charts
          {activeFiltersCount > 0 && (
            <span className="ml-1 bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {activeFiltersCount} filter{activeFiltersCount !== 1 ? 's' : ''}
            </span>
          )}
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('data')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'data'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Data Preview
        </button>
        <button
          onClick={() => setActiveTab('charts')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
            activeTab === 'charts'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <BarChart className="w-3.5 h-3.5" />
          Charts
          {charts.length > 0 && (
            <span className={clsx(
              'inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold',
              activeTab === 'charts' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
            )}>{charts.length}</span>
          )}
        </button>
      </div>

      {/* Charts Tab */}
      {activeTab === 'charts' && (
        <div className="flex flex-col gap-4">
          {chartsLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-300">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading charts…
            </div>
          ) : charts.length === 0 ? (
            <div className="card p-16 text-center">
              <BarChart2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No charts yet</p>
              <p className="text-sm text-gray-300 mt-1 mb-4">Build your first chart from this dataset</p>
              <Link href={chartBuilderUrl} className="btn-primary inline-flex">
                <Plus className="w-4 h-4" /> Build Chart
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{charts.length} chart{charts.length !== 1 ? 's' : ''} built from this dataset</p>
                <Link href={chartBuilderUrl} className="btn-secondary text-sm">
                  <Plus className="w-4 h-4" /> New Chart
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {charts.map((chart) => (
                  <div key={chart.id} className="card flex flex-col overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{chart.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{chart.chart_type.replace('_', ' ')}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <Link
                          href={`/datasets/${id}/charts?editChart=${chart.id}`}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                          title="Edit chart"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => handleDeleteChart(chart.id)}
                          disabled={deletingChart === chart.id}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                          title="Delete chart"
                        >
                          {deletingChart === chart.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    </div>
                    {/* Chart preview */}
                    <div className="flex-1 p-3 min-h-0" style={{ height: 220 }}>
                      {chartRows.length > 0 ? (
                        <ChartRenderer
                          chartType={chart.chart_type}
                          config={chart.config}
                          rows={chartRows}
                          height={200}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-300 text-sm">
                          Loading data…
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Tab content */}
      {activeTab === 'data' && (
      <>
      {/* Column Schema */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Column Schema</h2>
          {categories.length > 0 && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Link2 className="w-3 h-3" /> Click a column to link it to a lookup table
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {columns.map((col) => {
            const isOpen = openCol === col.name;
            const hasLookup = !!col.lookup;
            return (
              <div key={col.name} className="relative">
                <button
                  onClick={() => setOpenCol(isOpen ? null : col.name)}
                  className={clsx(
                    'flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 transition-all',
                    isOpen
                      ? 'border-brand-400 bg-brand-50 shadow-sm'
                      : hasLookup
                      ? 'border-green-200 bg-green-50 hover:border-green-300'
                      : 'border-gray-100 bg-gray-50 hover:border-brand-200 hover:bg-brand-50/40'
                  )}
                >
                  <span className="text-xs font-medium text-gray-700">{col.name}</span>
                  <TypeBadge type={col.type} />
                  {hasLookup && (
                    <span className="flex items-center gap-0.5 text-[10px] text-green-600 font-medium">
                      <Link2 className="w-2.5 h-2.5" />
                      {col.lookup!.categoryName}
                    </span>
                  )}
                  {categories.length > 0 && <ChevronDown className={clsx('w-3 h-3 text-gray-400 transition-transform', isOpen && 'rotate-180')} />}
                </button>
                {isOpen && (
                  <LookupPanel
                    col={col}
                    categories={categories}
                    saving={saving}
                    onSave={(lookup) => saveLookup(col.name, lookup)}
                    onClose={() => setOpenCol(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Data Filters ─────────────────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        {/* Filter header — use div not button to avoid nested <button> hydration error */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFilterOpen((o) => !o)}
          onKeyDown={(e) => e.key === 'Enter' && setFilterOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Filter Data</span>
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold">
                {activeFiltersCount}
              </span>
            )}
            {activeFiltersCount > 0 && (
              <span className="text-xs text-gray-400">
                — showing {filteredRows.length.toLocaleString()} of {allRows.length.toLocaleString()} rows
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFiltersCount > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); clearFilters(); }}
                className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-0.5 rounded hover:bg-red-50"
              >
                Clear all
              </button>
            )}
            {filterOpen
              ? <ChevronUp className="w-4 h-4 text-gray-400" />
              : <ChevronDown className="w-4 h-4 text-gray-400" />
            }
          </div>
        </div>

        {filterOpen && (
          <div className="px-4 pb-4 border-t border-gray-100">
            {filters.length === 0 ? (
              <div className="flex items-center gap-3 py-3">
                <p className="text-sm text-gray-400 flex-1">No filters applied. Add a filter to narrow down the data before building charts.</p>
                <button onClick={addFilter} className="btn-secondary text-xs">
                  <Plus className="w-3.5 h-3.5" /> Add Filter
                </button>
              </div>
            ) : (
              <div className="pt-3 flex flex-col gap-3">
                {/* Filter rows */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filters.map((f, i) => {
                    const col = columns.find((c) => c.name === f.column);
                    const isNum = col?.type === 'number';
                    const ops = isNum ? NUM_OPS : TEXT_OPS;
                    const uniqueVals = f.column ? (cascadingUniqueVals[i]?.[f.column] ?? []) : [];
                    const isMulti     = MULTI_OPS.includes(f.operator);
                    const isTextInput = TEXT_INPUT_OPS.includes(f.operator);
                    const noValue     = NO_VALUE_OPS.includes(f.operator);
                    const isBetween   = f.operator === 'between';
                    const selectedArr: string[] = Array.isArray(f.value) ? (f.value as string[]) : [];

                    return (
                      <div key={i} className="flex flex-col gap-1.5 p-3 bg-gray-50 rounded-xl border border-gray-200">
                        {/* Column selector + remove */}
                        <div className="flex items-center gap-1.5">
                          <select
                            className="input text-xs flex-1"
                            value={f.column}
                            onChange={(e) => updateFilter(i, { column: e.target.value, operator: 'eq', value: '' })}
                          >
                            <option value="">— column —</option>
                            {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                          </select>
                          <button onClick={() => removeFilter(i)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Operator */}
                        <select
                          className="input text-xs"
                          value={f.operator}
                          onChange={(e) => {
                            const op = e.target.value as FilterOperator;
                            updateFilter(i, { operator: op, value: MULTI_OPS.includes(op) ? [] : '' });
                          }}
                        >
                          {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>

                        {/* Value input */}
                        {!noValue && (
                          <>
                            {/* BETWEEN */}
                            {isBetween && (
                              <div className="flex items-center gap-1.5">
                                <input className="input text-xs flex-1" type="number" placeholder="Min"
                                  value={String(f.value ?? '')}
                                  onChange={(e) => updateFilter(i, { value: e.target.value })} />
                                <span className="text-xs text-gray-400">–</span>
                                <input className="input text-xs flex-1" type="number" placeholder="Max"
                                  value={String((f as { value2?: unknown }).value2 ?? '')}
                                  onChange={(e) => updateFilter(i, { value2: e.target.value } as Partial<ChartFilter>)} />
                              </div>
                            )}

                            {/* STARTS_WITH / ENDS_WITH — single free-text only */}
                            {isTextInput && !isBetween && (
                              <input
                                className="input text-xs"
                                type="text"
                                placeholder="Type any text…"
                                value={String(f.value ?? '')}
                                onChange={(e) => updateFilter(i, { value: e.target.value })}
                              />
                            )}

                            {/* CONTAINS / NOT_CONTAINS / IN / NOT_IN — checklist */}
                            {isMulti && !isBetween && (
                              <>
                                <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5 border border-gray-200 rounded-lg bg-white p-1">
                                  {uniqueVals.length > 0 ? uniqueVals.map((v) => (
                                    <div
                                      key={v}
                                      onClick={() => toggleMultiVal(i, v)}
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
                                  )) : (
                                    <p className="text-xs text-gray-400 px-2 py-2">No values available</p>
                                  )}
                                </div>
                                {selectedArr.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {selectedArr.map((v) => (
                                      <span key={v} title={v} className="flex items-center gap-1 bg-brand-100 text-brand-700 text-[11px] px-2 py-0.5 rounded-full font-medium max-w-full">
                                        <span className="break-all leading-tight">{v}</span>
                                        <button onClick={() => toggleMultiVal(i, v)} className="hover:text-brand-900 flex-shrink-0">
                                          <X className="w-2.5 h-2.5" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}

                            {/* SINGLE VALUE — eq / neq / gt / lt etc */}
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
                      </div>
                    );
                  })}
                </div>

                {/* Add filter button */}
                <div className="flex items-center justify-between">
                  <button onClick={addFilter} className="btn-secondary text-xs">
                    <Plus className="w-3.5 h-3.5" /> Add Filter
                  </button>
                  {activeFiltersCount > 0 && (
                    <p className="text-xs text-brand-600 font-medium">
                      ✓ {filteredRows.length.toLocaleString()} rows match · chart will use filtered data
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data Preview */}
      <div className="flex-1 min-h-0">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          Data Preview
          {activeFiltersCount > 0 && (
            <span className="ml-2 text-xs font-normal text-brand-600">(filtered view)</span>
          )}
        </h2>
        <div className="h-[calc(100vh-420px)]">
          <DataTable
            datasetId={id}
            columns={columns}
            totalRows={activeFiltersCount > 0 ? filteredRows.length : (dataset.row_count ?? 0)}
            lookupMap={lookupMap}
            preloadedRows={activeFiltersCount > 0 ? filteredRows : undefined}
            colVisibility={colVisibility}
            onColVisibilityChange={handleColVisibilityChange}
          />
        </div>
      </div>
      </>
      )} {/* end data tab */}
    </div>
  );
}

export default function DatasetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <DatasetDetailPageInner params={params} />
    </Suspense>
  );
}

/* ── Lookup Panel ──────────────────────────────────────────────────────────── */
function LookupPanel({
  col, categories, saving, onSave, onClose,
}: {
  col: ColumnSchema;
  categories: Category[];
  saving: boolean;
  onSave: (lookup: ColumnLookup | undefined) => void;
  onClose: () => void;
}) {
  const [catId, setCatId]           = useState(col.lookup?.categoryId ?? '');
  const [matchField, setMatchField] = useState(col.lookup?.matchField ?? 'id');
  const [displayField, setDisplay]  = useState(col.lookup?.displayField ?? '');

  const cat = categories.find((c) => c.id === catId);

  function handleSave() {
    if (!catId || !matchField || !displayField) return;
    const cat = categories.find((c) => c.id === catId)!;
    onSave({ categoryId: catId, categoryName: cat.name, matchField, displayField });
  }

  return (
    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-80">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">Link to Lookup Table</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Config Table</label>
          <select className="input text-sm" value={catId}
            onChange={(e) => { setCatId(e.target.value); setMatchField(''); setDisplay(''); }}>
            <option value="">— select —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {cat && (
          <>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Match column <span className="text-gray-400">(field whose value = raw data)</span>
              </label>
              <select className="input text-sm" value={matchField}
                onChange={(e) => setMatchField(e.target.value)}>
                <option value="">— select —</option>
                {cat.columns.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Show field <span className="text-gray-400">(what to display instead)</span>
              </label>
              <select className="input text-sm" value={displayField}
                onChange={(e) => setDisplay(e.target.value)}>
                <option value="">— select —</option>
                {cat.columns.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}
              </select>
            </div>
          </>
        )}
        <div className="flex gap-2 pt-1">
          {col.lookup && (
            <button onClick={() => onSave(undefined)} className="btn-danger text-xs flex-1">
              <X className="w-3 h-3" /> Remove link
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !catId || !matchField || !displayField}
            className="btn-primary text-xs flex-1"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
