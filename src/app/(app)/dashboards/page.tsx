'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Plus, Globe, Lock, MoreVertical, Pencil, Trash2, Check, X, Loader2, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';

interface Dashboard {
  id: string;
  name: string;
  description?: string;
  is_public: boolean;
  updated_at: string;
}

export default function DashboardsPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);

  // Menu state
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Duplicate state
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboards')
      .then((r) => r.json())
      .then((d) => setDashboards(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function startRename(d: Dashboard) {
    setMenuOpen(null);
    setRenamingId(d.id);
    setRenameValue(d.name);
  }

  async function saveRename(id: string) {
    if (!renameValue.trim()) return;
    setRenameSaving(true);
    const res = await fetch(`/api/dashboards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    if (res.ok) {
      setDashboards((prev) => prev.map((d) => d.id === id ? { ...d, name: renameValue.trim() } : d));
    }
    setRenamingId(null);
    setRenameSaving(false);
  }

  async function handleDelete(id: string) {
    setMenuOpen(null);
    setDeletingId(id);
    const res = await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDashboards((prev) => prev.filter((d) => d.id !== id));
    }
    setDeletingId(null);
  }

  async function handleDuplicate(d: Dashboard) {
    setMenuOpen(null);
    setDuplicatingId(d.id);
    try {
      // 1. Fetch full source dashboard (with widgets + layout)
      const srcRes = await fetch(`/api/dashboards/${d.id}`);
      const srcJson = await srcRes.json();
      const src = srcJson.data;

      // 2. Create new empty dashboard
      const newRes = await fetch('/api/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${src.name} (copy)`,
          description: src.description,
          theme: src.theme,
        }),
      });
      const newJson = await newRes.json();
      if (!newRes.ok) return;
      const newDash = newJson.data;

      // 3. Copy each widget, track old-id → new-id mapping
      const srcWidgets: Array<Record<string, unknown>> = src.dashboard_widgets ?? src.widgets ?? [];
      const idMap: Record<string, string> = {}; // oldId → newId

      for (const w of srcWidgets) {
        // chart_id may be directly on the widget, or we fall back to the joined charts object id
        const chartId = (w.chart_id ?? (w.charts as Record<string,unknown>)?.id ?? null) as string | null;
        console.log('[duplicate] widget', w.id, 'chart_id', chartId, 'type', w.widget_type);
        const wRes = await fetch(`/api/dashboards/${newDash.id}/widgets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chart_id:    chartId,
            widget_type: w.widget_type,
            title:       w.title,
            config:      w.config,
            position:    w.position,  // carries x,y,w,h
          }),
        });
        const wJson = await wRes.json();
        if (wRes.ok && wJson.data) {
          idMap[w.id as string] = wJson.data.id;
        }
      }

      // 4. Rebuild layout using new widget IDs (layout.i = widget id)
      const srcLayout: Array<Record<string, unknown>> = src.layout ?? [];
      const newLayout = srcLayout.map((item) => ({
        ...item,
        i: idMap[item.i as string] ?? item.i, // remap id
      }));

      // Also build layout from widget positions if src.layout was empty
      const finalLayout = newLayout.length > 0
        ? newLayout
        : srcWidgets.map((w) => {
            const pos = w.position as { x: number; y: number; w: number; h: number };
            return { i: idMap[w.id as string] ?? w.id, x: pos.x, y: pos.y, w: pos.w, h: pos.h };
          });

      if (finalLayout.length) {
        await fetch(`/api/dashboards/${newDash.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layout: finalLayout }),
        });
      }

      // 5. Add the new dashboard card to the top of the list
      setDashboards((prev) => [{ ...newDash, name: `${src.name} (copy)` }, ...prev]);
    } finally {
      setDuplicatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboards</h1>
          <p className="text-sm text-gray-500 mt-1">{dashboards.length} dashboard{dashboards.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/dashboards/new" className="btn-primary">
          <Plus className="w-4 h-4" /> New Dashboard
        </Link>
      </div>

      {!dashboards.length ? (
        <div className="card p-16 text-center">
          <LayoutDashboard className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No dashboards yet</p>
          <Link href="/dashboards/new" className="btn-primary mt-4 inline-flex">Create your first dashboard</Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {dashboards.map((d) => {
            const isDeleting    = deletingId    === d.id;
            const isDuplicating = duplicatingId === d.id;
            const isRenaming    = renamingId    === d.id;
            const isMenuOpen    = menuOpen      === d.id;

            return (
              <div
                key={d.id}
                className={clsx(
                  'card p-5 hover:border-brand-200 hover:shadow-md transition-all group relative',
                  (isDeleting || isDuplicating) && 'opacity-50 pointer-events-none'
                )}
              >
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                    <LayoutDashboard className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex items-center gap-2">
                    {d.is_public ? (
                      <span className="badge bg-green-50 text-green-700 flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Public
                      </span>
                    ) : (
                      <span className="badge bg-gray-50 text-gray-500 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Private
                      </span>
                    )}

                    {/* 3-dot menu */}
                    <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(isMenuOpen ? null : d.id); }}
                        className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        title="More options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 top-8 z-20 w-40 bg-white rounded-xl border border-gray-200 shadow-lg py-1 text-sm">
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); startRename(d); }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5 text-gray-400" /> Rename
                          </button>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/dashboards/${d.id}`); }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700 transition-colors"
                          >
                            <LayoutDashboard className="w-3.5 h-3.5 text-gray-400" /> Open
                          </button>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDuplicate(d); }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700 transition-colors"
                          >
                            {isDuplicating
                              ? <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                              : <Copy className="w-3.5 h-3.5 text-gray-400" />
                            }
                            {isDuplicating ? 'Copying…' : 'Duplicate'}
                          </button>
                          <div className="border-t border-gray-100 my-1" />
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(d.id); }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Name — inline rename or link */}
                {isRenaming ? (
                  <div className="flex items-center gap-1.5 mt-1" onClick={(e) => e.preventDefault()}>
                    <input
                      autoFocus
                      className="input text-sm font-semibold flex-1 py-1"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(d.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                    />
                    <button
                      onClick={() => saveRename(d.id)}
                      disabled={renameSaving}
                      className="p-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                    >
                      {renameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <Link href={`/dashboards/${d.id}`} className="block mt-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{d.name}</h3>
                    {d.description && <p className="text-sm text-gray-400 mt-1 line-clamp-2">{d.description}</p>}
                    <p className="text-xs text-gray-300 mt-3">
                      Updated {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                    </p>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
