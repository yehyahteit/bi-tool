'use client';

import ChartBuilder from '@/components/charts/ChartBuilder';
import type { ColumnSchema, ChartFilter } from '@/types';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

interface Props {
  datasetId: string;
  columns: ColumnSchema[];
  rows: Record<string, unknown>[];
  /** Raw JSON string for pre-filters, passed from the server page */
  filtersParam?: string;
  /** Raw JSON string for hidden column names, passed from the server page */
  hiddenColsParam?: string;
}

export default function ChartBuilderClient({ datasetId, columns, rows, filtersParam, hiddenColsParam }: Props) {
  const router = useRouter();

  // Parse pre-filters
  const preFilters = useMemo<ChartFilter[]>(() => {
    if (!filtersParam) return [];
    try { return JSON.parse(decodeURIComponent(filtersParam)) as ChartFilter[]; }
    catch { return []; }
  }, [filtersParam]);

  // Parse hidden columns — filter them out of the columns list
  const visibleColumns = useMemo<ColumnSchema[]>(() => {
    if (!hiddenColsParam) return columns;
    try {
      const hidden = JSON.parse(decodeURIComponent(hiddenColsParam)) as string[];
      if (!hidden.length) return columns;
      return columns.filter((c) => !hidden.includes(c.name));
    } catch {
      return columns;
    }
  }, [columns, hiddenColsParam]);

  return (
    <ChartBuilder
      datasetId={datasetId}
      columns={visibleColumns}
      rows={rows}
      initialFilters={preFilters}
      onSave={() => router.refresh()}
    />
  );
}
