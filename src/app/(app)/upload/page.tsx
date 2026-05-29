'use client';

import { useState } from 'react';
import DropZone from '@/components/upload/DropZone';
import MergeDatasets from '@/components/upload/MergeDatasets';
import { Upload, GitMerge } from 'lucide-react';
import { clsx } from 'clsx';

type Tab = 'upload' | 'merge';

export default function UploadPage() {
  const [tab, setTab] = useState<Tab>('upload');

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
            {tab === 'upload'
              ? <Upload className="w-5 h-5 text-brand-600" />
              : <GitMerge className="w-5 h-5 text-brand-600" />
            }
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {tab === 'upload' ? 'Upload Dataset' : 'Merge Datasets'}
          </h1>
        </div>
        <p className="text-gray-500 text-sm">
          {tab === 'upload'
            ? 'Supported formats: Excel (.xlsx, .xls), CSV, JSON, TXT. Max 50 MB.'
            : 'Combine two existing datasets by appending rows or joining on a shared key column.'
          }
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6">
        <button
          onClick={() => setTab('upload')}
          className={clsx(
            'flex items-center gap-2 flex-1 justify-center py-2 px-4 rounded-lg text-sm font-medium transition-all',
            tab === 'upload'
              ? 'bg-white shadow-sm text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Upload className="w-4 h-4" /> Upload File
        </button>
        <button
          onClick={() => setTab('merge')}
          className={clsx(
            'flex items-center gap-2 flex-1 justify-center py-2 px-4 rounded-lg text-sm font-medium transition-all',
            tab === 'merge'
              ? 'bg-white shadow-sm text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <GitMerge className="w-4 h-4" /> Merge with Dataset
        </button>
      </div>

      {/* Content */}
      {tab === 'upload' ? <DropZone /> : <MergeDatasets />}
    </div>
  );
}
