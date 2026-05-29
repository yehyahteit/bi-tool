'use client';

import { useCallback, useState, useRef } from 'react';
import { Upload, FileSpreadsheet, FileText, File, X, CheckCircle2, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useRouter } from 'next/navigation';

const ACCEPTED = '.xlsx,.xls,.csv,.json,.txt';
const MAX_MB = 50;

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return FileSpreadsheet;
  if (ext === 'csv' || ext === 'txt') return FileText;
  return File;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

export default function DropZone() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const accept = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'json', 'txt'].includes(ext ?? '')) {
      setError('Unsupported file type. Use Excel, CSV, JSON, or TXT.');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File too large. Max ${MAX_MB} MB.`);
      return;
    }
    setFile(f);
    setName(f.name.replace(/\.[^.]+$/, ''));
    setError(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) accept(f);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', name || file.name);

    const res = await fetch('/api/datasets', { method: 'POST', body: fd });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? 'Upload failed');
      setUploading(false);
      return;
    }

    setDone(json.data.id);
    setUploading(false);
    setTimeout(() => router.push(`/datasets/${json.data.id}`), 1000);
  }

  const Icon = file ? fileIcon(file.name) : Upload;

  return (
    <div className="max-w-xl mx-auto">
      {/* Drop target */}
      <div
        onClick={() => !file && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          'border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer',
          dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50',
          file ? 'cursor-default' : ''
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(f); }}
        />

        {done ? (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="font-semibold text-green-700">Upload successful! Redirecting…</p>
          </div>
        ) : file ? (
          <div className="flex flex-col items-center gap-3">
            <Icon className="w-10 h-10 text-brand-500" />
            <p className="font-semibold text-gray-900">{file.name}</p>
            <p className="text-sm text-gray-400">{formatBytes(file.size)}</p>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setName(''); }}
              className="text-xs text-red-500 hover:underline flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center">
              <Upload className="w-7 h-7 text-brand-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Drop your file here</p>
              <p className="text-sm text-gray-400 mt-1">or click to browse</p>
            </div>
            <p className="text-xs text-gray-300">Excel · CSV · JSON · TXT — up to {MAX_MB} MB</p>
          </div>
        )}
      </div>

      {/* Dataset name */}
      {file && !done && (
        <div className="mt-4">
          <label className="label">Dataset name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My dataset"
            className="input"
          />
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {file && !done && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="btn-primary w-full justify-center mt-4"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Processing…' : 'Upload & Analyze'}
        </button>
      )}
    </div>
  );
}
