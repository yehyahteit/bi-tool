'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDashboardStore } from '@/store/dashboardStore';
import type { Dashboard, DashboardWidget, Chart, ColumnSchema } from '@/types';
import LiveChartWidget from './LiveChartWidget';
import ChartBuilder from '@/components/charts/ChartBuilder';
import { buildKPIValue } from '@/lib/chartData';
import {
  Save, Share2, Download, Plus, X, Loader2, FileImage, FileText as FilePdf,
  BarChart2, Link2, Pencil, Check, GripVertical, Maximize2, Minimize2,
  Copy, Globe, Lock, ExternalLink, RefreshCw, Type, Image as ImageIcon,
} from 'lucide-react';
import { exportDashboardToPNG, exportDashboardToPDF } from '@/lib/export/exportDashboard';
import { clsx } from 'clsx';

const REFRESH_OPTIONS = [
  { label: 'Off',     ms: 0 },
  { label: '1 min',   ms: 60_000 },
  { label: '5 min',   ms: 300_000 },
  { label: '15 min',  ms: 900_000 },
  { label: '30 min',  ms: 1_800_000 },
];

interface DashboardBuilderProps {
  dashboard: Dashboard;
  userCharts: Chart[];
  rowDataMap?: Record<string, Record<string, unknown>[]>; // kept for compat but no longer used
}

