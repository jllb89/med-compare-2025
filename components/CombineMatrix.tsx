'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { XCircle, ChevronDown, Check } from 'lucide-react';
import type { CombineResponse, CombineRow, CombineCell } from '@/lib/types';
import { formatMXN } from '@/lib/price';
import { computeBand, flaggedOutlier } from '@/lib/priceGuard';
import { normalizeSupplier } from '@/lib/suppliers';

type SelectedKey = string;
const keyOf = (sku: string, filename: string) => `${sku}::${filename}`;
const stripExt = (name: string) => name.replace(/\.[^.]+$/i, '');

export default function CombineMatrix({
  data,
  query,
  selectedKeys,
  onToggleAction,
  compact = false,
}: {
  data: CombineResponse | null;
  query: string;
  selectedKeys: Set<string>;
  onToggleAction: (row: CombineRow, cell: CombineCell) => void;
  compact?: boolean;
}) {
  const [localQuery, setLocalQuery] = useState(query ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce local input before filtering; require at least 3 characters
  useEffect(() => {
    const q = (localQuery || '').trim();
    if (q.length < 3) { setDebouncedQuery(''); return; }
    const id = setTimeout(() => setDebouncedQuery(q), 400);
    return () => clearTimeout(id);
  }, [localQuery]);

  // Determine column headers (defensive)
  const fileNames = useMemo(() => {
    if (!data?.matrix?.length) return [];
    const first = data.matrix[0];
    return Array.isArray(first?.prices) ? first.prices.map((c) => c.filename) : [];
  }, [data]);
  const displayFileNames = useMemo(() => fileNames.map(stripExt), [fileNames]);

  // Per-file price column override: filename -> header or null for auto
  const [priceOverrides, setPriceOverrides] = useState<Record<string, string | null>>({});
  const [openMenu, setOpenMenu] = useState<number | null>(null); // index of open header menu
  const menuAnchorRef = useRef<HTMLElement | null>(null);

  // Close dropdown when clicking outside of the current open header/menu
  useEffect(() => {
    if (openMenu == null) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const anchor = menuAnchorRef.current;
      const target = e.target as Node | null;
      if (!anchor || !target) return;
      if (!anchor.contains(target)) setOpenMenu(null);
    };
    document.addEventListener('pointerdown', onDocPointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [openMenu]);

  // Close on Escape regardless of focus target when a menu is open
  useEffect(() => {
    if (openMenu == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openMenu]);

  // Build helper maps for quick access
  const filesByName = useMemo(() => {
    const map = new Map<string, number[]>();
    (data?.files || []).forEach((fr, idx) => {
      const arr = map.get(fr.filename) || [];
      arr.push(idx);
      map.set(fr.filename, arr);
    });
    return map;
  }, [data]);

  // Collect candidate headers per uploaded filename (across its sheets)
  const headerOptionsByFile = useMemo(() => {
    const m = new Map<string, string[]>();
    filesByName.forEach((idxs, fname) => {
      const set = new Set<string>();
      idxs.forEach((i) => {
        const fr = data!.files[i];
        fr.matches.forEach(mt => {
          Object.keys(mt.priceCandidates || {}).forEach(h => set.add(h));
        });
      });
      m.set(fname, Array.from(set).sort());
    });
    return m;
  }, [data, filesByName]);

  // Show all rows that appeared in uploads (even if all prices are null)
  // Search matches product name OR SKU
  const rows = useMemo(() => {
    if (!data?.matrix) return [];
    const q = (debouncedQuery || '').toLowerCase();

    const filtered = data.matrix.filter((r) =>
      q
        ? (r.productName || '').toLowerCase().includes(q) ||
          (r.sku || '').toLowerCase().includes(q)
        : true
    );

    return filtered.map((r) => {
      const values = (r.prices || [])
        .map((c) => (c.price ?? null))
        .filter((v): v is number => v != null);
      const band = computeBand(values);
      return { ...r, _band: band } as CombineRow & { _band: ReturnType<typeof computeBand> };
    });
  }, [data, debouncedQuery]);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        Upload files to build the matrix.
      </div>
    );
  }

  const onClickPrice = (row: CombineRow, cell: CombineCell) => {
    if (cell.price == null) return; // empty cells not selectable
    onToggleAction(row, cell);
  };

  const colCount = 4 + displayFileNames.length;

  // Compact visual tuning
  const cellPad = compact ? 'px-1.5 py-1' : 'px-3 py-2';
  const tableText = compact ? 'text-[10.5px] leading-4' : 'text-xs';
  const rowHover = 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40';

  // Truncation widths (more aggressive in compact)
  // Widths match header widths minus horizontal padding so content never spills into next column
  // Non-compact cellPad px-3 => 24px total; Compact px-1.5 => 12px total
  const wProduct = compact ? 'w-[180px]' : 'w-[216px]'; // header 240 - 24
  const wFormula = compact ? 'w-[150px]' : 'w-[176px]'; // header 200 - 24
  const wLab = compact ? 'w-[110px]' : 'w-[126px]';     // header 150 - 24
  // Fixed width for each file column so names don't change widths per column
  const wFileCol = compact ? 'w-[140px]' : 'w-[170px]';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Scroll region with sticky thead (search + columns) */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg">
  <table className={`min-w-[1100px] w-full table-fixed ${tableText}`}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-white/90 backdrop-blur dark:bg-neutral-900/80">
              <th colSpan={colCount} className="border-b border-neutral-200 p-2 dark:border-neutral-800">
                <div className="relative">
                  <input
                    value={localQuery}
                    onChange={(e) => setLocalQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' && localQuery) { setLocalQuery(''); setDebouncedQuery(''); }
                      if (e.key === 'Enter') {
                        const q = (localQuery || '').trim();
                        setDebouncedQuery(q.length >= 3 ? q : '');
                      }
                    }}
                    placeholder="Search by product name or SKU…"
                    className={`w-full rounded-md border border-neutral-200 bg-white px-3 pr-9 ${
                      compact ? 'py-1.5 text-[11px]' : 'py-2 text-xs'
                    } outline-none focus:ring dark:border-neutral-700 dark:bg-neutral-950`}
                  />
                  {localQuery ? (
                    <button
                      type="button"
                      onClick={() => { setLocalQuery(''); setDebouncedQuery(''); }}
                      aria-label="Clear search"
                      className="absolute inset-y-0 right-2 flex items-center text-neutral-400 hover:text-neutral-600 focus:outline-none dark:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      <XCircle size={16} />
                    </button>
                  ) : null}
                </div>
              </th>
            </tr>
            <tr className="border-b border-neutral-200 bg-neutral-100/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
              <th className={`${cellPad} text-left font-medium`}>SKU</th>
              <th className={`${cellPad} text-left font-medium w-[240px]`}>Product</th>
              <th className={`${cellPad} text-left font-medium w-[200px]`}>Formula</th>
              <th className={`${cellPad} text-left font-medium w-[150px]`}>Lab</th>
              {displayFileNames.map((fnBase, colIdx) => {
                const fullName = fileNames[colIdx];
                const current = priceOverrides[fullName] ?? null;
                const opts = headerOptionsByFile.get(fullName) || [];
                return (
                  <th
                    key={`${fnBase}-${colIdx}`}
                    className={`${cellPad} text-left font-medium ${wFileCol} relative`}
                    ref={openMenu === colIdx ? (el) => { menuAnchorRef.current = el as unknown as HTMLElement; } : null}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenMenu(openMenu === colIdx ? null : colIdx)}
                      onKeyDown={(e) => { if (e.key === 'Escape') setOpenMenu(null); }}
                      className="group inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-neutral-200/60 dark:hover:bg-neutral-800/50"
                      title={`Select price column for ${fullName}`}
                    >
                      <span
                        className="block overflow-hidden whitespace-nowrap pr-1"
                        style={{ WebkitMaskImage: 'linear-gradient(to right, black, black calc(100% - 14px), transparent)', maskImage: 'linear-gradient(to right, black, black calc(100% - 14px), transparent)' }}
                      >
                        {fnBase}
                      </span>
                      <ChevronDown size={14} className="shrink-0 text-neutral-500 group-hover:text-neutral-700 dark:text-neutral-400 dark:group-hover:text-neutral-200" />
                    </button>

                    {openMenu === colIdx && (
                      <div className="absolute right-1 top-full z-20 mt-1 w-[220px] overflow-hidden rounded-md border border-neutral-200 bg-white p-1 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                        <button
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          onClick={() => { setPriceOverrides(prev => ({ ...prev, [fullName]: null })); setOpenMenu(null); }}
                        >
                          <span className="inline-flex h-4 w-4 items-center justify-center">
                            {current === null ? <Check size={14} /> : null}
                          </span>
                          Auto (best)
                        </button>
                        <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />
                        <div className="max-h-56 overflow-auto">
                          {opts.length === 0 ? (
                            <div className="px-2 py-1.5 text-neutral-500">No headers detected</div>
                          ) : (
                            opts.map(h => (
                              <button
                                key={h}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                onClick={() => { setPriceOverrides(prev => ({ ...prev, [fullName]: h })); setOpenMenu(null); }}
                                title={h}
                              >
                                <span className="inline-flex h-4 w-4 items-center justify-center">{current === h ? <Check size={14} /> : null}</span>
                                <span className="block max-w-[160px] overflow-hidden whitespace-nowrap" style={{ WebkitMaskImage: 'linear-gradient(to right, black, black calc(100% - 12px), transparent)', maskImage: 'linear-gradient(to right, black, black calc(100% - 12px), transparent)' }}>{h}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((r, ridx) => {
              // Build display cells per file, applying overrides if any
              const displayCells = r.prices.map((cell, i) => {
                const fileName = fileNames[i];
                const override = priceOverrides[fileName] ?? null;
                if (!override) return cell;
                // Compute best price across sheets for this SKU using the override header
                const idxs = filesByName.get(fileName) || [];
                let best: CombineCell | null = null;
                idxs.forEach(fileIdx => {
                  const fr = data!.files[fileIdx];
                  fr.matches.forEach((m, mIdx) => {
                    if (m.skuDetected !== r.sku) return;
                    const v = m.priceCandidates?.[override] ?? null;
                    if (v != null) {
                      const c: CombineCell = {
                        filename: fileName,
                        sheetName: fr.sheetName,
                        supplier: normalizeSupplier(m.supplier) ?? m.supplier ?? undefined,
                        price: v,
                        priceColumnUsed: override,
                        rowIndex: m.rowIndex,
                        ref: { fileIdx, matchIdx: mIdx },
                      };
                      if (!best || (c.price != null && c.price < (best.price ?? Infinity))) best = c;
                    }
                  });
                });
                return best ?? cell;
              });

              // Determine best index among display cells
              let bestIdx: number | undefined = undefined;
              let bestPrice = Number.POSITIVE_INFINITY;
              displayCells.forEach((c, i) => { if (c.price != null && c.price < bestPrice) { bestPrice = c.price; bestIdx = i; } });
              const band = (r as any)._band;
              const hasAnyPrice = displayCells.some((c) => c.price != null);
              const bandPct = band.pct > 0 ? Math.round(band.pct * 100) : 0;

              return (
                <tr
                  key={ridx}
                  className={`border-b border-neutral-200 last:border-0 dark:border-neutral-800 ${rowHover} ${
                    hasAnyPrice ? '' : 'opacity-60'
                  }`}
                >
                  <td className={`${cellPad} font-mono`}>
                    <div className="flex items-center gap-2">
                      <span>{r.sku}</span>
                      {/* Band chip */}
                      {band && (
                        <span
                          className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-[2px] text-[10px] font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
                          title={`${band.method} band • low ${formatMXN(band.low)} • median ${formatMXN(
                            band.median
                          )} • high ${formatMXN(band.high)}`}
                        >
                          band ±{bandPct}%
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Product (truncate + tooltip) */}
                  <td className={`${cellPad} overflow-hidden`}>
                    <span
                      className={`block ${wProduct} overflow-hidden whitespace-nowrap pr-4 align-bottom`}
                      title={r.productName || ''}
                      style={{
                        WebkitMaskImage:
                          'linear-gradient(to right, black 0, black calc(100% - 56px), rgba(0,0,0,0.55) calc(100% - 32px), transparent)',
                        maskImage:
                          'linear-gradient(to right, black 0, black calc(100% - 56px), rgba(0,0,0,0.55) calc(100% - 32px), transparent)'
                      }}
                    >
                      {r.productName || '(sin nombre)'}
                    </span>
                  </td>

                  {/* Formula (truncate + tooltip) */}
                  <td className={`${cellPad} overflow-hidden`}>
                    <span
                      className={`inline-block ${wFormula} overflow-hidden whitespace-nowrap pr-3 align-bottom`}
                      title={r.formula || ''}
                      style={{
                        WebkitMaskImage:
                          'linear-gradient(to right, black 0, black calc(100% - 48px), rgba(0,0,0,0.55) calc(100% - 28px), transparent)',
                        maskImage:
                          'linear-gradient(to right, black 0, black calc(100% - 48px), rgba(0,0,0,0.55) calc(100% - 28px), transparent)'
                      }}
                    >
                      {r.formula || '—'}
                    </span>
                  </td>

                  <td className={`${cellPad} overflow-hidden`}>
                    <span className={`inline-block ${wLab} overflow-hidden whitespace-nowrap pr-2 align-bottom`} title={r.lab || ''}>
                      {r.lab || '—'}
                    </span>
                  </td>

                  {/* Prices */}
                  {displayCells.map((c, i) => {
                    const k = keyOf(r.sku, c.filename);
                    const isBest = bestIdx != null && i === bestIdx && c.price != null;
                    const isSel = selectedKeys.has(k);
                    const isEmpty = c.price == null;

                    const supplier = normalizeSupplier(c.supplier) ?? c.supplier ?? undefined;

                    const baseBtn =
                      'w-full rounded-md border text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 ' +
                      (compact ? 'px-1.5 py-1' : 'px-2 py-1.5');

                    // border color (emerald for best; otherwise selected/neutral)
                    const borderColorClass = isBest
                      ? 'border-emerald-200 dark:border-emerald-700'
                      : isSel
                        ? 'border-black dark:border-white'
                        : 'border-neutral-200 dark:border-neutral-700';

                    // Best pill with emerald border + white-on-hover text
                    const bestPill =
                      'rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-100 to-emerald-50 text-emerald-900 ' +
                      'shadow-sm hover:from-emerald-200 hover:to-emerald-200 hover:text-white ' +
                      'dark:border-emerald-700 dark:from-emerald-950/70 dark:to-emerald-900/60 dark:text-emerald-100 dark:hover:text-white';

                    const nonBestBg = 'bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800/60';
                    const disabledLook = 'cursor-not-allowed text-neutral-400 bg-neutral-50 dark:bg-neutral-900/40';

                    // Outlier muted look
                    const isOut = flaggedOutlier(c.price ?? null, band);
                    const outlierRing = isOut && !isBest ? 'ring-1 ring-amber-300/50 dark:ring-amber-400/30' : '';

                    const bgClass = isEmpty ? disabledLook : isBest ? bestPill : `${nonBestBg} ${outlierRing}`;

                    return (
                      <td key={i} className={`${cellPad} ${wFileCol}`}>
                        <button
                          onClick={() => onClickPrice(r, c)}
                          disabled={isEmpty}
                          className={`${baseBtn} ${borderColorClass} ${bgClass}`}
                          title={
                            isEmpty
                              ? 'No in-band price'
                              : [
                                  c.sheetName ? `Sheet: ${c.sheetName}` : null,
                                  c.priceColumnUsed ? `Column: ${c.priceColumnUsed}` : null,
                                  typeof c.rowIndex === 'number' ? `Row: ${c.rowIndex}` : null,
                                  isBest ? 'Best in SKU' : null,
                                  isOut ? 'Flagged outlier' : null,
                                ]
                                  .filter(Boolean)
                                  .join(' • ')
                          }
                          aria-label={isBest ? 'Best price' : c.price == null ? 'No price' : 'Price'}
                        >
                          {isBest ? (
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-emerald-600/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200">
                                Best
                              </span>
                              <span className="font-semibold">{formatMXN(c.price)}</span>
                              {supplier ? (
                                <span
                                  className="ml-auto max-w-[55%] overflow-hidden whitespace-nowrap pr-1 text-[11px] text-emerald-800/80 dark:text-emerald-200/80"
                                  style={{
                                    WebkitMaskImage: 'linear-gradient(to right, black, black calc(100% - 16px), transparent)',
                                    maskImage: 'linear-gradient(to right, black, black calc(100% - 16px), transparent)'
                                  }}
                                >
                                  {supplier}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div className="flex min-w-0 items-center gap-2">
                              <span>{formatMXN(c.price)}</span>
                              {supplier ? (
                                <span
                                  className="ml-auto max-w-[55%] overflow-hidden whitespace-nowrap pr-1 text-[11px] text-neutral-500"
                                  style={{
                                    WebkitMaskImage: 'linear-gradient(to right, black, black calc(100% - 16px), transparent)',
                                    maskImage: 'linear-gradient(to right, black, black calc(100% - 16px), transparent)'
                                  }}
                                >
                                  {supplier}
                                </span>
                              ) : null}
                              {isSel ? (
                                <span className="ml-2 rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-900 dark:bg-blue-900/40 dark:text-blue-200">
                                  selected
                                </span>
                              ) : null}
                            </div>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Helpful empty state if search hides everything */}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="p-6 text-center text-neutral-500">
                  No rows match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
