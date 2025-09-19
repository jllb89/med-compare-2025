'use client';

import { useMemo, useState, useRef } from 'react';
import type { CombineResponse, CombineRow, CombineCell } from '@/lib/types';
import { formatMXN } from '@/lib/price';

type SelectedKey = string;
const keyOf = (sku: string, filename: string) => `${sku}::${filename}`;
const stripExt = (name: string) => name.replace(/\.[^.]+$/i, '');

export default function BuyOrder({
  selected,
  data,
  compact = false,
  onRemoveKeys,
}: {
  selected: Map<SelectedKey, { row: CombineRow; cell: CombineCell }>;
  data: CombineResponse | null;
  compact?: boolean;
  onRemoveKeys?: (keys: string[]) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const tableRef = useRef<HTMLTableElement | null>(null);

  const items = useMemo(() => Array.from(selected.entries()), [selected]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const anyChecked = items.some(([k]) => checked[k]);
  const allChecked = items.length > 0 && items.every(([k]) => !!checked[k]);

  // initialize qty=1 for new lines
  useMemo(() => {
    if (!items.length) return;
    const next = { ...qty };
    let changed = false;
    for (const [k] of items) {
      if (!next[k]) { next[k] = 1; changed = true; }
    }
    if (changed) setQty(next);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    let sum = 0;
    const lines = items.map(([k, { row, cell }]) => {
      const q = qty[k] ?? 1;
      const price = cell.price ?? 0;
      const line = q * price;
      sum += line;
      return { k, row, cell, q, line, note: note[k] ?? '' };
    });
    return { lines, sum };
  }, [items, qty, note]);

  if (!data) {
    return <div className="flex h-full items-center justify-center text-xs text-neutral-500">No data</div>;
  }

  const onChangeQty = (k: string, val: string) => {
    const n = Math.max(1, Math.min(9999, Number(val.replace(/[^\d]/g, '')) || 1));
    setQty((s) => ({ ...s, [k]: n }));
  };
  const onChangeNote = (k: string, v: string) => setNote((s) => ({ ...s, [k]: v }));

  const exportXLSX = async () => {
    const XLSX = await import('xlsx');
    const rows = totals.lines.map(({ row, cell, q, line, note }) => ({
      SKU: row.sku,
      Product: row.productName || '',
      Supplier: cell.supplier || stripExt(cell.filename),
      Price: cell.price ?? 0,
      Qty: q,
      'Line total': line,
      Note: note || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buy Order');
    XLSX.writeFile(wb, `buy-order-${Date.now()}.xlsx`);
  };

  const exportPDF = () => {
    // Print-to-PDF: open a clean window with the table HTML and trigger print
    const w = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768');
    if (!w || !tableRef.current) return;
    const tableHTML = tableRef.current.outerHTML;
    w.document.write(`
      <html>
        <head>
          <title>Buy Order</title>
          <style>
            body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h2>Buy Order</h2>
          ${tableHTML}
          <h3 style="text-align:right">Total: ${formatMXN(totals.sum)}</h3>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    w.document.close();
  };

  const pad = compact ? 'px-2 py-1' : 'px-3 py-2';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {totals.lines.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-neutral-500">
          Pick prices in the table to populate the order.
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs text-neutral-600 dark:text-neutral-400">
              {totals.lines.length} item(s) &nbsp;•&nbsp; Total: <span className="font-semibold">{formatMXN(totals.sum)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!onRemoveKeys) return;
                  const keys = items.filter(([k]) => checked[k]).map(([k]) => k);
                  if (keys.length) onRemoveKeys(keys);
                }}
                disabled={!anyChecked}
                className={`rounded-md border px-2 py-1 text-xs ${anyChecked ? 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900' : 'cursor-not-allowed border-neutral-200/60 bg-white/60 text-neutral-400 dark:border-neutral-700/60 dark:bg-neutral-900/60'}`}
                title={anyChecked ? 'Remove selected from order' : 'Select rows to delete'}
              >
                Delete selected
              </button>
              <button
                onClick={exportXLSX}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              >
                Export XLSX
              </button>
              <button
                onClick={exportPDF}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              >
                Export PDF
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto rounded-lg">
            <table ref={tableRef} className="min-w-[1100px] w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-100/70 dark:border-neutral-800 dark:bg-neutral-900/60">
                  <th className={`${pad} text-left font-medium w-[28px]`}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-black dark:accent-white"
                      checked={allChecked}
                      onChange={(e) => {
                        const val = e.target.checked;
                        const next: Record<string, boolean> = { ...checked };
                        for (const [k] of items) next[k] = val;
                        setChecked(next);
                      }}
                      aria-label="Select all rows"
                    />
                  </th>
                  <th className={`${pad} text-left font-medium`}>SKU</th>
                  <th className={`${pad} text-left font-medium w-[240px]`}>Product</th>
                  <th className={`${pad} text-left font-medium`}>Supplier</th>
                  <th className={`${pad} text-left font-medium`}>Price</th>
                  <th className={`${pad} text-left font-medium`}>Qty</th>
                  <th className={`${pad} text-left font-medium`}>Line total</th>
                  <th className={`${pad} text-left font-medium w-[220px]`}>Note</th>
                </tr>
              </thead>
              <tbody>
                {totals.lines.map(({ k, row, cell, q, line, note: lineNote }) => (
                  <tr key={k} className="border-b border-neutral-200 last:border-0 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <td className={pad}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-black dark:accent-white"
                        checked={!!checked[k]}
                        onChange={(e) => setChecked((s) => ({ ...s, [k]: e.target.checked }))}
                        aria-label={`Select ${row.sku}`}
                      />
                    </td>
                    <td className={pad + ' font-mono'}>{row.sku}</td>
                    <td className={pad}>
                      <span className="inline-block max-w-[240px] truncate align-bottom" title={row.productName || ''}>
                        {row.productName || '—'}
                      </span>
                    </td>
                    <td className={pad}>{cell.supplier || stripExt(cell.filename)}</td>
                    <td className={pad}>{formatMXN(cell.price)}</td>
                    <td className={pad}>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={q}
                        onChange={(e) => onChangeQty(k, e.target.value)}
                        className="w-16 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-right outline-none focus:ring dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </td>
                    <td className={pad + ' font-semibold'}>{formatMXN(line)}</td>
                    <td className={pad}>
                      <input
                        value={lineNote}
                        onChange={(e) => onChangeNote(k, e.target.value)}
                        placeholder="Special instructions…"
                        className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:ring dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    </td>
                    {/* File/Sheet/Row columns removed for cleaner buy order */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
