'use client';

/**
 * LiveChartWidget — fetches its own rows from the dataset and keeps them fresh.
 *
 * - Fetches on mount.
 * - Re-fetches automatically every `refreshIntervalMs` (0 = disabled).
 * - Exposes a manual refresh button.
 * - Shows a "Data as of HH:MM" timestamp so the user knows how fresh the data is.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import ChartRenderer from '@/components/charts/ChartRenderer';
import type { Chart } from '@/types';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

interface LiveChartWidgetProps {
  chart: Chart;
  height?: number;
  forExport?: boolean;
  /** Auto-refresh interval in milliseconds. 0 = off. */
  refreshIntervalMs?: number;
  /** Bump this number to trigger an immediate re-fetch from the parent. */
  refreshKey?: number;
}

export default function LiveChartWidget({
  chart,
  height = 200,
  forExport = false,
  refreshIntervalMs = 0,
  refreshKey = 0,
}: LiveChartWidgetProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRows = useCallback(async (silent = false) => {
    if (!chart.dataset_id) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/datasets/${chart.dataset_id}/rows?page=1&pageSize=2000`);
      if (!res.ok) return;
      const json = await res.json();
      const fetched = (json.data ?? []).map((r: { data: Record<string, unknown> }) => r.data);
      setRows(fetched);
      setLastFetched(new Date());
    } catch {
      // non-critical — keep showing stale data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chart.dataset_id]);

  // Initial fetch
  useEffect(() => {
    fetchRows(false);
  }, [fetchRows]);

  // Global manual refresh — triggered when parent bumps refreshKey
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    fetchRows(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (refreshIntervalMs > 0) {
      intervalRef.current = setInterval(() => fetchRows(true), refreshIntervalMs);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshIntervalMs, fetchRows]);

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-300">
        <RefreshCw className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Freshness bar */}
      {!forExport && (
        <div className="flex items-center justify-between px-1 pb-1 flex-shrink-0">
          <span className="text-[10px] text-gray-300">
            {lastFetched ? `Data as of ${fmtTime(lastFetched)}` : ''}
          </span>
          <button
            onClick={() => fetchRows(true)}
            disabled={refreshing}
            title="Refresh data"
            className="text-gray-300 hover:text-brand-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-3 h-3', refreshing && 'animate-spin')} />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <ChartRenderer
          chartType={chart.chart_type}
          config={chart.config}
          rows={rows}
          height={height}
          forExport={forExport}
        />
      </div>
    </div>
  );
}
