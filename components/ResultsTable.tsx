// components/ResultsTable.tsx
'use client';

import { useMemo } from 'react';
import { formatMXN } from '@/lib/price';
import type { UploadResponse, FileResult } from '@/lib/types';
import { TABLE_WRAP, SECTION } from '@/lib/ui';

type FlatRow = {
  supplier?: string;
  price: number | null;
  priceColumnUsed?: string;
  filename: string;
  sheetName?: string;
  rowIndex: number;
  selectionReason?: 'band' | 'keyword' | 'min';
};

function ReasonBadge({ reason }: { reason?: 'band' | 'keyword' | 'min' }) {
  if (!reason) return null;
  const label = reason === 'band' ? 'band' : reason === 'keyword' ? 'keyword' : 'min';
  const cls =
    reason === 'band'
      ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200'
      : reason === 'keyword'
      ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200'
      : 'bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function ResultsTable({ data }: { data: UploadResponse | null }) {
  const rows = useMemo<FlatRow[]>(() => {
    if (!data) return [];
    const out: FlatRow[] = [];
    for (const f of data.files) {
      for (const m of f.matches) {
        out.push({
          supplier: m.supplier,
          price: m.priceSelected,
          priceColumnUsed: m.priceColumnUsed,
          filename: f.filename,
          sheetName: f.sheetName,
          rowIndex: m.rowIndex,
          selectionReason: m.selectionReason,
        });
      }
    }
    return out.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  }, [data]);

  if (!data) return null;

  return (
    <div className="grid gap-4">
      {/* Table card */}
      <div className={TABLE_WRAP}>
        <div className="mb-3">
          <h3 className="text-base font-semibold">Matching results</h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Found {rows.length} rows across {data.files.length} sheet(s).
          </p>
        </div>

        <table className="min-w-[880px] w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-100/70 dark:border-neutral-800 dark:bg-neutral-900/60">
              <th className="px-3 py-2 text-left font-medium">Supplier</th>
              <th className="px-3 py-2 text-left font-medium">Selected price (MXN)</th>
              <th className="px-3 py-2 text-left font-medium">Price source</th>
              <th className="px-3 py-2 text-left font-medium">Reason</th>
              <th className="px-3 py-2 text-left font-medium">File</th>
              <th className="px-3 py-2 text-left font-medium">Sheet</th>
              <th className="px-3 py-2 text-left font-medium">Row</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className="border-b border-neutral-200 last:border-0 hover:bg-neutral-100/60 dark:border-neutral-800 dark:hover:bg-neutral-800/40"
              >
                <td className="px-3 py-2">{r.supplier || '—'}</td>
                <td className="px-3 py-2 font-semibold">{formatMXN(r.price)}</td>
                <td className="px-3 py-2">{r.priceColumnUsed || '—'}</td>
                <td className="px-3 py-2"><ReasonBadge reason={r.selectionReason} /></td>
                <td className="px-3 py-2 font-mono">{r.filename}</td>
                <td className="px-3 py-2">{r.sheetName || '—'}</td>
                <td className="px-3 py-2 font-mono">{r.rowIndex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Diagnostics per file */}
      <div className={SECTION}>
        <h4 className="mb-2 text-sm font-medium">Diagnostics</h4>

        {data.files.map((f: FileResult, idx: number) => {
          const counts = f.matches.reduce(
            (acc: { band: number; keyword: number; min: number }, m) => {
              if (m.selectionReason === 'band') acc.band++;
              else if (m.selectionReason === 'keyword') acc.keyword++;
              else if (m.selectionReason === 'min') acc.min++;
              return acc;
            },
            { band: 0, keyword: 0, min: 0 }
          );

          return (
            <div
              key={`${f.filename}-${f.sheetName ?? idx}`}
              className="mb-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm last:mb-0 dark:border-neutral-800 dark:bg-neutral-900/40"
            >
              <div className="font-mono text-xs">
                {f.filename}{f.sheetName ? ` — ${f.sheetName}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                header row: {f.headerRow} • rows scanned: {f.stats.rowsScanned} • matches: {f.stats.matches} • {f.stats.parseMs}ms
              </div>

              {(counts.band + counts.keyword + counts.min) > 0 && (
                <div className="mt-2 text-[11px]">
                  <span className="mr-2">Selected by:</span>
                  {counts.band > 0 && (
                    <span className="mr-2 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
                      band × {counts.band}
                    </span>
                  )}
                  {counts.keyword > 0 && (
                    <span className="mr-2 rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-900 dark:bg-blue-900/30 dark:text-blue-200">
                      keyword × {counts.keyword}
                    </span>
                  )}
                  {counts.min > 0 && (
                    <span className="mr-2 rounded-full bg-neutral-200 px-2 py-0.5 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-200">
                      min × {counts.min}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <div>
                  Mapping confidence:{' '}
                  <span
                    className={
                      f.mapping.confidence === 'high'
                        ? 'text-green-600'
                        : f.mapping.confidence === 'med'
                        ? 'text-amber-600'
                        : 'text-red-600'
                    }
                  >
                    {f.mapping.confidence}
                  </span>
                </div>
                <div>SKU cols: {f.mapping.skuCols?.join?.(', ') || '—'}</div>
                <div>Price cols: {f.mapping.priceCols?.join?.(', ') || '—'}</div>
                <div>Supplier cols: {f.mapping.supplierCols?.join?.(', ') || '—'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
