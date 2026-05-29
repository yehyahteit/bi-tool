import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import DashboardBuilder from '@/components/dashboard/DashboardBuilder';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Chart, DashboardWidget } from '@/types';

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: dashboard } = await supabase
    .from('dashboards')
    .select('*, dashboard_widgets(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!dashboard) notFound();

  // Fetch all user charts explicitly (avoids RLS join issues through dashboard_widgets)
  const { data: allCharts } = await supabase
    .from('charts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const userCharts: Chart[] = allCharts ?? [];
  const chartMap: Record<string, Chart> = {};
  for (const c of userCharts) chartMap[c.id] = c;

  // Attach chart to each widget using the chart map
  const widgets: DashboardWidget[] = dashboard.dashboard_widgets ?? [];
  const normalizedWidgets: DashboardWidget[] = widgets.map((w) => ({
    ...w,
    chart: w.chart_id ? (chartMap[w.chart_id] ?? undefined) : undefined,
  }));

  const rowDataMap: Record<string, Record<string, unknown>[]> = {};

  const dashboardWithWidgets = { ...dashboard, widgets: normalizedWidgets };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboards" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{dashboard.name}</h1>
          {dashboard.description && <p className="text-sm text-gray-400">{dashboard.description}</p>}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <DashboardBuilder
          dashboard={dashboardWithWidgets}
          userCharts={userCharts ?? []}
          rowDataMap={rowDataMap}
        />
      </div>
    </div>
  );
}
