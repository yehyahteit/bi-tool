import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Database, LayoutDashboard, Upload, TrendingUp, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: datasets }, { data: dashboards }] = await Promise.all([
    supabase
      .from('datasets')
      .select('id, name, status, row_count, created_at, file_type')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('dashboards')
      .select('id, name, created_at, updated_at')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false })
      .limit(5),
  ]);

  const stats = [
    { label: 'Datasets', value: datasets?.length ?? 0, icon: Database, color: 'text-blue-600 bg-blue-50' },
    { label: 'Dashboards', value: dashboards?.length ?? 0, icon: LayoutDashboard, color: 'text-purple-600 bg-purple-50' },
    { label: 'Total Rows', value: datasets?.reduce((a, d) => a + (d.row_count ?? 0), 0).toLocaleString() ?? '0', icon: TrendingUp, color: 'text-green-600 bg-green-50' },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-gray-500 mt-1">Here&apos;s an overview of your workspace.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link href="/upload" className="card p-5 flex items-center gap-4 hover:border-brand-200 hover:shadow-md transition-all group">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
            <Upload className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Upload Dataset</p>
            <p className="text-sm text-gray-500">Excel, CSV, JSON, TXT</p>
          </div>
        </Link>
        <Link href="/dashboards/new" className="card p-5 flex items-center gap-4 hover:border-brand-200 hover:shadow-md transition-all group">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
            <Plus className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">New Dashboard</p>
            <p className="text-sm text-gray-500">Drag, drop, and build</p>
          </div>
        </Link>
      </div>

      {/* Recent */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent datasets */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Datasets</h2>
            <Link href="/datasets" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {!datasets?.length && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No datasets yet</p>
            )}
            {datasets?.map((d) => (
              <Link key={d.id} href={`/datasets/${d.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{d.name}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent dashboards */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Dashboards</h2>
            <Link href="/dashboards" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {!dashboards?.length && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No dashboards yet</p>
            )}
            {dashboards?.map((d) => (
              <Link key={d.id} href={`/dashboards/${d.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{d.name}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
