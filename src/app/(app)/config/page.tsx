'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  Plus, Trash2, ChevronRight, Loader2, X, Check,
  SlidersHorizontal, FileUp, FileSpreadsheet,
  ArrowRight,
} from 'lucide-react';
import { clsx } from 'clsx';

interface Category {
  id: string; name: string; description: string;
  slug: string; columns: ColumnDef[]; sort_order: number;
}
interface ColumnDef {
  key: string; label: string;
  type: 'text' | 'text_rtl' | 'number' | 'boolean';
  required: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  text: 'Text', text_rtl: 'Text (Arabic/RTL)',
  number: 'Number', boolean: 'Toggle',
};
const EMPTY_COL = (): ColumnDef => ({ key: '', label: '', type: 'text', required: false });

// Heuristic: guess column type from sample values
function guessType(values: unknown[]): ColumnDef['type'] {
  const samples = values.filter((v) => v !== null && v !== undefined && v !== '').slice(0, 20);
  if (!samples.length) return 'text';
  const allNum = samples.every((v) => !isNaN(Number(v)));
  if (allNum) return 'number';
  const hasBool = samples.every((v) => ['true','false','yes','no','0','1'].includes(String(v).toLowerCase()));
  if (hasBool) return 'boolean';
  const hasArabic = samples.some((v) => /[؀-ۿ]/.test(String(v)));
  if (hasArabic) return 'text_rtl';
  return 'text';
}

// ── Excel Import Wizard ──────────────────────────────────────────────────────
interface ImportState {
  fileName: string;
  tableName: string;
  description: string;
  headers: string[];          // raw Excel column headers
  cols: ColumnDef[];          // editable column definitions
  rows: Record<string, unknown>[];  // all data rows
  sheetNames: string[];
  activeSheet: string;
  workbook: XLSX.WorkBook;
}

