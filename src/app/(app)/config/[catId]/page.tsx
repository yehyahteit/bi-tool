'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Pencil, Trash2, Check, X,
  Search, ToggleLeft, ToggleRight, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';

interface ColumnDef {
  key: string;
  label: string;
  type: 'text' | 'text_rtl' | 'number' | 'boolean';
  required: boolean;
}

interface Category {
  id: string;
  name: string;
  description: string;
  columns: ColumnDef[];
}

interface Entry {
  id: string;
  data: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
}

export default function ConfigEntriesPage({ params }: { params: Promise<{ catId: string }> }) {
  const { catId } = use(params);
  const [category, setCategory] = useState<Category | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({});
  const [adding, setAdding] = useState(false);
  const [newData, setNewData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [catRes, entRes] = await Promise.all([
      fetch(`/api/config/categories`),
      fetch(`/api/config/categories/${catId}/entries`),
    ]);
    const catJson = await catRes.json();
    const entJson = await entRes.json();
    const found = (catJson.data ?? []).find((c: Category) => c.id === catId);
    setCategory(found ?? null);
    setEntries(entJson.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [catId]);

  const cols = category?.columns ?? [];

  // Filter entries by search across all text fields
  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return Object.values(e.data).some((v) => String(v).toLowerCase().includes(q));
  });

  function emptyData() {
    return cols.reduce<Record<string, unknown>>((acc, c) => {
      acc[c.key] = c.type === 'boolean' ? true : c.type === 'number' ? '' : '';
      return acc;
    }, {});
  }

  async function handleAdd() {
    // Validate required fields
    const missing = cols.filter((c) => c.required && !String(newData[c.key] ?? '').trim());
    if (missing.length) { setError(`Required: ${missing.map((c) => c.label).join(', ')}`); return; }
    setSaving(true); setError(null);
    const res = await fetch(`/api/config/categories/${catId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: newData, is_active: true }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error); return; }
    setEntries((p) => [...p, json.data]);
    setAdding(false);
    setNewData({});
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setEditDraft({ ...entry.data });
  }

  async function handleSaveEdit(entry: Entry) {
    setSaving(true); setError(null);
    const res = await fetch(`/api/config/categories/${catId}/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: editDraft }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error); return; }
    setEntries((p) => p.map((e) => e.id === entry.id ? json.data : e));
    setEditingId(null);
  }

  async function handleToggle(entry: Entry) {
    const res = await fetch(`/api/config/categories/${catId}/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !entry.is_active }),
    });
    const json = await res.json();
    if (res.ok) setEntries((p) => p.map((e) => e.id === entry.id ? json.data : e));
  }

  async function handleDelete(entry: Entry) {
    const preview = cols[0] ? String(entry.data[cols[0].key] ?? entry.id) : entry.id;
    if (!confirm(`Delete "${preview}"?`)) return;
    await fetch(`/api/config/categories/${catId}/entries/${entry.id}`, { method: 'DELETE' });
    setEntries((p) => p.filter((e) => e.id !== entry.id));
  }

  // Render a cell input based on column type
  function CellInput({ col, value, onChange }: {
    col: ColumnDef;
    value: unknown;
    onChange: (v: unknown) => void;
  }) {
    if (col.type === 'boolean') {
      return (
        <input type="checkbox" checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
      );
    }
    return (
      <input
        className="input text-xs"
        type={col.type === 'number' ? 'number' : 'text'}
        dir={col.type === 'text_rtl' ? 'rtl' : undefined}
        value={String(value ?? '')}
        onChange={(e) => onChange(col.type === 'number' ? parseFloat(e.target.value) || '' : e.target.value)}
        placeholder={col.label}
      />
    );
  }

  // Render a display cell
  function CellDisplay({ col, value }: { col: ColumnDef; value: unknown }) {
    if (col.type === 'boolean') {
      return <span className={clsx('text-xs font-medium', value ? 'text-green-600' : 'text-gray-400')}>{value ? 'Yes' : 'No'}</span>;
    }
    if (col.type === 'number') return <span className="text-gray-700">{Number(value).toLocaleString()}</span>;
    return <span className={clsx('text-gray-700', col.type === 'text_rtl' && 'font-arabic')} dir={col.type === 'text_rtl' ? 'rtl' : undefined}>{String(value ?? '')}</span>;
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
    </div>
  );

  if (!category) return (
    <div className="text-center py-20 text-gray-400">
      <p>Configuration table not found.</p>
      <Link href="/config" className="text-brand-600 text-sm mt-2 inline-block">← Back to Configuration</Link>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/config" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{category.name}</h1>
          {category.description && <p className="text-sm text-gray-400 mt-0.5">{category.description}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setAdding(true); setNewData(emptyData()); setError(null); }} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Entry
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        <div className="card px-4 py-3 text-center min-w-[90px]">
          <p className="text-2xl font-bold text-gray-900">{entries.length}</p>
          <p className="text-xs text-gray-400">Total</p>
        </div>
        <div className="card px-4 py-3 text-center min-w-[90px]">
          <p className="text-2xl font-bold text-green-600">{entries.filter((e) => e.is_active).length}</p>
          <p className="text-xs text-gray-400">Active</p>
        </div>
        <div className="card px-4 py-3 text-center min-w-[90px]">
          <p className="text-2xl font-bold text-gray-400">{entries.filter((e) => !e.is_active).length}</p>
          <p className="text-xs text-gray-400">Inactive</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg flex items-center justify-between">
          {error} <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className="input pl-9" placeholder={`Search ${category.name}…`}
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {cols.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">
                  {col.label}
                  {col.required && <span className="text-red-400 ml-0.5">*</span>}
                </th>
              ))}
              <th className="px-4 py-3 text-center font-medium text-gray-500 w-20">Active</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">

            {/* Add row */}
            {adding && (
              <tr className="bg-brand-50">
                {cols.map((col) => (
                  <td key={col.key} className="px-4 py-2">
                    <CellInput
                      col={col}
                      value={newData[col.key]}
                      onChange={(v) => setNewData((d) => ({ ...d, [col.key]: v }))}
                    />
                  </td>
                ))}
                <td className="px-4 py-2 text-center">
                  <input type="checkbox" checked={true} readOnly className="w-4 h-4" />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={handleAdd} disabled={saving} className="text-green-600 hover:text-green-700 p-1">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={() => { setAdding(false); setError(null); }} className="text-gray-400 hover:text-gray-600 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {filtered.length === 0 ? (
              <tr>
                <td colSpan={cols.length + 2} className="px-4 py-12 text-center text-gray-400">
                  {search ? 'No results match your search.' : 'No entries yet — click Add Entry to start.'}
                </td>
              </tr>
            ) : (
              filtered.map((entry) => {
                const isEditing = editingId === entry.id;
                return (
                  <tr key={entry.id} className={clsx('hover:bg-gray-50 transition-colors', !entry.is_active && 'opacity-50')}>
                    {cols.map((col) => (
                      <td key={col.key} className="px-4 py-2.5">
                        {isEditing ? (
                          <CellInput
                            col={col}
                            value={editDraft[col.key]}
                            onChange={(v) => setEditDraft((d) => ({ ...d, [col.key]: v }))}
                          />
                        ) : (
                          <CellDisplay col={col} value={entry.data[col.key]} />
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => handleToggle(entry)}
                        className={clsx('transition-colors', entry.is_active ? 'text-green-500 hover:text-green-600' : 'text-gray-300 hover:text-gray-400')}
                        title={entry.is_active ? 'Deactivate' : 'Activate'}>
                        {entry.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {isEditing ? (
                          <>
                            <button onClick={() => handleSaveEdit(entry)} disabled={saving}
                              className="text-green-600 hover:text-green-700 p-1">
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 p-1">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(entry)}
                              className="text-gray-300 hover:text-brand-500 p-1 transition-colors" title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(entry)}
                              className="text-gray-300 hover:text-red-400 p-1 transition-colors" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
