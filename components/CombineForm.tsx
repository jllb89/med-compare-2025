'use client';

import { useState, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import type { CombineResponse } from '@/lib/types';

const ACCEPT = '.xlsx,.xls,.csv';

export default function CombineForm({
  onResultAction,
  onQueryAction,
  showChosenFiles,
  hideSearch,
}: {
  onResultAction: (res: CombineResponse) => void;
  onQueryAction: (q: string) => void;
  showChosenFiles?: boolean;
  hideSearch?: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const nameRegex = useMemo(
    () => new RegExp(`(${ACCEPT.replace(/\./g, '\\.').replace(/,/g, '|')})$`, 'i'),
    []
  );

  const addFiles = (incoming: File[]) => {
    if (!incoming.length) return;
    const valid = incoming.filter((f) => nameRegex.test(f.name));
    // de-dupe by name, latest wins
    const map = new Map<string, File>();
    [...files, ...valid].forEach((f) => map.set(f.name, f));
    const next = Array.from(map.values());
    setFiles(next);
    // prune selection of removed items (if any)
    setSelected((prev) => new Set([...prev].filter((n) => next.find((f) => f.name === n))));
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setSelected((prev) => {
      const s = new Set(prev);
      s.delete(name);
      return s;
    });
  };

  const removeSelected = () => {
    if (selected.size === 0) return;
    setFiles((prev) => prev.filter((f) => !selected.has(f.name)));
    setSelected(new Set());
    setLastIndex(null);
  };

  const onBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files || []));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const toggleOne = (idx: number, shiftKey: boolean) => {
    const fname = files[idx]?.name;
    if (!fname) return;

    setSelected((prev) => {
      const next = new Set(prev);

      // Shift range selection
      if (shiftKey && lastIndex != null) {
        const [start, end] = idx > lastIndex ? [lastIndex, idx] : [idx, lastIndex];
        for (let i = start; i <= end; i++) next.add(files[i].name);
      } else {
        // Toggle single
        if (next.has(fname)) next.delete(fname);
        else next.add(fname);
      }

      return next;
    });

    setLastIndex(idx);
  };

  const toggleAll = () => {
    if (selected.size === files.length) {
      setSelected(new Set());
      setLastIndex(null);
    } else {
      setSelected(new Set(files.map((f) => f.name)));
      setLastIndex(null);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) {
      toast.error('Attach files');
      return;
    }
    setLoading(true);
    toast.info('Combining tables…');

    const fd = new FormData();
    for (const f of files) fd.append('files', f);

    const res = await fetch('/api/combine', { method: 'POST', body: fd });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast.error(json?.error || 'Failed to combine');
      return;
    }
    toast.success('Ready');
    onResultAction(json as CombineResponse);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      {/* Dropzone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          'rounded-xl border border-dashed p-4 text-xs transition',
          dragOver
            ? 'border-emerald-400 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-900/20'
            : 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Drag & drop supplier files</div>
            <div className="mt-0.5 text-[11px] text-neutral-500">Accepted: .xlsx, .xls, .csv</div>
          </div>
          <div className="flex items-center gap-2">
            {files.length > 0 && (
              <>
                <label className="inline-flex select-none items-center gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-black dark:accent-white"
                    checked={selected.size === files.length}
                    onChange={toggleAll}
                    aria-label="Select all files"
                  />
                  Select all
                </label>
                <button
                  type="button"
                  onClick={removeSelected}
                  disabled={selected.size === 0}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-medium disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
                  title="Remove selected"
                >
                  Remove selected
                </button>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              onChange={onBrowse}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-900"
            >
              Browse…
            </button>
          </div>
        </div>

        {showChosenFiles && files.length > 0 && (
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1 text-[11px] text-neutral-700 dark:text-neutral-300">
            {files.map((f, idx) => {
              const isChecked = selected.has(f.name);
              return (
                <li
                  key={f.name}
                  className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-1 last:border-0 dark:border-neutral-800"
                  title={f.name}
                >
                  <button
                    type="button"
                    onClick={(e) => toggleOne(idx, (e as React.MouseEvent).shiftKey)}
                    className="group flex min-w-0 flex-1 items-center gap-2"
                  >
                    <input
                      readOnly
                      tabIndex={-1}
                      checked={isChecked}
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-black dark:accent-white"
                    />
                    <span className={`truncate ${isChecked ? 'font-medium' : ''}`}>{f.name}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeFile(f.name)}
                    aria-label={`Remove ${f.name}`}
                    className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    title="Remove"
                  >
                    {/* Trash icon */}
                    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                      <path d="M9.5 4h5M4 7h16M18 7l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7m3 0V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!hideSearch && (
        <div>
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Search by product name (filters rows)</label>
          <input
            onChange={(e) => onQueryAction(e.target.value)}
            placeholder="amoxicilina…"
            className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          disabled={loading}
          className="h-[38px] rounded-lg bg-black px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {loading ? 'Processing…' : 'Combine'}
        </button>
      </div>
    </form>
  );
}
