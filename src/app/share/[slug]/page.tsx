import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import ChartRenderer from '@/components/charts/ChartRenderer';
import type { DashboardWidget, Chart } from '@/types';
import { BarChart3 } from 'lucide-react';

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: dashboard } = await supabase
    .from('dashboards')
    .select('*, dashboard_widgets(*, charts(*))')
    .eq('public_slug', slug)
    .eq('is_public', true)
    .single();

  if (!dashboard) notFound();

  const widgets: DashboardWidget[] = (dashboard.dashboard_widgets ?? []).map((w: DashboardWidget & { charts: Chart }) => ({
    ...w,
    chart: w.charts,
  }));

  // Fetch rows
  const rowDataMap: Record<string, Record<string, unknown>[]> = {};
  await Promise.all(
    widgets.filter((w) => w.chart?.dataset_id).map(async (w) => {
      const { data } = await supabase
        .from('dataset_rows')
        .select('data')
        .eq('dataset_id', w.chart!.dataset_id)
        .order('row_index')
        .limit(2000);
      if (w.chart_id) rowDataMap[w.chart_id] = (data ?? []).map((r) => r.data as Record<string, unknown>);
    })
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
          <BarChart3 className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{dashboard.name}</h1>
          {dashboard.description && <p className="text-sm text-gray-400">{dashboard.description}</p>}
        </div>
      </header>

      <div className="p-6 grid grid-cols-2 gap-4">
        {widgets.map((widget) => (
          <div key={widget.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-sm font-semibold text-gray-700">{widget.title ?? widget.chart?.name ?? 'Widget'}</span>
            </div>
            <div className="p-4">
              {widget.chart ? (
                <ChartRenderer
                  chartType={widget.chart.chart_type}
                  config={widget.chart.config}
                  rows={rowDataMap[widget.chart_id ?? ''] ?? []}
                  height={260}
                />
              ) : (
                <div className="text-center text-gray-400 py-8 text-sm">No data</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
