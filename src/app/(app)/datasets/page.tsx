'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Database, Plus, FileSpreadsheet, FileText, File,
  BarChart2, Pencil, Trash2, Loader2, Check, X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Dataset } from '@/types';
import { clsx } from 'clsx';

function statusBadge(status: Dataset['status']) {
  const map = {
    ready:      'bg-green-50 text-green-700',
    processing: 'bg-yellow-50 text-yellow-700',
    pending:    'bg-gray-50 text-gray-500',
    error:      'bg-red-50 text-red-700',
  };
  return <span className={`badge ${map[status]}`}>{status}</span>;
}

function fileIcon(type: string) {
  if (type === 'xlsx' || type === 'xls') return FileSpreadsheet;
  if (type === 'csv'  || type === 'txt') return FileText;
  return File;
}

interface DatasetWithCount extends Dataset {
  chartCount: number;
}

export default function DatasetsPage() {
  const router = useRouter();
  const [datasets, setDatasets]   = useState<DatasetWithCount[]>([]);
  const [loading, setLoading]     = useState(true);

  // Rename state
  const [renamingId, setRenamingId]     = useState<string | null>(null);
  const [renameDraft, setRenameDraft]   = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting]               = useState(false);

  useEffect(() => {
    async function load() {
      const [dsRes, chartsRes] = await Promise.all([
        fetch('/api/datasets'),
        fetch('/api/charts'),
      ]);
      const dsJson     = await dsRes.json();
      const chartsJson = await chartsRes.json();

      // Build chart count map
      const countMap: Record<string, number> = {};
      for (const c of chartsJson.data ?? []) {
        countMap[c.dataset_id] = (countMap[c.dataset_id] ?? 0) + 1;
      }

      setDatasets(
        (dsJson.data ?? []).map((d: Dataset) => ({ ...d, chartCount: countMap[d.id] ?? 0 }))
      );
      setLoading(false);
    }
    load();
  }, []);

  async function handleRename(id: string) {
    if (!renameDraft.trim()) return;
    setRenameSaving(true);
    await fetch(`/api/datasets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameDraft.trim() }),
    });
    setDatasets((prev) => prev.map((d) => d.id === id ? { ...d, name: renameDraft.trim() } : d));
    setRenameSaving(false);
    setRenamingId(null);
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await fetch(`/api/datasets/${id}`, { method: 'DELETE' });
    setDatasets((prev) => prev.filter((d) => d.id !== id));
    setDeleting(false);
    setConfirmDeleteId(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-300">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading datasets…
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Datasets</h1>
          <p className="text-sm text-gray-500 mt-1">{datasets.length} datasets in your workspace</p>
        </div>
        <Link href="/upload" className="btn-primary">
          <Plus className="w-4 h-4" /> Upload New
        </Link>
      </div>

      {datasets.length === 0 ? (
        <div className="card p-16 text-center">
          <Database className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No datasets yet</p>
          <Link href="/upload" className="btn-primary mt-4 inline-flex">Upload your first dataset</Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Rows</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Columns</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Charts</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {datasets.map((d) => {
                const Icon          = fileIcon(d.file_type);
                const isRenaming    = renamingId === d.id;
                const isConfirming  = confirmDeleteId === d.id;

                return (
                  <tr key={d.id} className={clsx('group hover:bg-gray-50 transition-colors', isConfirming && 'bg-red-50')}>

                    {/* Name */}
                    <td className="px-4 py-3">
                      {isRenaming ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            className="input text-sm py-1 w-48"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(d.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                          />
                          <button
                            onClick={() => handleRename(d.id)}
                            disabled={renameSaving}
                            className="p-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                          >
                            {renameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setRenamingId(null)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Link href={`/datasets/${d.id}`} className="flex items-center gap-2 group">
                          <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="font-medium text-gray-900 group-hover:text-brand-600 transition-colors">
                            {d.name}
                          </span>
                        </Link>
                      )}
                    </td>

                    <td className="px-4 py-3 text-gray-500 uppercase text-xs font-mono">{d.file_type}</td>
                    <td className="px-4 py-3 text-gray-600">{d.row_count?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600">{d.column_count}</td>

                    {/* Charts count */}
                    <td className="px-4 py-3">
                      {d.chartCount > 0 ? (
                        <Link
                          href={`/datasets/${d.id}?tab=charts`}
                          className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-medium transition-colors w-fit"
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                          {d.chartCount}
                        </Link>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">{statusBadge(d.status)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-600 font-medium">Delete?</span>
                          <button
                            onClick={() => handleDelete(d.id)}
                            disabled={deleting}
                            className="flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1 rounded-lg hover:bg-red-700 transition-colors font-medium"
                          >
                            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Yes, delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100">
                          <button
                            onClick={() => { setRenamingId(d.id); setRenameDraft(d.name); }}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                            title="Rename dataset"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(d.id)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                            title="Delete dataset"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
