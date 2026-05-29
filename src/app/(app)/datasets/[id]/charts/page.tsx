import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import ChartBuilderClient from './ChartBuilderClient';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ColumnSchema } from '@/types';

export default async function ChartsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: dataset } = await supabase
    .from('datasets')
    .select('*')
    .eq('id', id)
    .eq('user_id', user!.id)
    .single();

  if (!dataset) notFound();

  // Fetch first 2000 rows for chart building
  const { data: rowRecords } = await supabase
    .from('dataset_rows')
    .select('data')
    .eq('dataset_id', id)
    .order('row_index')
    .limit(2000);

  const rows = (rowRecords ?? []).map((r) => r.data as Record<string, unknown>);
  const columns: ColumnSchema[] = dataset.columns_schema ?? [];

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center gap-3">
        <Link href={`/datasets/${id}`} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Chart Builder</h1>
          <p className="text-sm text-gray-400">{dataset.name}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ChartBuilderClient
          datasetId={id}
          columns={columns}
          rows={rows}
          filtersParam={typeof sp.filters === 'string' ? sp.filters : undefined}
          hiddenColsParam={typeof sp.hiddenCols === 'string' ? sp.hiddenCols : undefined}
        />
      </div>
    </div>
  );
}
