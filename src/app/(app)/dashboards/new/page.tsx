'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LayoutDashboard } from 'lucide-react';

export default function NewDashboardPage() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const res = await fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? 'Failed to create dashboard');
      return;
    }

    router.push(`/dashboards/${json.data.id}`);
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
          <LayoutDashboard className="w-7 h-7 text-purple-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">New Dashboard</h1>
        <p className="text-gray-500 mt-1">Give it a name and start building.</p>
      </div>

      <div className="card p-8">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">Dashboard name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q1 Sales Overview"
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">Description <span className="text-gray-300">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this dashboard show?"
              className="input resize-none h-20"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <button type="submit" disabled={loading || !name.trim()} className="btn-primary w-full justify-center">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}
