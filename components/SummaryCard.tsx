import { formatMXN } from '@/lib/price';
import type { UploadResponse } from '@/lib/types';
import { SECTION } from '@/lib/ui';

export default function SummaryCard({ data }: { data: UploadResponse | null }) {
  if (!data) return null;
  return (
    <div className={SECTION}>
      <h2 className="text-base font-semibold">Best price</h2>
      {data.best ? (
        <div className="mt-2">
          <div className="text-xl font-bold">{formatMXN(data.best.price)}</div>
          <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            SKU <span className="font-mono">{data.skuNormalized}</span> • Supplier:{' '}
            <span className="font-medium">{data.best.supplier || '—'}</span> • File:{' '}
            <span className="font-mono">{data.best.filename}</span>
          </div>
          {data.best.tie && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              Tie detected with {data.best.tie.length} supplier(s) at the same price.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">No matching rows found for this SKU.</div>
      )}
    </div>
  );
}
