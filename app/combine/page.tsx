'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Toaster } from 'sonner';
import type { CombineResponse, CombineRow, CombineCell } from '@/lib/types';
import CombineForm from '@/components/CombineForm';
import CombineMatrix from '@/components/CombineMatrix';
import BuyOrder from '@/components/BuyOrder';
import SelectionDetails from '@/components/SelectionDetails';

type SelectedKey = string;
const keyOf = (sku: string, filename: string) => `${sku}::${filename}`;

const RATIO_KEY = 'combine.split.ratio';
const SEL_KEY = 'combine.sel.keys';
const QTY_KEY = 'combine.order.qty';
const COMPACT_KEY = 'combine.ui.compact';

export default function CombinePage() {
  const [data, setData] = useState<CombineResponse | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Map<SelectedKey, { row: CombineRow; cell: CombineCell }>>(new Map());
  const [lastPick, setLastPick] = useState<{ row: CombineRow; cell: CombineCell } | null>(null);
  const [compact, setCompact] = useState<boolean>(false);

  // Block page scroll
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  // Resizable split with persistence
  const [ratio, setRatio] = useState(0.58);
  useEffect(() => {
    const raw = localStorage.getItem(RATIO_KEY);
    if (raw) {
      const r = Number(raw);
      if (!Number.isNaN(r) && r >= 0.2 && r <= 0.8) setRatio(r);
    }
    setCompact(localStorage.getItem(COMPACT_KEY) === '1');
  }, []);
  useEffect(() => { localStorage.setItem(RATIO_KEY, String(ratio)); }, [ratio]);
  useEffect(() => { localStorage.setItem(COMPACT_KEY, compact ? '1' : '0'); }, [compact]);

  // Restore selection + qty after data loads
  useEffect(() => {
    if (!data?.matrix?.length) return;
    const rawSel = localStorage.getItem(SEL_KEY);
    const rawQty = localStorage.getItem(QTY_KEY);
    if (rawSel) {
      try {
        const keys: string[] = JSON.parse(rawSel);
        // reconstruct from current matrix (only keep keys that exist)
        const m = new Map<SelectedKey, { row: CombineRow; cell: CombineCell }>();
        for (const r of data.matrix) {
          for (const c of r.prices) {
            const k = keyOf(r.sku, c.filename);
            if (keys.includes(k) && c.price != null) {
              m.set(k, { row: r, cell: c });
            }
          }
        }
        if (m.size) setSelected(m);
      } catch {}
    }
    if (rawQty) {
      try {
        const qtyObj = JSON.parse(rawQty);
        // qty is stored/used in BuyOrder component; nothing to do here
      } catch {}
    }
  }, [data]);

  // Persist selection keys on change
  useEffect(() => {
    const keys = Array.from(selected.keys());
    localStorage.setItem(SEL_KEY, JSON.stringify(keys));
  }, [selected]);

  // ---- Drag handle logic from your current file (unchanged) ----
  const draggingRef = useRef(false);
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const container = document.getElementById('right-split');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      let r = y / rect.height;
      r = Math.max(0.2, Math.min(0.8, r));
      setRatio(r);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onToggle = (row: CombineRow, cell: CombineCell) => {
    const k = keyOf(row.sku, cell.filename);
    setSelected(prev => {
      const next = new Map(prev);
      const removing = next.has(k);
      if (removing) next.delete(k); else next.set(k, { row, cell });
      if (removing && lastPick && keyOf(lastPick.row.sku, lastPick.cell.filename) === k) {
        setLastPick(null);
      } else if (!removing) {
        setLastPick({ row, cell });
      }
      return next;
    });
  };

  // If selection becomes empty by any means, clear diagnostics
  useEffect(() => {
    if (selected.size === 0 && lastPick) setLastPick(null);
  }, [selected.size, lastPick]);

  const clearSelection = () => {
    setSelected(new Map());
    setLastPick(null);
    localStorage.setItem(SEL_KEY, '[]');
  };

  const selectedSet = useMemo(() => new Set(Array.from(selected.keys())), [selected]);
  const selectedCount = selected.size;
  const hasMatrix = !!data?.matrix?.length;

  return (
    <main className="h-screen w-screen overflow-hidden">
      <Toaster richColors position="top-right" />
      <div className="grid h-full w-full grid-cols-4 gap-4 p-4">
        {/* LEFT COLUMN */}
        <aside className="col-span-1 flex h-full min-h-0 flex-col gap-4">
          <div className="flex-[3] min-h-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h1 className="text-sm font-semibold">Supplier files</h1>
                <label className="flex items-center gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={compact}
                    onChange={(e) => setCompact(e.target.checked)}
                    className="h-3.5 w-3.5 accent-black dark:accent-white"
                  />
                  Compact mode
                </label>
              </div>
            </div>
            <div className="h-[calc(100%-52px)] min-h-0 overflow-y-auto px-4 pb-4">
              <CombineForm
                onResultAction={setData}
                onQueryAction={setQ}
                showChosenFiles
                hideSearch
              />
            </div>
          </div>

          <div className="flex-[2] min-h-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Selection diagnostics</h2>
                <button
                  onClick={clearSelection}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                >
                  Clear selection
                </button>
              </div>
              <div className="h-[calc(100%-32px)] min-h-0 overflow-y-auto">
                {!lastPick || !data ? (
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    {hasMatrix ? 'Pick a price in the table to inspect its details.' : 'Upload files to start.'}
                  </div>
                ) : (
                  <SelectionDetails data={data} cell={lastPick.cell} expanded />
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT COLUMN with resizable split */}
        <section
          id="right-split"
          className="col-span-3 flex h-full min-h-0 flex-col rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40"
        >
          <div className="flex min-h-0 flex-col overflow-hidden p-4" style={{ flex: `0 0 ${ratio * 100}%` }}>
            <div className="mb-2">
              <h3 className="text-sm font-bold">Combined table</h3>
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                Click a price to add it to the Buy Order. Green = best per SKU.
              </p>
            </div>
            <div className="flex-1 min-h-0">
              <CombineMatrix
                data={data}
                query={q}
                selectedKeys={selectedSet}
                onToggleAction={onToggle}
                compact={compact}
              />
            </div>
          </div>

          <div onMouseDown={onDragStart} className="z-10 h-3 cursor-row-resize px-4" title="Drag to resize">
            <div className="h-[3px] w-full rounded-full bg-neutral-200 dark:bg-neutral-700" />
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden p-4" style={{ flex: `0 0 ${(1 - ratio) * 100}%` }}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">Buy Order</h3>
              <div className="flex items-center gap-2">
                <div className="text-[11px] text-neutral-600 dark:text-neutral-400">{selectedCount} selected</div>
                <button
                  onClick={clearSelection}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                >
                  Clear selection
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <BuyOrder
                selected={selected}
                data={data}
                compact={compact}
                onRemoveKeys={(keys) => {
                  setSelected(prev => {
                    const next = new Map(prev);
                    keys.forEach(k => next.delete(k));
                    return next;
                  });
                  if (lastPick && keys.includes(keyOf(lastPick.row.sku, lastPick.cell.filename))) {
                    setLastPick(null);
                  }
                  // also update persisted selection
                  const remaining = Array.from(selected.keys()).filter(k => !keys.includes(k));
                  localStorage.setItem('combine.sel.keys', JSON.stringify(remaining));
                }}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