function ImportWizard({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<'upload' | 'map' | 'importing'>('upload');
  const [dragging, setDragging] = useState(false);
  const [imp, setImp] = useState<ImportState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function parseSheet(wb: XLSX.WorkBook, sheetName: string, fileName: string): ImportState {
    const ws = wb.Sheets[sheetName];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headers = (raw[0] as string[]).map((h) => String(h ?? '').trim()).filter(Boolean);
    const dataRows = raw.slice(1).filter((r) => (r as unknown[]).some((v) => v !== ''));
    const rows = dataRows.map((r) =>
      headers.reduce<Record<string, unknown>>((acc, h, i) => { acc[h] = (r as unknown[])[i]; return acc; }, {})
    );
    const cols: ColumnDef[] = headers.map((h) => {
      const vals = rows.map((r) => r[h]);
      return {
        key: h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
        label: h,
        type: guessType(vals),
        required: false,
      };
    });
    // Guess table name from file name (strip extension)
    const tableName = fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim();
    return { fileName, tableName, description: '', headers, cols, rows, sheetNames: wb.SheetNames, activeSheet: sheetName, workbook: wb };
  }

  function handleFile(file: File) {
    setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx','xls','csv'].includes(ext ?? '')) { setError('Please upload an Excel (.xlsx, .xls) or CSV file.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const wb = XLSX.read(data, { type: 'array' });
      setImp(parseSheet(wb, wb.SheetNames[0], file.name));
      setStep('map');
    };
    reader.readAsArrayBuffer(file);
  }

  function switchSheet(name: string) {
    if (!imp) return;
    setImp(parseSheet(imp.workbook, name, imp.fileName));
  }

  function updateCol(i: number, patch: Partial<ColumnDef>) {
    setImp((prev) => prev ? { ...prev, cols: prev.cols.map((c, idx) => idx === i ? { ...c, ...patch } : c) } : prev);
  }

  async function handleImport() {
    if (!imp) return;
    setStep('importing');
    setError(null);

    // 1. Create category
    const catRes = await fetch('/api/config/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: imp.tableName, description: imp.description, columns: imp.cols }),
    });
    const catJson = await catRes.json();
    if (!catRes.ok) { setError(catJson.error); setStep('map'); return; }
    const catId = catJson.data.id;

    // 2. Bulk insert entries in batches of 50
    const total = imp.rows.length;
    const BATCH = 50;
    for (let i = 0; i < total; i += BATCH) {
      const batch = imp.rows.slice(i, i + BATCH);
      await Promise.all(batch.map((rawRow) => {
        // Map raw header keys → col.key
        const data = imp.cols.reduce<Record<string, unknown>>((acc, col) => {
          acc[col.key] = rawRow[col.label] ?? rawRow[col.key] ?? '';
          return acc;
        }, {});
        return fetch(`/api/config/categories/${catId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, is_active: true }),
        });
      }));
      setProgress(Math.round(((i + BATCH) / total) * 100));
    }

    onDone();
  }

  // Drag & drop
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  if (step === 'upload') return (
    <div className="card p-6 border-brand-200 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-brand-600" /> Import from Excel / CSV
        </h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all',
          dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
        )}
      >
        <FileUp className={clsx('w-10 h-10', dragging ? 'text-brand-500' : 'text-gray-300')} />
        <div className="text-center">
          <p className="font-medium text-gray-700">Drop your Excel or CSV file here</p>
          <p className="text-sm text-gray-400 mt-1">or click to browse — .xlsx, .xls, .csv supported</p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
    </div>
  );

  if (step === 'importing') return (
    <div className="card p-8 flex flex-col items-center gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      <p className="font-semibold text-gray-700">Importing {imp?.rows.length.toLocaleString()} entries…</p>
      <div className="w-full max-w-xs bg-gray-100 rounded-full h-2">
        <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>
      <p className="text-sm text-gray-400">{Math.min(progress, 100)}% complete</p>
    </div>
  );

  if (!imp) return null;

  // Step: map
  return (
    <div className="card p-5 border-brand-200 shadow-md flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-brand-600" />
          Configure import — <span className="text-gray-500 font-normal">{imp.fileName}</span>
        </h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {/* Sheet picker (if multiple sheets) */}
      {imp.sheetNames.length > 1 && (
        <div>
          <label className="label">Sheet</label>
          <div className="flex gap-2 flex-wrap">
            {imp.sheetNames.map((s) => (
              <button key={s} onClick={() => switchSheet(s)}
                className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  imp.activeSheet === s ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table metadata */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Table Name <span className="text-red-400">*</span></label>
          <input className="input" value={imp.tableName}
            onChange={(e) => setImp((p) => p ? { ...p, tableName: e.target.value } : p)} />
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" placeholder="Optional" value={imp.description}
            onChange={(e) => setImp((p) => p ? { ...p, description: e.target.value } : p)} />
        </div>
      </div>

      {/* Preview stats */}
      <div className="flex gap-3 text-sm">
        <span className="bg-brand-50 text-brand-700 px-3 py-1 rounded-full font-medium">
          {imp.rows.length.toLocaleString()} rows
        </span>
        <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-medium">
          {imp.cols.length} columns
        </span>
      </div>

      {/* Column mapper */}
      <div>
        <label className="label mb-2">Column Configuration <span className="text-gray-400 font-normal text-xs">(auto-detected — adjust as needed)</span></label>
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Excel Header</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Field Key</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Label</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Sample values</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {imp.cols.map((col, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-400">{imp.headers[i]}</td>
                  <td className="px-3 py-2">
                    <input className="input text-xs font-mono w-32" value={col.key}
                      onChange={(e) => updateCol(i, { key: e.target.value.toLowerCase().replace(/\s/g, '_') })} />
                  </td>
                  <td className="px-3 py-2">
                    <input className="input text-xs w-36" value={col.label}
                      onChange={(e) => updateCol(i, { label: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <select className="input text-xs w-36" value={col.type}
                      onChange={(e) => updateCol(i, { type: e.target.value as ColumnDef['type'] })}>
                      {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400 truncate max-w-[160px]">
                    {imp.rows.slice(0, 3).map((r) => String(r[imp.headers[i]] ?? '')).filter(Boolean).join(', ')}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => setImp((p) => p ? { ...p, cols: p.cols.filter((_, idx) => idx !== i), headers: p.headers.filter((_, idx) => idx !== i) } : p)}
                      className="text-gray-300 hover:text-red-400 transition-colors" disabled={imp.cols.length === 1}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
        <button onClick={() => setStep('upload')} className="btn-secondary text-xs">
          ← Change file
        </button>
        <button onClick={handleImport} disabled={!imp.tableName.trim()} className="btn-primary">
          <ArrowRight className="w-4 h-4" />
          Import {imp.rows.length.toLocaleString()} entries
        </button>
      </div>
    </div>
  );
}

// ── Main Config Page ─────────────────────────────────────────────────────────
export default function ConfigPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [cols, setCols] = useState<ColumnDef[]>([EMPTY_COL()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/config/categories');
    const json = await res.json();
    setCategories(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!draft.name.trim()) { setError('Name is required.'); return; }
    const validCols = cols.filter((c) => c.key.trim() && c.label.trim());
    if (!validCols.length) { setError('Add at least one column.'); return; }
    setSaving(true); setError(null);
    const res = await fetch('/api/config/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draft.name, description: draft.description, columns: validCols }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error); return; }
    setShowNew(false);
    setDraft({ name: '', description: '' });
    setCols([EMPTY_COL()]);
    load();
  }

  async function handleDelete(cat: Category) {
    if (!confirm(`Delete "${cat.name}" and all its entries? This cannot be undone.`)) return;
    await fetch(`/api/config/categories/${cat.id}`, { method: 'DELETE' });
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
  }

  function updateCol(i: number, patch: Partial<ColumnDef>) {
    setCols((prev) => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }

  function autoKey(label: string) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
          <p className="text-sm text-gray-400 mt-0.5">Create and manage dynamic lookup tables for your workspace.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowImport(true); setShowNew(false); setError(null); }} className="btn-secondary">
            <FileSpreadsheet className="w-4 h-4" /> Import Excel
          </button>
          <button onClick={() => { setShowNew(true); setShowImport(false); setError(null); }} className="btn-primary">
            <Plus className="w-4 h-4" /> New Table
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg flex items-center justify-between">
          {error} <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Excel import wizard */}
      {showImport && (
        <ImportWizard
          onDone={() => { setShowImport(false); load(); }}
          onCancel={() => setShowImport(false)}
        />
      )}

      {/* Manual new table form */}
      {showNew && (
        <div className="card p-5 flex flex-col gap-4 border-brand-200 shadow-md">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">New Configuration Table</h2>
            <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Table Name <span className="text-red-400">*</span></label>
              <input className="input" placeholder="e.g. Transaction Sources" value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" placeholder="Optional description" value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Columns</label>
              <button onClick={() => setCols((p) => [...p, EMPTY_COL()])}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add column
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {cols.map((col, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_140px_80px_32px] gap-2 items-center">
                  <input className="input text-sm" placeholder="Label (e.g. English Name)" value={col.label}
                    onChange={(e) => updateCol(i, { label: e.target.value, key: col.key || autoKey(e.target.value) })} />
                  <input className="input text-sm font-mono" placeholder="Key (e.g. name_en)" value={col.key}
                    onChange={(e) => updateCol(i, { key: e.target.value.toLowerCase().replace(/\s/g, '_') })} />
                  <select className="input text-sm" value={col.type}
                    onChange={(e) => updateCol(i, { type: e.target.value as ColumnDef['type'] })}>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={col.required}
                      onChange={(e) => updateCol(i, { required: e.target.checked })} />
                    Required
                  </label>
                  <button onClick={() => setCols((p) => p.filter((_, idx) => idx !== i))}
                    className="text-gray-300 hover:text-red-400 transition-colors" disabled={cols.length === 1}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Create Table
            </button>
          </div>
        </div>
      )}

      {/* Categories list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : categories.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <SlidersHorizontal className="w-10 h-10" />
          <p className="font-medium">No configuration tables yet</p>
          <p className="text-sm">Click &ldquo;Import Excel&rdquo; to load any spreadsheet, or &ldquo;New Table&rdquo; to build one manually.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {categories.map((cat) => (
            <div key={cat.id}
              className="card p-4 flex items-center gap-4 hover:border-brand-200 hover:shadow-md transition-all group cursor-pointer"
              onClick={() => router.push(`/config/${cat.id}`)}>
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-100 transition-colors">
                <SlidersHorizontal className="w-5 h-5 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{cat.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {cat.description || 'No description'} &mdash;&nbsp;
                  <span className="text-gray-500">{cat.columns.length} column{cat.columns.length !== 1 ? 's' : ''}</span>
                </p>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {cat.columns.map((c) => (
                    <span key={c.key} className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 font-medium">
                      {c.label} <span className="ml-1 text-gray-300">({TYPE_LABELS[c.type]})</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={(e) => { e.stopPropagation(); handleDelete(cat); }}
                  className="p-1.5 text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-400 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
