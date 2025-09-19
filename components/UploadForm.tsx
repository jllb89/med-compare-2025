'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { UploadResponse } from '@/lib/types';
import { SECTION } from '@/lib/ui';

type Props = {
  onResult?: (res: UploadResponse) => void; // optional to avoid runtime crash
};

export default function UploadForm({ onResult }: Props) {
  const [sku, setSku] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim()) { toast.error('Enter a SKU'); return; }
    if (!files || !files.length) { toast.error('Attach at least one Excel/CSV file'); return; }
    setLoading(true);
    toast.info('Uploading & parsing…');

    const fd = new FormData();
    fd.append('sku', sku);
    for (const f of Array.from(files)) fd.append('files', f);

    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) { toast.error(json?.error || 'Failed to parse'); return; }
    toast.success('Parsed successfully');
    onResult?.(json as UploadResponse);
  };

  return (
    <form onSubmit={onSubmit} className={SECTION}>
      <div className="grid gap-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">SKU (12–14 digits)</label>
          <input
            value={sku}
            onChange={e => setSku(e.target.value)}
            placeholder="7501349029613"
            className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring dark:border-neutral-700 dark:bg-neutral-950"
            inputMode="numeric"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Supplier files (.xlsx, .xls, .csv) — multiple allowed</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            onChange={e => setFiles(e.target.files)}
            className="mt-1 block w-full cursor-pointer rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled={loading}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white outline-none ring-neutral-400 transition hover:opacity-95 disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
          <button
            type="button"
            onClick={() => { setSku(''); setFiles(null); }}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm outline-none transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800/50"
          >
            Reset
          </button>
        </div>
      </div>
    </form>
  );
}
