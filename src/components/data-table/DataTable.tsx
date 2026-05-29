'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import type { ColumnSchema } from '@/types';
import TypeBadge from './TypeBadge';
import {
  ChevronUp, ChevronDown, ChevronsUpDown, Loader2,
  ChevronLeft, ChevronRight, Link2, Columns, Check, Eye, EyeOff,
} from 'lucide-react';
import { clsx } from 'clsx';

interface DataTableProps {
  datasetId: string;
  columns: ColumnSchema[];
  totalRows: number;
  lookupMap?: Record<string, Record<string, string>>;
  preloadedRows?: Record<string, unknown>[];
  /** Controlled column visibility — lifted to parent so it can be passed to chart builder */
  colVisibility?: VisibilityState;
  onColVisibilityChange?: (v: VisibilityState) => void;
}

export default function DataTable({ datasetId, columns, totalRows, lookupMap = {}, preloadedRows, colVisibility: externalVisibility, onColVisibilityChange }: DataTableProps) {
  const [rows, setRows]             = useState<Record<string, unknown>[]>([]);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(false);
  const [sorting, setSorting]       = useState<SortingState>([]);
  const [internalVisibility, setInternalVisibility] = useState<VisibilityState>({});
  const colVisibility = externalVisibility ?? internalVisibility;
  const setColVisibility = (v: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
    const next = typeof v === 'function' ? v(colVisibility) : v;
    if (onColVisibilityChange) onColVisibilityChange(next);
    else setInternalVisibility(next);
  };
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [colSearch, setColSearch]   = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 100;

  // Close picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchRows = useCallback(async (p: number) => {
    if (preloadedRows) return;
    setLoading(true);
    const res = await fetch(`/api/datasets/${datasetId}/rows?page=${p}&pageSize=${PAGE_SIZE}`);
    const json = await res.json();
    setRows((json.data ?? []).map((r: { data: Record<string, unknown> }) => r.data));
    setLoading(false);
  }, [datasetId, preloadedRows]);

  useEffect(() => { fetchRows(page); }, [fetchRows, page]);

  useEffect(() => {
    if (!preloadedRows) return;
    const start = (page - 1) * PAGE_SIZE;
    setRows(preloadedRows.slice(start, start + PAGE_SIZE));
  }, [preloadedRows, page]);

  const colDefs: ColumnDef<Record<string, unknown>>[] = columns.map((col) => {
    const colLookup = col.lookup ? lookupMap[col.lookup.categoryId] : undefined;
    return {
      id: col.name,
      accessorKey: col.name,
      header: () => (
        <div className="flex items-center gap-1.5">
          <span className="truncate max-w-[120px]">{col.name}</span>
          <TypeBadge type={col.type} />
          {col.lookup && (
            <span className="flex items-center gap-0.5 text-[9px] text-green-600 font-medium bg-green-50 px-1 rounded">
              <Link2 className="w-2 h-2" />{col.lookup.categoryName}
            </span>
          )}
        </div>
      ),
      cell: ({ getValue }) => {
        const val = getValue();
        if (val === null || val === undefined) return <span className="text-gray-300 italic text-xs">null</span>;
        if (typeof val === 'boolean') return <span className={val ? 'text-green-600' : 'text-red-500'}>{String(val)}</span>;
        const raw = String(val);
        if (colLookup) {
          const label = colLookup[raw];
          if (label) return (
            <span className="flex items-center gap-1.5">
              <span className="text-gray-800 font-medium truncate max-w-[180px] block">{label}</span>
              <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">({raw})</span>
            </span>
          );
        }
        return <span className="truncate max-w-[200px] block">{raw}</span>;
      },
    };
  });

  const table = useReactTable({
    data: rows,
    columns: colDefs,
    state: { sorting, columnVisibility: colVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
  });

  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const hiddenCount = Object.values(colVisibility).filter((v) => v === false).length;
  const filteredColList = columns.filter((c) =>
    c.name.toLowerCase().includes(colSearch.toLowerCase())
  );

  function showAll() { setColVisibility({}); }
  function hideAll() {
    const vis: VisibilityState = {};
    columns.forEach((c) => { vis[c.name] = false; });
    setColVisibility(vis);
  }

  return (
    <div className="flex flex-col h-full">

      {/* Column visibility toolbar */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">
          {table.getVisibleLeafColumns().length} of {columns.length} columns visible
          {hiddenCount > 0 && <span className="ml-1 text-amber-500">· {hiddenCount} hidden</span>}
        </span>

        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setColPickerOpen((o) => !o)}
            className={clsx(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all',
              colPickerOpen || hiddenCount > 0
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50/40'
            )}
          >
            <Columns className="w-3.5 h-3.5" />
            Columns
            {hiddenCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-600 text-white text-[9px] font-bold">
                {hiddenCount}
              </span>
            )}
          </button>

          {colPickerOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-64 py-2">
              {/* Search */}
              <div className="px-3 pb-2">
                <input
                  autoFocus
                  className="input text-xs w-full"
                  placeholder="Search columns…"
                  value={colSearch}
                  onChange={(e) => setColSearch(e.target.value)}
                />
              </div>

              {/* Show all / Hide all */}
              <div className="flex items-center gap-2 px-3 pb-2 border-b border-gray-100">
                <button onClick={showAll} className="flex items-center gap-1 text-[11px] text-brand-600 hover:underline">
                  <Eye className="w-3 h-3" /> Show all
                </button>
                <span className="text-gray-300">·</span>
                <button onClick={hideAll} className="flex items-center gap-1 text-[11px] text-gray-400 hover:underline">
                  <EyeOff className="w-3 h-3" /> Hide all
                </button>
              </div>

              {/* Column list */}
              <div className="max-h-64 overflow-y-auto">
                {filteredColList.map((col) => {
                  const isVisible = colVisibility[col.name] !== false;
                  return (
                    <div
                      key={col.name}
                      onClick={() => setColVisibility((v) => ({ ...v, [col.name]: !isVisible }))}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer select-none"
                    >
                      <div className={clsx(
                        'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all',
                        isVisible ? 'bg-brand-600 border-brand-600' : 'border-gray-300 bg-white'
                      )}>
                        {isVisible && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="text-xs text-gray-700 flex-1 truncate">{col.name}</span>
                      <TypeBadge type={col.type} />
                    </div>
                  );
                })}
                {filteredColList.length === 0 && (
                  <p className="text-xs text-gray-400 px-3 py-2">No columns match</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 w-12">#</th>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      onClick={h.column.getToggleSortingHandler()}
                      className="px-3 py-2 text-left text-xs font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {{
                          asc:  <ChevronUp className="w-3 h-3 text-brand-500" />,
                          desc: <ChevronDown className="w-3 h-3 text-brand-500" />,
                        }[h.column.getIsSorted() as string] ?? (
                          <ChevronsUpDown className="w-3 h-3 text-gray-300" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={clsx('border-b border-gray-50 hover:bg-gray-50 transition-colors', i % 2 === 0 ? '' : 'bg-gray-50/40')}
                >
                  <td className="px-3 py-1.5 text-xs text-gray-300 font-mono">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-1.5 text-gray-700 max-w-[260px]">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
        <span>{totalRows.toLocaleString()} rows · {columns.length} columns</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs">Page {page} of {totalPages || 1}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
