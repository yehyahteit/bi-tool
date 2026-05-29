'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitMerge, Layers, ChevronDown, Loader2, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import type { Dataset } from '@/types';

type MergeMode = 'join' | 'append';
type JoinType = 'inner' | 'left' | 'right' | 'full';

const JOIN_TYPE_LABELS: Record<JoinType, { label: string; desc: string }> = {
  inner: { label: 'Inner',    desc: 'Only rows that match in both datasets' },
  left:  { label: 'Left',     desc: 'All rows from the left dataset, matched rows from right' },
  right: { label: 'Right',    desc: 'All rows from the right dataset, matched rows from left' },
  full:  { label: 'Full',     desc: 'All rows from both datasets, null where no match' },
};

export default function MergeDatasets() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<MergeMode>('append');
  const [leftId, setLeftId]   = useState('');
  const [rightId, setRightId] = useState('');
  const [leftKey, setLeftKey]   = useState('');
  const [rightKey, setRightKey] = useState('');
  const [joinType, setJoinType] = useState<JoinType>('left');
  const [mergedName, setMergedName] = useState('');
  const [fillMissing, setFillMissing] = useState(true);

  const [merging, setMerging] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/datasets?pageSize=200')
      .then((r) => r.json())
      .then((d) => setDatasets(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const leftDataset  = datasets.find((d) => d.id === leftId);
  const rightDataset = datasets.find((d) => d.id === rightId);

  const leftCols  = leftDataset?.columns_schema  ?? [];
  const rightCols = rightDataset?.columns_schema ?? [];

  // Auto-suggest merged name when both datasets chosen
  useEffect(() => {
    if (leftDataset && rightDataset) {
      const suffix = mode === 'join' ? 'Joined' : 'Appended';
      setMergedName(`${leftDataset.name} + ${rightDataset.name} (${suffix})`);
    }
  }, [leftId, rightId, mode, leftDataset, rightDataset]);

  // Reset keys when datasets change
  useEffect(() => { setLeftKey('');  }, [leftId]);
  useEffect(() => { setRightKey(''); }, [rightId]);

  async function handleMerge() {
    setError(null);
    if (!leftId || !rightId) { setError('Please select both datasets.'); return; }
    if (leftId === rightId)  { setError('Select two different datasets.'); return; }
    if (!mergedName.trim())  { setError('Please enter a name for the merged dataset.'); return; }
    if (mode === 'join' && (!leftKey || !rightKey)) {
      setError('Please select the join key columns for both datasets.'); return;
    }

    setMerging(true);
    try {
      const res = await fetch('/api/datasets/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, leftId, rightId, name: mergedName.trim(), leftKey, rightKey, joinType, fillMissing }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Merge failed.'); return; }
      setSuccess(true);
      setTimeout(() => router.push(`/datasets/${json.data.id}`), 1500);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setMerging(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-300">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading datasets…
      </div>
    );
  }

  if (datasets.length < 2) {
    return (
      <div className="card p-12 text-center">
        <GitMerge className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">You need at least 2 datasets to merge</p>
        <p className="text-gray-400 text-sm mt-1">Upload more datasets first, then come back here.</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="card p-12 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <p className="text-gray-800 font-semibold text-lg">Merge complete!</p>
        <p className="text-gray-400 text-sm mt-1">Redirecting to your new dataset…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode('append')}
          className={clsx(
            'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
            mode === 'append' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300 bg-white'
          )}
        >
          <Layers className={clsx('w-5 h-5 mt-0.5 flex-shrink-0', mode === 'append' ? 'text-brand-600' : 'text-gray-400')} />
          <div>
            <p className={clsx('font-semibold text-sm', mode === 'append' ? 'text-brand-700' : 'text-gray-700')}>Append rows</p>
            <p className="text-xs text-gray-500 mt-0.5">Stack rows from two datasets vertically (like SQL UNION)</p>
          </div>
        </button>
        <button
          onClick={() => setMode('join')}
          className={clsx(
            'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
            mode === 'join' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300 bg-white'
          )}
        >
          <GitMerge className={clsx('w-5 h-5 mt-0.5 flex-shrink-0', mode === 'join' ? 'text-brand-600' : 'text-gray-400')} />
          <div>
            <p className={clsx('font-semibold text-sm', mode === 'join' ? 'text-brand-700' : 'text-gray-700')}>Join columns</p>
            <p className="text-xs text-gray-500 mt-0.5">Combine columns from two datasets by a shared key (like SQL JOIN)</p>
          </div>
        </button>
      </div>

      {/* Dataset selectors */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Select datasets</h3>

        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
          {/* Left dataset */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {mode === 'join' ? 'Base (Left)' : 'Dataset 1'}
            </label>
            <div className="relative">
              <select
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
                className="input w-full appearance-none pr-8 text-sm"
              >
                <option value="">Choose dataset…</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.id === rightId}>
                    {d.name} ({d.row_count.toLocaleString()} rows)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
            {leftDataset && (
              <p className="text-xs text-gray-400">{leftDataset.column_count} columns · {leftDataset.row_count.toLocaleString()} rows</p>
            )}
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center pt-7">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </div>
          </div>

          {/* Right dataset */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {mode === 'join' ? 'Merge-in (Right)' : 'Dataset 2'}
            </label>
            <div className="relative">
              <select
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
                className="input w-full appearance-none pr-8 text-sm"
              >
                <option value="">Choose dataset…</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.id === leftId}>
                    {d.name} ({d.row_count.toLocaleString()} rows)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
            {rightDataset && (
              <p className="text-xs text-gray-400">{rightDataset.column_count} columns · {rightDataset.row_count.toLocaleString()} rows</p>
            )}
          </div>
        </div>

        {/* Column overlap preview for append */}
        {mode === 'append' && leftDataset && rightDataset && (() => {
          const lNames = new Set(leftCols.map((c) => c.name));
          const rNames = new Set(rightCols.map((c) => c.name));
          const shared = [...lNames].filter((n) => rNames.has(n));
          const leftOnly  = [...lNames].filter((n) => !rNames.has(n));
          const rightOnly = [...rNames].filter((n) => !lNames.has(n));
          return (
            <div className="bg-gray-50 rounded-xl p-3 space-y-2 mt-2">
              <p className="text-xs font-medium text-gray-600">Column overlap preview</p>
              <div className="flex flex-wrap gap-1.5">
                {shared.map((c) => (
                  <span key={c} className="badge bg-green-50 text-green-700">{c}</span>
                ))}
                {leftOnly.map((c) => (
                  <span key={c} className="badge bg-blue-50 text-blue-600">{c} (left only)</span>
                ))}
                {rightOnly.map((c) => (
                  <span key={c} className="badge bg-purple-50 text-purple-600">{c} (right only)</span>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={fillMissing}
                  onChange={(e) => setFillMissing(e.target.checked)}
                  className="rounded"
                />
                Fill missing columns with null (recommended when columns differ)
              </label>
            </div>
          );
        })()}
      </div>

      {/* Join options */}
      {mode === 'join' && leftDataset && rightDataset && (
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Join configuration</h3>

          {/* Join type */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Join type</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(JOIN_TYPE_LABELS) as [JoinType, { label: string; desc: string }][]).map(([jt, meta]) => (
                <button
                  key={jt}
                  onClick={() => setJoinType(jt)}
                  className={clsx(
                    'flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-all',
                    joinType === jt
                      ? 'border-brand-400 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                  title={meta.desc}
                >
                  {meta.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">{JOIN_TYPE_LABELS[joinType].desc}</p>
          </div>

          {/* Key columns */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Key column — left dataset</label>
              <div className="relative">
                <select
                  value={leftKey}
                  onChange={(e) => setLeftKey(e.target.value)}
                  className="input w-full appearance-none pr-8 text-sm"
                >
                  <option value="">Choose column…</option>
                  {leftCols.map((c) => (
                    <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Key column — right dataset</label>
              <div className="relative">
                <select
                  value={rightKey}
                  onChange={(e) => setRightKey(e.target.value)}
                  className="input w-full appearance-none pr-8 text-sm"
                >
                  <option value="">Choose column…</option>
                  {rightCols.map((c) => (
                    <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Conflict preview */}
          {leftKey && rightKey && (() => {
            const lNames = new Set(leftCols.map((c) => c.name));
            const rNames = new Set(rightCols.map((c) => c.name));
            const conflicts = [...rNames].filter((n) => n !== rightKey && lNames.has(n) && n !== leftKey);
            if (!conflicts.length) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-medium text-amber-700 mb-1">Column name conflicts — will be renamed with _right suffix:</p>
                <div className="flex flex-wrap gap-1">
                  {conflicts.map((c) => (
                    <span key={c} className="badge bg-amber-100 text-amber-700">{c} → {c}_right</span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Output name */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Output dataset name</h3>
        <input
          type="text"
          value={mergedName}
          onChange={(e) => setMergedName(e.target.value)}
          placeholder="Enter a name for the merged dataset…"
          className="input w-full"
        />
        {leftDataset && rightDataset && (
          <p className="text-xs text-gray-400">
            {mode === 'append'
              ? `Will create a new dataset with ${(leftDataset.row_count + rightDataset.row_count).toLocaleString()} rows (max 50,000)`
              : `Will join ${leftDataset.row_count.toLocaleString()} × ${rightDataset.row_count.toLocaleString()} rows`
            }
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Action */}
      <button
        onClick={handleMerge}
        disabled={merging}
        className="btn-primary w-full py-3 text-sm justify-center"
      >
        {merging
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Merging datasets…</>
          : <><GitMerge className="w-4 h-4" /> Merge &amp; Save as New Dataset</>
        }
      </button>
    </div>
  );
}
