'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, Check, X, Search, ToggleLeft, ToggleRight, Loader2, Upload } from 'lucide-react';
import { clsx } from 'clsx';

interface AppType {
  id: string;
  name_en: string;
  name_ar: string;
  is_active: boolean;
  sort_order: number;
}

const EMPTY: Omit<AppType, 'sort_order'> = { id: '', name_en: '', name_ar: '', is_active: true };

export default function AppTypesPage() {
  const [rows, setRows] = useState<AppType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<AppType>>({});
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/config/app-types');
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.id.toLowerCase().includes(q) ||
      r.name_en.toLowerCase().includes(q) ||
      r.name_ar.toLowerCase().includes(q)
    );
  });

  async function handleAdd() {
    if (!newRow.id.trim() || !newRow.name_en.trim()) {
      setError('ID and English name are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch('/api/config/app-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newRow, sort_order: rows.length + 1 }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error); return; }
    setRows((prev) => [...prev, json.data]);
    setNewRow({ ...EMPTY });
    setAdding(false);
  }

  function startEdit(row: AppType) {
    setEditingId(row.id);
    setEditDraft({ name_en: row.name_en, name_ar: row.name_ar });
  }

  async function handleSaveEdit(row: AppType) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/config/app-types/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editDraft),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error); return; }
    setRows((prev) => prev.map((r) => r.id === row.id ? json.data : r));
    setEditingId(null);
  }

  async function handleToggle(row: AppType) {
    const res = await fetch(`/api/config/app-types/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    const json = await res.json();
    if (res.ok) setRows((prev) => prev.map((r) => r.id === row.id ? json.data : r));
  }

  async function handleDelete(row: AppType) {
    if (!confirm(`Delete "${row.name_en}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/config/app-types/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  // Import from CSV/Excel — parse a simple CSV the user can drag in
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(Boolean);
    const imported: Omit<AppType, 'sort_order'>[] = [];
    for (const line of lines.slice(1)) { // skip header
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 2) {
        imported.push({ id: parts[0], name_en: parts[1], name_ar: parts[2] ?? '', is_active: true });
      }
    }
    setSaving(true);
    await Promise.all(
      imported.map((row, i) =>
        fetch('/api/config/app-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...row, sort_order: rows.length + i + 1 }),
        })
      )
    );
    setSaving(false);
    load();
    if (fileRef.current) fileRef.current.value = '';
  }

  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Application Types</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {rows.length} types &mdash; {activeCount} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Import CSV */}
          <label className="btn-secondary cursor-pointer text-xs">
            <Upload className="w-3.5 h-3.5" />
            Import CSV
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          </label>
          <button
            onClick={() => { setAdding(true); setError(null); }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> Add Type
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          className="input pl-9"
          placeholder="Search by ID, English name, or Arabic name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500 w-28">ID</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">English Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Arabic Name</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500 w-24">Active</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">

            {/* Add new row inline */}
            {adding && (
              <tr className="bg-brand-50">
                <td className="px-4 py-2">
                  <input
                    autoFocus
                    className="input text-xs"
                    placeholder="e.g. 60"
                    value={newRow.id}
                    onChange={(e) => setNewRow((d) => ({ ...d, id: e.target.value }))}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    className="input text-xs"
                    placeholder="English name"
                    value={newRow.name_en}
                    onChange={(e) => setNewRow((d) => ({ ...d, name_en: e.target.value }))}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    className="input text-xs text-right"
                    dir="rtl"
                    placeholder="Arabic name"
                    value={newRow.name_ar}
                    onChange={(e) => setNewRow((d) => ({ ...d, name_ar: e.target.value }))}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input type="checkbox" checked={newRow.is_active}
                    onChange={(e) => setNewRow((d) => ({ ...d, is_active: e.target.checked }))} />
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

            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  {search ? 'No results match your search.' : 'No application types yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className={clsx('hover:bg-gray-50 transition-colors', !row.is_active && 'opacity-50')}>
                    {/* ID — never editable */}
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{row.id}</td>

                    {/* English name */}
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <input
                          autoFocus
                          className="input text-xs"
                          value={editDraft.name_en ?? ''}
                          onChange={(e) => setEditDraft((d) => ({ ...d, name_en: e.target.value }))}
                        />
                      ) : (
                        <span className="text-gray-800">{row.name_en}</span>
                      )}
                    </td>

                    {/* Arabic name */}
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <input
                          className="input text-xs text-right"
                          dir="rtl"
                          value={editDraft.name_ar ?? ''}
                          onChange={(e) => setEditDraft((d) => ({ ...d, name_ar: e.target.value }))}
                        />
                      ) : (
                        <span className="text-gray-600 font-arabic" dir="rtl">{row.name_ar}</span>
                      )}
                    </td>

                    {/* Active toggle */}
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => handleToggle(row)}
                        className={clsx('transition-colors', row.is_active ? 'text-green-500 hover:text-green-600' : 'text-gray-300 hover:text-gray-400')}
                        title={row.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {row.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {isEditing ? (
                          <>
                            <button onClick={() => handleSaveEdit(row)} disabled={saving}
                              className="text-green-600 hover:text-green-700 p-1" title="Save">
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="text-gray-400 hover:text-gray-600 p-1" title="Cancel">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(row)}
                              className="text-gray-300 hover:text-brand-500 p-1 transition-colors" title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(row)}
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