export default function DashboardBuilder({ dashboard, userCharts }: DashboardBuilderProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const {
    widgets, layout, isDirty,
    setDashboard, setWidgets, addWidget, removeWidget,
    updateLayout, markClean,
  } = useDashboardStore();

  const [saving, setSaving] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(dashboard.public_slug ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${dashboard.public_slug}` : null);
  const [isPublic, setIsPublic] = useState(dashboard.is_public);
  const [shareCopied, setShareCopied] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync isFullscreen state with the native fullscreen events
  // Also toggle body class so sidebar + header hide via CSS
  useEffect(() => {
    function onFsChange() {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      document.body.classList.toggle('fullscreen-mode', fs);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      // Clean up in case component unmounts while fullscreen
      document.body.classList.remove('fullscreen-mode');
    };
  }, []);

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {/* browser denied */ }
  }

  async function exitFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {/* ignore */ }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) exitFullscreen();
    else enterFullscreen();
  }
  const [isExporting, setIsExporting] = useState(false);
  // Track which KPI widget is being edited inline
  const [editingKpi, setEditingKpi] = useState<string | null>(null);
  const [kpiDraft, setKpiDraft] = useState<{ label: string; value: string }>({ label: '', value: '' });
  // Auto-refresh interval for all live chart widgets
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(0);
  // Bump this to force all LiveChartWidgets to re-fetch immediately
  const [globalRefreshKey, setGlobalRefreshKey] = useState(0);
  const [globalRefreshing, setGlobalRefreshing] = useState(false);

  async function refreshAll() {
    setGlobalRefreshing(true);
    setGlobalRefreshKey((k) => k + 1);
    // Give widgets time to start fetching, then clear the spinner
    await new Promise((r) => setTimeout(r, 800));
    setGlobalRefreshing(false);
  }

  // Chart edit slide-over
  const [editingChart, setEditingChart] = useState<Chart | null>(null);
  const [editColumns, setEditColumns] = useState<ColumnSchema[]>([]);
  const [editRows, setEditRows] = useState<Record<string, unknown>[]>([]);
  const [editLoading, setEditLoading] = useState(false);

  async function openEditChart(chart: Chart) {
    setEditingChart(chart);
    setEditLoading(true);
    try {
      const [dsRes, rowsRes] = await Promise.all([
        fetch(`/api/datasets/${chart.dataset_id}`),
        fetch(`/api/datasets/${chart.dataset_id}/rows?page=1&pageSize=2000`),
      ]);
      const dsJson = await dsRes.json();
      const rowsJson = await rowsRes.json();
      setEditColumns(dsJson.data?.columns_schema ?? []);
      setEditRows((rowsJson.data ?? []).map((r: { data: Record<string, unknown> }) => r.data));
    } finally {
      setEditLoading(false);
    }
  }

  function handleChartUpdated(updatedChart: Chart) {
    // Update the widget's chart reference in store so LiveChartWidget re-renders with new config
    useDashboardStore.setState((s) => ({
      widgets: s.widgets.map((w) =>
        w.chart_id === updatedChart.id ? { ...w, chart: updatedChart, title: updatedChart.name } : w
      ),
    }));
    setEditingChart(null);
  }

  // Only initialize once on mount — don't reset on re-renders
  useEffect(() => {
    setDashboard(dashboard);
    setWidgets(dashboard.widgets ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Measure container width
  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // F11 key triggers native fullscreen toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    setSaving(true);
    // Save layout positions
    await fetch(`/api/dashboards/${dashboard.id}/widgets`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgets: layout.map((l) => ({ id: l.i, position: { x: l.x, y: l.y, w: l.w, h: l.h } })),
      }),
    });
    // Save dashboard layout snapshot
    await fetch(`/api/dashboards/${dashboard.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout }),
    });
    markClean();
    setSaving(false);
  }

  async function handleAddChart(chart: Chart) {
    const res = await fetch(`/api/dashboards/${dashboard.id}/widgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart_id: chart.id,
        widget_type: 'chart',
        title: chart.name,
        position: { x: 0, y: 9999, w: 6, h: 4 },
      }),
    });
    const json = await res.json();
    if (res.ok) {
      addWidget({ ...json.data, chart });
      setShowAddPanel(false);
      // LiveChartWidget handles its own data fetching — no rowDataMap needed
    }
  }

  async function handleAddKPI() {
    const res = await fetch(`/api/dashboards/${dashboard.id}/widgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widget_type: 'kpi',
        title: 'KPI',
        config: { kpiLabel: 'Total', kpiValue: 0 },
        position: { x: 0, y: 9999, w: 3, h: 2 },
      }),
    });
    const json = await res.json();
    if (res.ok) {
      addWidget(json.data);
      setShowAddPanel(false);
    }
  }

  async function handleDuplicateWidget(widget: DashboardWidget) {
    const layoutItem = layout.find((l) => l.i === widget.id);
    const pos = layoutItem
      ? { x: layoutItem.x, y: layoutItem.y + layoutItem.h, w: layoutItem.w, h: layoutItem.h }
      : { x: 0, y: 9999, w: widget.position.w, h: widget.position.h };

    let clonedChart: Chart | undefined;

    // For chart widgets — clone the chart record first so it's fully independent
    if (widget.widget_type === 'chart' && widget.chart) {
      const src = widget.chart;
      const chartRes = await fetch('/api/charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: src.dataset_id,
          name: `${src.name} (copy)`,
          description: src.description,
          chart_type: src.chart_type,
          config: src.config,
        }),
      });
      const chartJson = await chartRes.json();
      if (!chartRes.ok) return;
      clonedChart = chartJson.data as Chart;
    }

    // Create the new widget pointing at the cloned chart (or same config for kpi/text/image)
    const widgetRes = await fetch(`/api/dashboards/${dashboard.id}/widgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart_id: clonedChart?.id ?? null,
        widget_type: widget.widget_type,
        title: clonedChart?.name ?? (widget.title ? `${widget.title} (copy)` : undefined),
        config: widget.config,
        position: pos,
      }),
    });
    const widgetJson = await widgetRes.json();
    if (widgetRes.ok) {
      addWidget({ ...widgetJson.data, chart: clonedChart });
    }
  }

  async function handleDeleteWidget(widgetId: string) {
    // Optimistically remove from local state
    removeWidget(widgetId);
    // Delete from DB
    await fetch(`/api/dashboards/${dashboard.id}/widgets/${widgetId}`, {
      method: 'DELETE',
    });
  }

  async function enableSharing() {
    const slug = dashboard.public_slug || Math.random().toString(36).slice(2, 10);
    await fetch(`/api/dashboards/${dashboard.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: true, public_slug: slug }),
    });
    const url = `${window.location.origin}/share/${slug}`;
    setShareUrl(url);
    setIsPublic(true);
  }

  async function disableSharing() {
    await fetch(`/api/dashboards/${dashboard.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: false }),
    });
    setIsPublic(false);
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function startEditKpi(widget: DashboardWidget) {
    setEditingKpi(widget.id);
    setKpiDraft({
      label: String(widget.config?.kpiLabel ?? 'Total'),
      value: String(widget.config?.kpiValue ?? 0),
    });
  }

  async function saveKpi(widgetId: string) {
    const numVal = parseFloat(kpiDraft.value) || 0;
    // Update in DB
    await fetch(`/api/dashboards/${dashboard.id}/widgets/${widgetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { kpiLabel: kpiDraft.label, kpiValue: numVal } }),
    });
    // Update local state
    useDashboardStore.setState((s) => ({
      widgets: s.widgets.map((w) =>
        w.id === widgetId
          ? { ...w, config: { ...w.config, kpiLabel: kpiDraft.label, kpiValue: numVal } }
          : w
      ),
      isDirty: true,
    }));
    setEditingKpi(null);
  }

  // ── Text widget ──────────────────────────────────────────────────────────────
  const [editingText, setEditingText] = useState<string | null>(null); // widget id
  const [textDraft, setTextDraft] = useState<{ content: string; fontSize: string; align: string; bold: boolean; color: string }>({
    content: '', fontSize: '14', align: 'left', bold: false, color: '#111827',
  });

  async function handleAddText() {
    const res = await fetch(`/api/dashboards/${dashboard.id}/widgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widget_type: 'text',
        title: 'Text',
        config: { content: 'Double-click to edit', fontSize: '14', align: 'left', bold: false, color: '#111827' },
        position: { x: 0, y: 9999, w: 4, h: 2 },
      }),
    });
    const json = await res.json();
    if (res.ok) { addWidget(json.data); setShowAddPanel(false); }
  }

  function startEditText(widget: DashboardWidget) {
    setEditingText(widget.id);
    setTextDraft({
      content: String(widget.config?.content ?? ''),
      fontSize: String(widget.config?.fontSize ?? '14'),
      align: String(widget.config?.align ?? 'left'),
      bold: Boolean(widget.config?.bold ?? false),
      color: String(widget.config?.color ?? '#111827'),
    });
  }

  async function saveText(widgetId: string) {
    await fetch(`/api/dashboards/${dashboard.id}/widgets/${widgetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: textDraft }),
    });
    useDashboardStore.setState((s) => ({
      widgets: s.widgets.map((w) => w.id === widgetId ? { ...w, config: { ...w.config, ...textDraft } } : w),
      isDirty: true,
    }));
    setEditingText(null);
  }

  // ── Image / Logo widget ───────────────────────────────────────────────────────
  const [editingImage, setEditingImage] = useState<string | null>(null); // widget id
  const [imageDraft, setImageDraft] = useState<{ src: string; alt: string; fit: string }>({
    src: '', alt: '', fit: 'contain',
  });
  const imageFileRef = useRef<HTMLInputElement>(null);

  async function handleAddImage() {
    const res = await fetch(`/api/dashboards/${dashboard.id}/widgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widget_type: 'image',
        title: 'Image',
        config: { src: '', alt: '', fit: 'contain' },
        position: { x: 0, y: 9999, w: 3, h: 3 },
      }),
    });
    const json = await res.json();
    if (res.ok) { addWidget(json.data); setShowAddPanel(false); }
  }

  function startEditImage(widget: DashboardWidget) {
    setEditingImage(widget.id);
    setImageDraft({
      src: String(widget.config?.src ?? ''),
      alt: String(widget.config?.alt ?? ''),
      fit: String(widget.config?.fit ?? 'contain'),
    });
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImageDraft((d) => ({ ...d, src: String(ev.target?.result ?? '') }));
    reader.readAsDataURL(file);
  }

  async function saveImage(widgetId: string) {
    await fetch(`/api/dashboards/${dashboard.id}/widgets/${widgetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: imageDraft }),
    });
    useDashboardStore.setState((s) => ({
      widgets: s.widgets.map((w) => w.id === widgetId ? { ...w, config: { ...w.config, ...imageDraft } } : w),
      isDirty: true,
    }));
    setEditingImage(null);
  }

  const onLayoutChange = useCallback((newLayout: Layout[]) => {
    updateLayout(newLayout);
  }, [updateLayout]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Fullscreen header — name + key action buttons */}
      {isFullscreen && (
        <div className="flex-shrink-0 flex items-center justify-between px-2 py-1">
          <h1 className="text-lg font-bold text-gray-900">{dashboard.name}</h1>
          <div className="flex items-center gap-2">
            {/* Manual refresh all */}
            <button
              onClick={refreshAll}
              disabled={globalRefreshing}
              className="btn-secondary"
              title="Refresh all charts now"
            >
              <RefreshCw className={clsx('w-4 h-4', globalRefreshing && 'animate-spin')} />
              Refresh
            </button>

            {/* Auto-refresh */}
            <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
              <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={refreshIntervalMs}
                onChange={(e) => setRefreshIntervalMs(Number(e.target.value))}
                className="text-xs text-gray-600 bg-transparent outline-none cursor-pointer"
                title="Auto-refresh interval"
              >
                {REFRESH_OPTIONS.map((o) => (
                  <option key={o.ms} value={o.ms}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Export */}
            <div className="relative">
              <button onClick={() => setExportOpen(!exportOpen)} className="btn-secondary">
                <Download className="w-4 h-4" /> Export
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1 w-40">
                  <button onClick={async () => {
                    if (!scrollContainerRef.current) return;
                    setExportOpen(false);
                    setIsExporting(true);
                    await new Promise((r) => requestAnimationFrame(r));
                    await new Promise((r) => requestAnimationFrame(r));
                    await new Promise((r) => setTimeout(r, 1500));
                    await exportDashboardToPNG(scrollContainerRef.current, dashboard.name);
                    setIsExporting(false);
                  }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
                    <FileImage className="w-4 h-4" /> PNG
                  </button>
                  <button onClick={async () => {
                    if (!scrollContainerRef.current) return;
                    setExportOpen(false);
                    setIsExporting(true);
                    await new Promise((r) => requestAnimationFrame(r));
                    await new Promise((r) => requestAnimationFrame(r));
                    await new Promise((r) => setTimeout(r, 1500));
                    await exportDashboardToPDF(scrollContainerRef.current, dashboard.name);
                    setIsExporting(false);
                  }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
                    <FilePdf className="w-4 h-4" /> PDF
                  </button>
                </div>
              )}
            </div>

            {/* Share */}
            <button onClick={() => setShowShareModal(true)} className="btn-secondary">
              <Share2 className="w-4 h-4" /> Share
            </button>

            {/* Exit fullscreen */}
            <button onClick={toggleFullscreen} className="btn-secondary" title="Exit fullscreen (Esc)">
              <Minimize2 className="w-4 h-4" /> Exit
            </button>
          </div>
        </div>
      )}

      {/* Toolbar — hidden in fullscreen */}
      {!isFullscreen && (
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddPanel(!showAddPanel)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Widget
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>}

          {/* Manual refresh all */}
          <button
            onClick={refreshAll}
            disabled={globalRefreshing}
            className="btn-secondary"
            title="Refresh all charts now"
          >
            <RefreshCw className={clsx('w-4 h-4', globalRefreshing && 'animate-spin')} />
            Refresh
          </button>

          {/* Auto-refresh selector */}
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={refreshIntervalMs}
              onChange={(e) => setRefreshIntervalMs(Number(e.target.value))}
              className="text-xs text-gray-600 bg-transparent outline-none cursor-pointer"
              title="Auto-refresh interval"
            >
              {REFRESH_OPTIONS.map((o) => (
                <option key={o.ms} value={o.ms}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Fullscreen toggle — native browser Fullscreen API */}
          <button
            onClick={toggleFullscreen}
            className="btn-secondary"
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (F11)'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>

          <div className="relative">
            <button onClick={() => setExportOpen(!exportOpen)} className="btn-secondary">
              <Download className="w-4 h-4" /> Export
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1 w-40">
                <button onClick={async () => {
                  if (!scrollContainerRef.current) return;
                  setExportOpen(false);
                  setIsExporting(true);
                  await new Promise((r) => requestAnimationFrame(r));
                  await new Promise((r) => requestAnimationFrame(r));
                  await new Promise((r) => setTimeout(r, 800));
                  await exportDashboardToPNG(scrollContainerRef.current, dashboard.name);
                  setIsExporting(false);
                }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
                  <FileImage className="w-4 h-4" /> PNG
                </button>
                <button onClick={async () => {
                  if (!scrollContainerRef.current) return;
                  setExportOpen(false);
                  setIsExporting(true);
                  await new Promise((r) => requestAnimationFrame(r));
                  await new Promise((r) => requestAnimationFrame(r));
                  await new Promise((r) => setTimeout(r, 800));
                  await exportDashboardToPDF(scrollContainerRef.current, dashboard.name);
                  setIsExporting(false);
                }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
                  <FilePdf className="w-4 h-4" /> PDF
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setShowShareModal(true)} className="btn-secondary">
            <Share2 className="w-4 h-4" /> Share
          </button>
          <button onClick={handleSave} disabled={saving || !isDirty} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
      )} {/* end !isFullscreen toolbar */}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowShareModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Share Dashboard</h2>
              <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Public toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mb-4">
              <div className="flex items-center gap-3">
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center', isPublic ? 'bg-green-100' : 'bg-gray-200')}>
                  {isPublic ? <Globe className="w-4 h-4 text-green-600" /> : <Lock className="w-4 h-4 text-gray-500" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{isPublic ? 'Public link enabled' : 'Private'}</p>
                  <p className="text-xs text-gray-400">{isPublic ? 'Anyone with the link can view' : 'Only you can access this dashboard'}</p>
                </div>
              </div>
              <button
                onClick={isPublic ? disableSharing : enableSharing}
                className={clsx(
                  'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                  isPublic ? 'bg-brand-600' : 'bg-gray-300'
                )}
              >
                <span className={clsx(
                  'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  isPublic ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>

            {/* Share URL */}
            {isPublic && shareUrl && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <Link2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-600 truncate flex-1 font-mono">{shareUrl}</span>
                  <button
                    onClick={copyShareUrl}
                    className={clsx(
                      'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all flex-shrink-0',
                      shareCopied ? 'bg-green-100 text-green-700' : 'bg-brand-600 text-white hover:bg-brand-700'
                    )}
                  >
                    {shareCopied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                </a>
              </div>
            )}

            {!isPublic && (
              <p className="text-sm text-gray-400 text-center py-2">Enable the public link above to share this dashboard.</p>
            )}
          </div>
        </div>
      )}

      {/* Add widget panel — hidden in fullscreen */}
      {showAddPanel && !isFullscreen && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Add Widget</h3>
            <button onClick={() => setShowAddPanel(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Quick-add widget types */}
          <p className="text-xs text-gray-400 mb-2">Content blocks</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button onClick={handleAddKPI}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-all text-xs font-medium text-gray-600 hover:text-brand-700">
              <BarChart2 className="w-5 h-5 text-brand-500" />
              KPI Card
            </button>
            <button onClick={handleAddText}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-all text-xs font-medium text-gray-600 hover:text-brand-700">
              <Type className="w-5 h-5 text-violet-500" />
              Text / Title
            </button>
            <button onClick={handleAddImage}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-all text-xs font-medium text-gray-600 hover:text-brand-700">
              <ImageIcon className="w-5 h-5 text-teal-500" />
              Image / Logo
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-2">Add a chart</p>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {userCharts.map((chart) => (
              <button
                key={chart.id}
                onClick={() => handleAddChart(chart)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:border-brand-200 hover:bg-brand-50 text-sm text-left transition-all"
              >
                <BarChart2 className="w-4 h-4 text-brand-500 flex-shrink-0" />
                <span className="truncate text-gray-700">{chart.name}</span>
              </button>
            ))}
            {!userCharts.length && (
              <p className="col-span-2 text-xs text-gray-400 py-4 text-center">No charts yet — build some first.</p>
            )}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto bg-gray-100 rounded-xl border border-gray-200 p-4">
        <div ref={canvasRef}>
          {widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-gray-300">
              <BarChart2 className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium">Empty dashboard</p>
              <p className="text-sm mt-1">Click &ldquo;Add Widget&rdquo; to get started</p>
            </div>
          ) : (
            <GridLayout
              layout={layout}
              cols={12}
              rowHeight={80}
              width={containerWidth - 32}
              onLayoutChange={onLayoutChange}
              draggableHandle=".drag-handle"
              resizeHandles={['se']}
              isDraggable
              isResizable
              useCSSTransforms
              margin={[12, 12]}
            >
              {widgets.map((widget) => {
                const isEditingThisKpi = editingKpi === widget.id;
                const isFrameless = widget.widget_type === 'text' || widget.widget_type === 'image';

                // ── Frameless widgets (text / image) ──────────────────────────
                if (isFrameless) {
                  const isEditingThis = editingText === widget.id || editingImage === widget.id;
                  return (
                    <div key={widget.id} data-widget className="relative group/fw overflow-hidden">
                      {/* Invisible drag handle — three regions that avoid the bottom-right 24×24 resize grip */}
                      {!isEditingThis && (
                        <>
                          {/* Top strip — full width */}
                          <span className="drag-handle absolute top-0 left-0 right-0 z-10 cursor-grab active:cursor-grabbing" style={{ height: 'calc(100% - 24px)' }} />
                          {/* Bottom strip — only left portion, leaves right 24px free for resize */}
                          <span className="drag-handle absolute bottom-0 left-0 z-10 cursor-grab active:cursor-grabbing" style={{ height: 24, right: 24 }} />
                        </>
                      )}

                      {/* Hover controls — only visible outside fullscreen & export */}
                      {!isFullscreen && !isExporting && !isEditingThis && (
                        <div className="absolute top-1 right-1 z-20 flex items-center gap-1 opacity-0 group-hover/fw:opacity-100 transition-opacity">
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (widget.widget_type === 'text') startEditText(widget);
                              else startEditImage(widget);
                            }}
                            className="bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm rounded-md p-1 text-gray-400 hover:text-brand-500 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); handleDuplicateWidget(widget); }}
                            className="bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm rounded-md p-1 text-gray-400 hover:text-brand-500 transition-colors"
                            title="Duplicate"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); handleDeleteWidget(widget.id); }}
                            className="bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm rounded-md p-1 text-gray-400 hover:text-red-400 transition-colors"
                            title="Remove"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {/* Content */}
                      <div className="w-full h-full">
                        {widget.widget_type === 'text' ? (
                          editingText === widget.id ? (
                            /* Text editor */
                            <div className="flex flex-col h-full gap-2 p-2 bg-white rounded-xl border border-violet-200 shadow-sm">
                              <textarea
                                className="input flex-1 resize-none text-sm"
                                value={textDraft.content}
                                onChange={(e) => setTextDraft((d) => ({ ...d, content: e.target.value }))}
                                placeholder="Enter text…"
                                autoFocus
                              />
                              <div className="flex items-center gap-2 flex-wrap">
                                <select
                                  value={textDraft.fontSize}
                                  onChange={(e) => setTextDraft((d) => ({ ...d, fontSize: e.target.value }))}
                                  className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white outline-none"
                                >
                                  {['10','12','14','16','18','22','28','36','48'].map((s) => (
                                    <option key={s} value={s}>{s}px</option>
                                  ))}
                                </select>
                                <select
                                  value={textDraft.align}
                                  onChange={(e) => setTextDraft((d) => ({ ...d, align: e.target.value }))}
                                  className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white outline-none"
                                >
                                  <option value="left">Left</option>
                                  <option value="center">Center</option>
                                  <option value="right">Right</option>
                                </select>
                                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                                  <input type="checkbox" checked={textDraft.bold} onChange={(e) => setTextDraft((d) => ({ ...d, bold: e.target.checked }))} />
                                  Bold
                                </label>
                                <input type="color" value={textDraft.color} onChange={(e) => setTextDraft((d) => ({ ...d, color: e.target.value }))} className="w-6 h-6 rounded cursor-pointer border-0" title="Text color" />
                                <button onClick={() => saveText(widget.id)} className="btn-primary text-xs py-1 px-3 ml-auto"><Check className="w-3 h-3" /> Save</button>
                                <button onClick={() => setEditingText(null)} className="btn-secondary text-xs py-1 px-3">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            /* Text display — raw, no frame */
                            <div
                              className="w-full h-full flex items-center"
                              onDoubleClick={() => !isFullscreen && startEditText(widget)}
                            >
                              <p style={{
                                fontSize: `${widget.config?.fontSize ?? 14}px`,
                                textAlign: (widget.config?.align as React.CSSProperties['textAlign']) ?? 'left',
                                fontWeight: widget.config?.bold ? 700 : 400,
                                color: String(widget.config?.color ?? '#111827'),
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                width: '100%',
                              }}>
                                {String(widget.config?.content ?? '')}
                              </p>
                            </div>
                          )
                        ) : (
                          /* Image widget */
                          editingImage === widget.id ? (
                            <div className="flex flex-col h-full gap-3 p-3 bg-white rounded-xl border border-teal-200 shadow-sm overflow-auto">
                              <div>
                                <p className="text-xs font-medium text-gray-600 mb-1">Upload file</p>
                                <input ref={imageFileRef} type="file" accept="image/*" onChange={handleImageFile} className="text-xs text-gray-600" />
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-600 mb-1">Or paste image URL</p>
                                <input className="input text-xs" value={imageDraft.src.startsWith('data:') ? '' : imageDraft.src} onChange={(e) => setImageDraft((d) => ({ ...d, src: e.target.value }))} placeholder="https://…" />
                              </div>
                              <div className="flex gap-3">
                                <div className="flex-1">
                                  <p className="text-xs font-medium text-gray-600 mb-1">Alt text</p>
                                  <input className="input text-xs" value={imageDraft.alt} onChange={(e) => setImageDraft((d) => ({ ...d, alt: e.target.value }))} placeholder="Description…" />
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-gray-600 mb-1">Fit</p>
                                  <select value={imageDraft.fit} onChange={(e) => setImageDraft((d) => ({ ...d, fit: e.target.value }))} className="input text-xs py-1">
                                    <option value="contain">Contain</option>
                                    <option value="cover">Cover</option>
                                    <option value="fill">Fill</option>
                                  </select>
                                </div>
                              </div>
                              {imageDraft.src && <img src={imageDraft.src} alt="preview" className="max-h-24 rounded object-contain mx-auto" />}
                              <div className="flex gap-2 mt-auto">
                                <button onClick={() => saveImage(widget.id)} className="btn-primary text-xs py-1 px-3"><Check className="w-3 h-3" /> Save</button>
                                <button onClick={() => setEditingImage(null)} className="btn-secondary text-xs py-1 px-3">Cancel</button>
                              </div>
                            </div>
                          ) : widget.config?.src ? (
                            /* Image display — raw, no frame */
                            <div className="w-full h-full flex items-center justify-center" onDoubleClick={() => !isFullscreen && startEditImage(widget)}>
                              <img
                                src={String(widget.config.src)}
                                alt={String(widget.config?.alt ?? '')}
                                style={{ objectFit: (widget.config?.fit as React.CSSProperties['objectFit']) ?? 'contain', maxWidth: '100%', maxHeight: '100%' }}
                              />
                            </div>
                          ) : (
                            /* Empty image placeholder — only visible outside fullscreen */
                            !isFullscreen && (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-300 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-teal-300 hover:text-teal-400 transition-colors" onDoubleClick={() => startEditImage(widget)}>
                                <ImageIcon className="w-8 h-8" />
                                <p className="text-xs">Double-click to add image</p>
                              </div>
                            )
                          )
                        )}
                      </div>
                    </div>
                  );
                }

                // ── Framed widgets (chart / kpi) ──────────────────────────────
                return (
                  <div key={widget.id} data-widget className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
                    {/* Widget header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-xl select-none">
                      <span className="drag-handle flex items-center gap-1.5 flex-1 min-w-0 cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                        <span data-widget-title className="text-xs font-semibold text-gray-600 truncate">
                          {widget.title ?? widget.chart?.name ?? 'Widget'}
                        </span>
                      </span>
                      {!isFullscreen && (
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          {widget.widget_type === 'chart' && widget.chart && (
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); openEditChart(widget.chart!); }} className="text-gray-300 hover:text-brand-500 transition-colors p-0.5" title="Edit chart">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {widget.widget_type === 'kpi' && (
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); startEditKpi(widget); }} className="text-gray-300 hover:text-brand-500 transition-colors p-0.5" title="Edit KPI">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleDuplicateWidget(widget); }} className="text-gray-300 hover:text-brand-500 transition-colors p-0.5" title="Duplicate widget">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleDeleteWidget(widget.id); }} className="text-gray-300 hover:text-red-400 transition-colors p-0.5" title="Remove widget">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Widget content */}
                    <div className="flex-1 min-h-0 overflow-hidden p-2">
                      {widget.widget_type === 'chart' && widget.chart ? (
                        <LiveChartWidget
                          key={widget.chart.updated_at ?? widget.chart.id}
                          chart={widget.chart}
                          height={200}
                          forExport={isExporting}
                          refreshIntervalMs={refreshIntervalMs}
                          refreshKey={globalRefreshKey}
                        />
                      ) : widget.widget_type === 'chart' && !widget.chart ? (
                        /* No chart linked — let user pick one */
                        <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
                          <BarChart2 className="w-7 h-7 text-gray-200" />
                          <p className="text-xs text-gray-400 font-medium">No chart linked</p>
                          {!isFullscreen && userCharts.length > 0 && (
                            <div className="w-full max-w-[220px] max-h-32 overflow-y-auto flex flex-col gap-1 mt-1">
                              {userCharts.map((c) => (
                                <button
                                  key={c.id}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await fetch(`/api/dashboards/${dashboard.id}/widgets/${widget.id}`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ chart_id: c.id, title: c.name }),
                                    });
                                    useDashboardStore.setState((s) => ({
                                      widgets: s.widgets.map((w) =>
                                        w.id === widget.id ? { ...w, chart_id: c.id, chart: c, title: c.name } : w
                                      ),
                                    }));
                                  }}
                                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-brand-300 hover:bg-brand-50 text-gray-600 hover:text-brand-700 truncate text-left transition-all"
                                >
                                  {c.name}
                                </button>
                              ))}
                            </div>
                          )}
                          {!isFullscreen && userCharts.length === 0 && (
                            <p className="text-xs text-gray-300 text-center">Build a chart first, then link it here.</p>
                          )}
                        </div>
                      ) : widget.widget_type === 'kpi' ? (
                        isEditingThisKpi ? (
                          /* Inline KPI editor */
                          <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
                            <input
                              className="input text-center text-2xl font-bold h-10"
                              type="number"
                              value={kpiDraft.value}
                              onChange={(e) => setKpiDraft((d) => ({ ...d, value: e.target.value }))}
                              placeholder="Value"
                              autoFocus
                            />
                            <input
                              className="input text-center text-xs h-8"
                              type="text"
                              value={kpiDraft.label}
                              onChange={(e) => setKpiDraft((d) => ({ ...d, label: e.target.value }))}
                              placeholder="Label"
                            />
                            <button
                              onClick={() => saveKpi(widget.id)}
                              className="btn-primary text-xs py-1 px-3"
                            >
                              <Check className="w-3 h-3" /> Save
                            </button>
                          </div>
                        ) : (
                          /* KPI display */
                          <div
                            className="flex flex-col items-center justify-center h-full cursor-pointer group"
                            onClick={() => startEditKpi(widget)}
                            title="Click to edit"
                          >
                            <p className="text-3xl font-bold text-gray-900 group-hover:text-brand-600 transition-colors">
                              {Number(widget.config?.kpiValue ?? 0).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">{String(widget.config?.kpiLabel ?? 'KPI')}</p>
                            <p className="text-[10px] text-gray-300 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              Click to edit
                            </p>
                          </div>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </GridLayout>
          )}
        </div>
      </div>

      {/* ── Chart Edit Slide-over ── */}
      {editingChart && (
        <div className="fixed inset-0 z-[300] flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setEditingChart(null)}
          />
          {/* Panel */}
          <div className="relative ml-auto w-full max-w-6xl bg-gray-50 h-full flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Edit Chart</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editingChart.name}</p>
              </div>
              <button
                onClick={() => setEditingChart(null)}
                className="text-gray-400 hover:text-gray-700 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Body */}
            <div className="flex-1 min-h-0 overflow-auto p-4">
              {editLoading ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading dataset…
                </div>
              ) : (
                <ChartBuilder
                  datasetId={editingChart.dataset_id}
                  columns={editColumns}
                  rows={editRows}
                  initialChart={editingChart}
                  onUpdate={handleChartUpdated}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
