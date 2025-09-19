'use client';

import type { FileResult, CombineResponse, CombineCell } from '@/lib/types';
import { formatMXN } from '@/lib/price';

export default function SelectionDetails({ data, cell, expanded }: { data: { files: FileResult[] } | CombineResponse; cell: CombineCell; expanded?: boolean }) {
  if (!cell.ref) return <span className="text-xs text-neutral-500">—</span>;
  const fr = data.files[cell.ref.fileIdx];
  const m = fr?.matches[cell.ref.matchIdx];
  if (!fr || !m) return <span className="text-xs text-neutral-500">—</span>;

  const Body = (
    <div className="mt-2 rounded-lg border border-neutral-200 p-3 text-[11px] dark:border-neutral-800">
      <div className="font-mono">{fr.filename}{fr.sheetName ? ` — ${fr.sheetName}` : ''}</div>
      <div className="mt-1 text-neutral-600 dark:text-neutral-400">
        header row: {fr.headerRow} • rows scanned: {fr.stats.rowsScanned} • matches: {fr.stats.matches} • {fr.stats.parseMs}ms
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>Supplier: <span className="font-medium">{m.supplier || '—'}</span></div>
        <div>SKU: <span className="font-mono">{m.skuDetected}</span></div>
        <div>Selected price: <span className="font-semibold">{formatMXN(m.priceSelected)}</span></div>
        <div>Price source: <span className="font-mono">{m.priceColumnUsed || '—'}</span></div>
        <div>Row: <span className="font-mono">{m.rowIndex}</span></div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>Mapping confidence: <span className={
          fr.mapping.confidence === 'high' ? 'text-green-600' :
          fr.mapping.confidence === 'med' ? 'text-amber-600' : 'text-red-600'
        }>{fr.mapping.confidence}</span></div>
        <div>SKU cols: {fr.mapping.skuCols?.join?.(', ') || '—'}</div>
        <div>Price cols: {fr.mapping.priceCols?.join?.(', ') || '—'}</div>
        <div>Supplier cols: {fr.mapping.supplierCols?.join?.(', ') || '—'}</div>
        <div>Product cols: {fr.mapping.productNameCols?.join?.(', ') || '—'}</div>
        <div>Formula cols: {fr.mapping.formulaCols?.join?.(', ') || '—'}</div>
        <div>Lab cols: {fr.mapping.labCols?.join?.(', ') || '—'}</div>
      </div>
    </div>
  );

  if (expanded) {
    return (
      <div className="rounded-xl border border-neutral-200 p-4 text-xs dark:border-neutral-800">
        {Body}
      </div>
    );
  }

  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none rounded border border-neutral-300 px-2 py-1 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800/50">
        View
      </summary>
      {Body}
    </details>
  );
}
